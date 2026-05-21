# EF Core LINQ — Query Patterns

**Entity model used throughout:**
`Blog (Id, Title, Url)` → `Post (Id, BlogId, Title, Content, PublishedAt, IsPublished)` → `Comment (Id, PostId, Author, Body, CreatedAt)`
`BlogContext` is the DbContext.

---

## 1. Lambda Syntax Conventions

Lambda (method chain) is the default. Query syntax is only a thin wrapper — avoid in EF Core work.

```csharp
// PREFER: lambda
var titles = await ctx.Posts.Where(p => p.IsPublished).Select(p => p.Title).ToListAsync();

// AVOID: query syntax (verbose, same result)
var titles = (from p in ctx.Posts where p.IsPublished select p.Title).ToListAsync();
```

Every call in a chain adds to the expression tree — nothing executes until `ToList/FirstOrDefault/etc.`

---

## 2. Projection Patterns

Project to DTOs or anonymous types — never pull the full entity when you only need a subset.

```csharp
// ANTI: loads all columns including Content (large text)
var posts = await ctx.Posts.Where(p => p.IsPublished).ToListAsync();
var titles = posts.Select(p => new { p.Title, p.PublishedAt }); // filtering in memory

// FIX: project in DB, only 2 columns travel over the wire
var posts = await ctx.Posts
    .Where(p => p.IsPublished)
    .Select(p => new PostSummaryDto { Title = p.Title, PublishedAt = p.PublishedAt })
    .ToListAsync();
// SQL: SELECT p.Title, p.PublishedAt FROM Posts p WHERE p.IsPublished = 1
```

**Nested projection** (flattening a nav property):

```csharp
var result = await ctx.Blogs
    .Select(b => new {
        b.Title,
        Posts = b.Posts.Select(p => p.Title).ToList()
    })
    .ToListAsync();
// SQL: SELECT b.Title FROM Blogs; SELECT p.Title FROM Posts WHERE BlogId = ...
```

---

## 3. Filtering — Composability & Reuse

Where clauses compose — each `.Where()` adds an AND predicate.

```csharp
// Both produce identical SQL — prefer the chained form for conditional filters
var q = ctx.Posts.Where(p => p.IsPublished && p.BlogId == blogId);
var q = ctx.Posts.Where(p => p.IsPublished).Where(p => p.BlogId == blogId);
```

**Reusable filter expressions** avoid duplicating business rules:

```csharp
// Define once
Expression<Func<Post, bool>> IsLive = p => p.IsPublished && p.PublishedAt <= DateTime.UtcNow;

// Reuse across queries — EF translates the expression tree, not a delegate
var livePosts = await ctx.Posts.Where(IsLive).ToListAsync();
var liveCount = await ctx.Posts.CountAsync(IsLive);
```

**Dynamic filters** — build predicates at runtime without string SQL:

```csharp
// Conditional filter composition
IQueryable<Post> q = ctx.Posts;
if (blogId.HasValue) q = q.Where(p => p.BlogId == blogId.Value);
if (onlyPublished)   q = q.Where(p => p.IsPublished);
var results = await q.ToListAsync();
```

> See → [`anti-patterns.md`](./anti-patterns.md) for N+1 from filter-then-loop patterns.

---

## 4. Pagination

### Offset (avoid for deep pages)

```csharp
// ANTI for large offsets: DB scans and discards all preceding rows
var page = await ctx.Posts
    .OrderBy(p => p.PublishedAt)
    .Skip(pageIndex * pageSize)   // O(n) — skip 1 000 000 = read 1 000 000 rows
    .Take(pageSize)
    .ToListAsync();
// SQL: SELECT ... ORDER BY PublishedAt OFFSET 1000000 ROWS FETCH NEXT 20 ROWS ONLY
```

### Keyset / Cursor (prefer for feeds and large datasets)

```csharp
// FIX: WHERE clause uses index — O(log n) regardless of position
var page = await ctx.Posts
    .Where(p => p.PublishedAt < lastSeenDate || (p.PublishedAt == lastSeenDate && p.Id < lastSeenId))
    .OrderByDescending(p => p.PublishedAt).ThenByDescending(p => p.Id)
    .Take(pageSize)
    .ToListAsync();
// SQL: WHERE PublishedAt < @p0 OR (...) ORDER BY PublishedAt DESC, Id DESC
```

Keyset requires a stable sort key. Good candidates: `(PublishedAt, Id)` — never use a column that can be NULL.

---

## 5. Joins & Navigation Properties

Navigation properties are preferred — EF generates the correct JOIN automatically.

```csharp
// PREFER: nav property (EF handles JOIN)
var data = await ctx.Posts
    .Include(p => p.Blog)
    .Select(p => new { p.Title, BlogTitle = p.Blog.Title })
    .ToListAsync();

// Explicit join — only needed when no nav property exists or joining on non-FK
var data = await ctx.Posts
    .Join(ctx.Blogs, p => p.BlogId, b => b.Id, (p, b) => new { p.Title, BlogTitle = b.Title })
    .ToListAsync();
// SQL: SELECT p.Title, b.Title FROM Posts p INNER JOIN Blogs b ON p.BlogId = b.Id
```

---

## 6. Grouping & Aggregation

```csharp
// ANTI: grouping after ToList() — all rows loaded into memory
var counts = ctx.Posts.ToList().GroupBy(p => p.BlogId).Select(g => new { g.Key, Count = g.Count() });

// FIX: GroupBy translates to SQL GROUP BY
var counts = await ctx.Posts
    .GroupBy(p => p.BlogId)
    .Select(g => new { BlogId = g.Key, Count = g.Count(), Latest = g.Max(p => p.PublishedAt) })
    .ToListAsync();
// SQL: SELECT BlogId, COUNT(*), MAX(PublishedAt) FROM Posts GROUP BY BlogId
```

Complex aggregations that EF cannot translate will throw `InvalidOperationException` at runtime — test with `ToQueryString()` first (see → [`query-translation.md`](./query-translation.md)).

---

> Cross-refs: → [`anti-patterns.md`](./anti-patterns.md) for N+1 patterns | → [`performance.md`](./performance.md) for compiled queries & loading strategies

## Try it

- Replace a `ToList()...Select()` chain in your codebase with a DB-side projection and compare SQL via `ToQueryString()`
- Extract a repeated `Where(p => p.IsPublished)` filter into a shared `Expression<Func<Post, bool>>` field
- Convert one offset-paginated endpoint to keyset and benchmark with 100K rows
- Verify your `GroupBy` query translates to SQL — call `.ToQueryString()` before `.ToListAsync()`
- Swap an explicit `Join` that has a nav property for an `Include` + projection
