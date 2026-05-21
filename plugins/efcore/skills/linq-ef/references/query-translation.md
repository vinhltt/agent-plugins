# EF Core LINQ — Query Translation

**Entity model:** `Blog (Id, Title, Url)` → `Post (Id, BlogId, Title, Content, PublishedAt, IsPublished)` → `Comment (Id, PostId, Author, Body, CreatedAt)` | DbContext: `BlogContext`

---

## 1. LINQ → SQL Pipeline

```
LINQ expression tree
       ↓
  Query compilation (cached by shape)
       ↓
  Provider translation (SQL Server / SQLite / PG)
       ↓
  SQL string + parameters
       ↓
  ADO.NET command execution
```

EF Core compiles the expression tree, not a delegate. That's why lambdas passed to `.Where()` must be translatable — the provider walks the AST, not the IL.

The compiled query plan is cached per query shape (structure), not per parameter value. Changing a parameter (`.Where(p => p.Id == id)`) reuses the cache. Changing structure (conditional `.Include()` calls) creates a new cache entry.

---

## 2. SQL Inspection with `ToQueryString()` [EF 5+]

Inspect generated SQL **without executing** the query. Works on any `IQueryable<T>`.

```csharp
var query = ctx.Posts
    .Where(p => p.IsPublished && p.BlogId == blogId)
    .Select(p => new { p.Title, p.PublishedAt })
    .OrderBy(p => p.PublishedAt);

Console.WriteLine(query.ToQueryString());
// Output:
// SELECT p.Title, p.PublishedAt
// FROM Posts AS p
// WHERE p.IsPublished = 1 AND p.BlogId = @__blogId_0
// ORDER BY p.PublishedAt
```

Use this in unit tests to assert SQL shape without hitting a real database.

---

## 3. Logging Setup

Log all SQL at `Debug` level via the built-in log category:

```csharp
// appsettings.Development.json
{
  "Logging": {
    "LogLevel": {
      "Microsoft.EntityFrameworkCore.Database.Command": "Information"
    }
  }
}
```

**Serilog** — map EF Core source to a structured sink:

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Information)
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}")
    .CreateLogger();
```

**Parameter values** (off by default — do not enable in production):

```csharp
options.EnableSensitiveDataLogging(); // shows @p0 = 'actual value'
```

---

## 4. `TagWith()` — SQL Comments for Tracing

Embeds a comment into the SQL string — survives to the database log and slow-query monitor.

```csharp
var posts = await ctx.Posts
    .TagWith("GetPublishedPostsByBlog")   // appears as /* GetPublishedPostsByBlog */ in SQL
    .Where(p => p.IsPublished && p.BlogId == blogId)
    .ToListAsync();
// SQL: /* GetPublishedPostsByBlog */
//      SELECT ... FROM Posts WHERE IsPublished = 1 AND BlogId = @p0
```

Stack multiple tags: `.TagWith("endpoint:GET /blogs/{id}/posts").TagWith("user:{userId}")`.
Invaluable when correlating application traces to database slow-query logs.

---

## 5. Client-Side Evaluation

EF Core 3.0+ **throws** `InvalidOperationException` when a LINQ expression cannot be translated to SQL (previously silently evaluated client-side — a silent N+1 footgun).

**What triggers it:**

```csharp
// THROWS: MyCustomMethod is a local C# function — no SQL equivalent
var posts = await ctx.Posts
    .Where(p => MyCustomMethod(p.Title))  // InvalidOperationException at runtime
    .ToListAsync();
```

**Safe fallback** — explicit `AsEnumerable()` boundary marks the client-side split:

```csharp
var posts = await ctx.Posts
    .Where(p => p.IsPublished)           // translated → SQL WHERE
    .AsAsyncEnumerable()                 // boundary: stream rows from DB
    .WhereAwait(async p => await MyCustomCheckAsync(p.Title))  // client-side filter
    .ToListAsync();
```

Minimize rows crossing the boundary — apply all translatable predicates before `.AsEnumerable()`.

---

## 6. When Translation Fails — Raw SQL Fallback

Use `FromSqlInterpolated` for queries that LINQ cannot express. Result composes with LINQ.

```csharp
// Safe: parameters are automatically parameterized (no injection risk)
var posts = await ctx.Posts
    .FromSqlInterpolated($"SELECT * FROM Posts WHERE CONTAINS(Content, {searchTerm})")
    .Where(p => p.IsPublished)           // LINQ WHERE appended after the CTE
    .OrderBy(p => p.PublishedAt)
    .ToListAsync();
// SQL: SELECT ... FROM (SELECT * FROM Posts WHERE CONTAINS(Content, @p0))
//      WHERE IsPublished = 1 ORDER BY PublishedAt
```

`FromSqlRaw` accepts format strings — only use when the SQL template itself is static (column/table names). Never string-interpolate user input into `FromSqlRaw`.

---

> Cross-refs: → [`anti-patterns.md`](./anti-patterns.md) for client-eval traps | → [`advanced-patterns.md`](./advanced-patterns.md) for raw SQL composition patterns

## Try it

- Call `.ToQueryString()` on your three most complex queries and confirm they generate the expected SQL
- Add `TagWith("endpoint:name")` to every repository method and verify tags appear in your DB slow-query log
- Enable `EnableSensitiveDataLogging()` in development and confirm parameter values are visible
- Find one query that throws `InvalidOperationException` — add an `AsEnumerable()` boundary and measure the row count crossing it
- Switch `LogLevel` for `Microsoft.EntityFrameworkCore.Database.Command` to `Information` in development and count how many queries fire on your busiest page load
