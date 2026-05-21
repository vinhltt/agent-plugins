# EF Core Performance Reference

Lambda-first. All examples use `BlogContext`, `Blog`, `Post`, `Comment` entities.
→ Change tracking semantics: `change-tracking.md` | N+1 fixes: `anti-patterns.md`

---

## 1. Loading Strategy Decision Matrix

| Scenario | Strategy | Code | Trade-off |
|---|---|---|---|
| Always need nav data | Eager (`Include`) | `.Include(b => b.Posts)` | Extra JOIN, one query |
| Rarely need nav data | Lazy (nav access) | Access `blog.Posts` in loop | N+1 risk if in loops |
| Conditionally need nav | Explicit (`LoadAsync`) | `ctx.Entry(blog).Collection(b => b.Posts).LoadAsync()` | Extra roundtrip, explicit |
| Need partial nav data | Filtered Include [EF 5+] | `.Include(b => b.Posts.Where(p => p.IsPublished))` | SQL filter in JOIN |

**Filtered Include [EF 5+]** — supports `Where`, `OrderBy`, `Take`, `Skip` inside `Include`:

```csharp
var blogs = await ctx.Blogs
    .Include(b => b.Posts
        .Where(p => p.IsPublished)
        .OrderByDescending(p => p.CreatedAt)
        .Take(5))
    .ToListAsync();
```

Pitfall: filtered include uses a subquery — not all providers support all operators.

---

## 2. AsNoTracking Optimization

Benchmark (10 blogs × 20 posts): `AsNoTracking` ~30% faster (993μs vs 1414μs), ~50% less memory — change tracker skipped entirely.

```csharp
// Read-only query — no tracker overhead
var posts = await ctx.Posts
    .AsNoTracking()
    .Where(p => p.IsPublished)
    .ToListAsync();
```

**Global default** — set once in `DbContext` configuration:

```csharp
options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
```

**Override for mutations** — re-enable tracking when you need `SaveChanges`:

```csharp
var post = await ctx.Posts
    .AsTracking()           // explicit override of global NoTracking
    .FirstAsync(p => p.PostId == id);
post.Title = "Updated";
await ctx.SaveChangesAsync();
```

Rule: set `NoTracking` as global default on read-heavy services; use `AsTracking()` only at mutation call sites.

---

## 3. Split Queries

**When to use:** multiple one-to-many `Include`s OR any include with large expected collection size.

```csharp
// Single query — cartesian explosion risk (Blogs × Posts × Comments rows)
var blogs = await ctx.Blogs
    .Include(b => b.Posts)
    .ThenInclude(p => p.Comments)
    .ToListAsync();

// Split — 3 separate queries, no row multiplication
var blogs = await ctx.Blogs
    .Include(b => b.Posts)
    .ThenInclude(p => p.Comments)
    .AsSplitQuery()
    .ToListAsync();
```

| | Single Query | Split Query |
|---|---|---|
| Roundtrips | 1 | N (one per Include level) |
| Row count | Multiplied (cartesian) | Linear per table |
| Consistency | Single snapshot | Possible phantom reads |
| Best for | Small/flat includes | Deep/wide collections |

Global default: `options.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)` — override per-query with `.AsSingleQuery()`.

→ See cartesian explosion detail in `anti-patterns.md`

---

## 4. Compiled Queries

10–15% gain on hot paths by bypassing LINQ-to-SQL translation overhead on repeat calls.

```csharp
// Define once at class/static level — not per-request
private static readonly Func<BlogContext, int, Task<Blog?>> GetBlogById =
    EF.CompileAsyncQuery((BlogContext ctx, int id) =>
        ctx.Blogs.Include(b => b.Posts).FirstOrDefault(b => b.BlogId == id));

// Invoke per-request — translation skipped
var blog = await GetBlogById(ctx, blogId);
```

**When NOT worth it:**
- Query runs < once per second
- Query shape changes based on runtime conditions (can't compile dynamic filters)
- Development/admin queries

---

## 5. DbContext Pooling

```csharp
// DI registration — up to 50% faster for short-lived ops (single-row lookups)
builder.Services.AddDbContextPool<BlogContext>(
    options => options.UseSqlServer(connectionString),
    poolSize: 128);  // default: 1024
```

Pooling resets `DbContext` state between requests via `ResetState()` — the connection is reused, not recreated.

**Constraint:** No per-request state stored on the `DbContext` itself (e.g., no `CurrentUserId` property set in constructor — use scoped services or `IDbContextFactory<T>` instead).

`IDbContextFactory<BlogContext>` alternative — for background jobs or multiple parallel contexts per request:

```csharp
using var ctx = await factory.CreateDbContextAsync();
```

---

## 6. Index Strategy

| Pattern | Index helps? | Why | Fix |
|---|---|---|---|
| `.Where(b => b.Title.StartsWith("Tech"))` | Yes | Prefix match uses index scan | Standard index on `Title` |
| `.Where(b => b.Title.EndsWith("Blog"))` | No | Suffix can't use B-tree | Computed column: `REVERSE(Title)`, index on that |
| `.Where(b => b.PostCount > 5)` | No | Expression in predicate | Persisted computed column + index |
| `.Where(b => b.Slug == slug)` | Yes | Equality on indexed col | Standard index on `Slug` |

**Persisted computed column** for expression predicates:

```csharp
// ModelBuilder
entity.Property(b => b.PostCount)
    .HasComputedColumnSql("(SELECT COUNT(*) FROM Posts WHERE BlogId = BlogId)", stored: true);
entity.HasIndex(b => b.PostCount);
```

Use `HasIndex(b => new { b.TenantId, b.IsPublished })` for composite predicates — column order matters (highest cardinality first).

---

## Try it

- Run `.ToQueryString()` on your 3 heaviest queries; check for unexpected JOINs or missing WHERE clauses.
- Add `.AsSplitQuery()` to any query with 2+ `Include` chains, then compare `EXPLAIN` output for row estimates.
- Set `QueryTrackingBehavior.NoTracking` globally in a read-heavy service and measure before/after with BenchmarkDotNet.
- Profile a pooled vs non-pooled context with a tight loop of 1K single-row reads; observe GC pressure difference.
- Wrap your most-called repo method in `EF.CompileAsyncQuery` and run a hot-path benchmark to verify the 10-15% claim holds for your schema.
