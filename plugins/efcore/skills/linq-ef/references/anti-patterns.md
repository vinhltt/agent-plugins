# EF Core LINQ — Anti-Patterns

**Entity model:** `Blog (Id, Title, Url)` → `Post (Id, BlogId, Title, Content, PublishedAt, IsPublished)` → `Comment (Id, PostId, Author, Body, CreatedAt)` | DbContext: `BlogContext`

---

## 1. N+1 Detection & Fix

**Detection** — enable SQL logging and count queries per request. One query per loop iteration = N+1.

```csharp
// ANTI: 1 query for blogs + N queries for posts (one per blog)
var blogs = await ctx.Blogs.ToListAsync();
foreach (var blog in blogs) {
    var count = blog.Posts.Count;  // triggers SELECT per blog if lazy loading enabled
}

// FIX A: eager load with Include
var blogs = await ctx.Blogs.Include(b => b.Posts).ToListAsync();
// SQL: SELECT * FROM Blogs; SELECT * FROM Posts WHERE BlogId IN (...)

// FIX B: project the count in DB — no nav property needed
var blogs = await ctx.Blogs
    .Select(b => new { b.Title, PostCount = b.Posts.Count() })
    .ToListAsync();
// SQL: SELECT b.Title, (SELECT COUNT(*) FROM Posts WHERE BlogId = b.Id) FROM Blogs
```

N+1 pattern produces 1+N round-trips; Fix B collapses to 1 query with a correlated subquery.

---

## 2. Cartesian Explosion

Multiple `Include` on collections multiplies row count: 10 blogs × 100 posts × 50 comments = 50 000 rows for 10 entities.

```csharp
// ANTI: single query with two collection Includes → Cartesian product
var blogs = await ctx.Blogs
    .Include(b => b.Posts)
        .ThenInclude(p => p.Comments)
    .ToListAsync();
// SQL returns Posts×Comments rows per Blog — 10 blogs = potentially thousands of rows

// FIX: AsSplitQuery [EF 5+] — separate SELECT per collection, no multiplication
var blogs = await ctx.Blogs
    .Include(b => b.Posts)
        .ThenInclude(p => p.Comments)
    .AsSplitQuery()
    .ToListAsync();
// SQL: 3 separate SELECTs — Blogs, Posts WHERE BlogId IN (...), Comments WHERE PostId IN (...)
```

**When split is worse:** small datasets where 3 round-trips cost more than one larger result set. Measure both with your actual data volume.

Set split globally: `options.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)`

---

## 3. DbContext Lifetime Mistakes

```csharp
// ANTI: singleton DbContext — not thread-safe, accumulates tracked entities indefinitely
services.AddSingleton<BlogContext>();  // crashes under concurrent requests

// ANTI: static helper class — no DI, no lifetime management
public static class Db {
    public static BlogContext Context = new BlogContext();  // shared mutable state
}

// CORRECT: web app — request-scoped via DI
services.AddDbContext<BlogContext>(options => options.UseSqlServer(conn));
// Each HTTP request gets its own BlogContext instance, disposed at request end

// CORRECT: background worker — create + dispose per unit of work
public async Task ProcessAsync(IDbContextFactory<BlogContext> factory) {
    await using var ctx = await factory.CreateDbContextAsync();
    // ... do work ...
}  // disposed here — no entity accumulation between iterations
```

`IDbContextFactory<T>` [EF 5+] is the recommended pattern for non-web scopes (workers, Blazor Server, parallel operations).

---

## 4. Lazy Loading Traps

Lazy loading fires a query whenever a navigation property is first accessed — including during JSON serialization.

```csharp
// ANTI: serializer accesses blog.Posts → triggers SELECT per blog mid-serialization
app.MapGet("/blogs", async (BlogContext ctx) => {
    var blogs = await ctx.Blogs.ToListAsync();  // Posts not loaded
    return Results.Json(blogs);                  // serializer reads .Posts → N queries
});

// FIX: project to DTO before returning — no nav properties, no lazy loading possible
app.MapGet("/blogs", async (BlogContext ctx) => {
    var blogs = await ctx.Blogs
        .Select(b => new BlogDto { Id = b.Id, Title = b.Title })
        .ToListAsync();
    return Results.Json(blogs);
});
```

If you must use lazy loading, load all data before serializing: call `Include()` or complete projection before `Results.Json()`.

Disable lazy loading globally if not intentionally used:
```csharp
options.UseLazyLoadingProxies(false);  // default — confirm it's off
```

---

## 5. Large Result Sets

```csharp
// ANTI: loads entire table into memory
var all = await ctx.Posts.ToListAsync();  // 500K rows → OOM risk

// FIX A: streaming with IAsyncEnumerable — process one row at a time
await foreach (var post in ctx.Posts.Where(p => p.IsPublished).AsAsyncEnumerable()) {
    await ProcessAsync(post);
}

// FIX B: chunked processing with keyset pagination
int lastId = 0;
while (true) {
    var chunk = await ctx.Posts
        .Where(p => p.Id > lastId)
        .OrderBy(p => p.Id)
        .Take(500)
        .ToListAsync();
    if (chunk.Count == 0) break;
    await ProcessBatchAsync(chunk);
    lastId = chunk[^1].Id;
}
```

> See → [`query-patterns.md`](./query-patterns.md#4-pagination) for keyset pagination details.

---

## 6. Change Tracker Bloat

Tracking thousands of entities for a read-only operation wastes memory and slows `SaveChanges` (DetectChanges scans all tracked entities).

```csharp
// ANTI: tracking 10K posts to update 1 field on 1 post
var posts = await ctx.Posts.Where(p => p.BlogId == blogId).ToListAsync();  // 10K tracked
var target = posts.First(p => p.Id == postId);
target.IsPublished = true;
await ctx.SaveChangesAsync();  // DetectChanges scans all 10K entries

// FIX A: load only what you need
var post = await ctx.Posts.FindAsync(postId);  // 1 tracked entity
post.IsPublished = true;
await ctx.SaveChangesAsync();

// FIX B: bulk update without tracking [EF 7+]
await ctx.Posts.Where(p => p.Id == postId)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsPublished, true));
// SQL: UPDATE Posts SET IsPublished = 1 WHERE Id = @p0

// FIX C: global read-only default, opt-in to tracking
ctx.ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
```

> See → [`change-tracking.md`](./change-tracking.md) for tracker state details.

---

## 7. Query Cache Poisoning

EF Core caches compiled query plans by expression tree shape. Constants embedded directly in lambdas create unique cache entries per value — the cache grows without bound.

```csharp
// ANTI: constant literal in lambda → new cache entry for every unique status value
foreach (var status in statuses) {
    // Each iteration compiles a new query: WHERE IsPublished = true, WHERE IsPublished = false, ...
    var posts = await ctx.Posts.Where(p => p.IsPublished == status).ToListAsync();
}

// ANTI: string interpolation in raw SQL → cache miss per value
var posts = ctx.Posts.FromSqlRaw($"SELECT * FROM Posts WHERE Title = '{title}'");
// Also: SQL injection risk

// FIX: capture as closure variable — EF treats it as a parameter (@p0), not a constant
bool isPublished = status;
var posts = await ctx.Posts.Where(p => p.IsPublished == isPublished).ToListAsync();
// SQL: SELECT ... WHERE IsPublished = @__isPublished_0  (single cached plan, different param)
```

Detect cache growth: enable `Microsoft.EntityFrameworkCore` logging at `Debug` level and watch for repeated "Compiling query" messages with the same logical query.

---

> Cross-refs: → [`query-patterns.md`](./query-patterns.md) for pagination patterns | → [`change-tracking.md`](./change-tracking.md) for tracker details | → [`query-translation.md`](./query-translation.md) for SQL inspection tools

## Try it

- Enable SQL logging and load one page of your app — count the number of `SELECT` statements; any loop-correlated selects are N+1
- Add `.AsSplitQuery()` to your most deeply nested `Include` chain and compare row counts in the SQL log before and after
- Grep your codebase for `AddSingleton<.*Context>` or `static.*DbContext` — replace with `AddDbContext` or `IDbContextFactory`
- Find one endpoint that returns a navigation property directly to JSON serialization and replace it with a DTO projection
- Search for `FromSqlRaw($"...{variable}...")` string interpolation and migrate to `FromSqlInterpolated` or parameterized `FromSqlRaw`
