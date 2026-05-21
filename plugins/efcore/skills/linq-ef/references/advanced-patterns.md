# EF Core Advanced Patterns Reference

Lambda-first. All examples use `BlogContext`, `Blog`, `Post`, `Comment` entities.
→ Raw SQL translation: `query-translation.md` | Filtering patterns: `query-patterns.md`

---

## 1. Specification Pattern

Encapsulates criteria, includes, ordering, paging into a reusable object.

```csharp
public abstract class Specification<T>
{
    public Expression<Func<T, bool>>? Criteria { get; protected set; }
    public List<Expression<Func<T, object>>> Includes { get; } = new();
    public Expression<Func<T, object>>? OrderBy { get; protected set; }
    public int? Take { get; protected set; }
    public int? Skip { get; protected set; }
}

public class GetPublishedPostsSpec(int blogId, int page, int size) : Specification<Post>
{
    // initialized via field initializers using primary ctor params
    public new Expression<Func<Post, bool>> Criteria { get; } = p => p.BlogId == blogId && p.IsPublished;
    public new int Skip { get; } = (page - 1) * size;
    public new int Take { get; } = size;
}
```

Repository calls `ApplySpecification(query, spec)`. Reusable, unit-testable in isolation.

## 2. Query Objects Pattern

Modern alternative — explicit query + handler pair, no base class needed.

```csharp
public record GetBlogSummaryQuery(int BlogId, bool PublishedOnly);

public class GetBlogSummaryHandler(BlogContext ctx)
{
    public Task<BlogSummaryDto?> HandleAsync(GetBlogSummaryQuery q)
        => ctx.Blogs
            .Where(b => b.BlogId == q.BlogId)
            .Select(b => new BlogSummaryDto { Title = b.Title,
                PostCount = b.Posts.Count(p => !q.PublishedOnly || p.IsPublished) })
            .FirstOrDefaultAsync();
}
```

Prefer over generic repositories — no abstraction leakage, easier to profile per query.

## 3. Global Query Filters

Configured in `OnModelCreating`, apply to every query on that entity automatically.

```csharp
// Soft delete
modelBuilder.Entity<Post>().HasQueryFilter(p => !p.IsDeleted);

// Multi-tenancy (inject ITenantService via ctor)
modelBuilder.Entity<Blog>().HasQueryFilter(b => b.TenantId == _tenantService.CurrentTenantId);

// Disable per-query
var allPosts = await ctx.Posts.IgnoreQueryFilters().ToListAsync();

// Named disable [EF 10+]
var posts = await ctx.Posts.IgnoreQueryFilters("SoftDelete").ToListAsync();
```

Pitfall: filters apply to navigation-property joins too — a soft-deleted `Post` won't appear even when loaded via `blog.Posts`. Use `IgnoreQueryFilters()` in admin queries.

## 4. JSON Column Querying

| Provider | Column config | Min version |
|---|---|---|
| PostgreSQL | `HasColumnType("jsonb")` | [EF 8+] |
| SQL Server 2025 | `HasColumnType("json")` | [EF 8+] |
| Owned entity as JSON | `OwnsOne(..., b => b.ToJson())` | [EF 7+] |
| Complex type validator | `IsJson()` | [EF 10+] |

```csharp
// LINQ on JSON props [EF 8+] — translates to provider JSON operators
var posts = await ctx.Posts
    .Where(p => p.Metadata.Tags.Contains("efcore"))
    .ToListAsync();

// Owned entity collapsed to JSON column [EF 7+]
modelBuilder.Entity<Blog>().OwnsOne(b => b.Settings, s => s.ToJson());
```

## 5. Raw SQL Integration

```csharp
// GOOD — FromSqlInterpolated: always parameterized, composable with LINQ
var posts = await ctx.Posts
    .FromSqlInterpolated($"SELECT * FROM Posts WHERE BlogId = {blogId}")
    .Where(p => p.IsPublished)   // adds AND IsPublished=1
    .OrderBy(p => p.CreatedAt)
    .ToListAsync();

// BAD — FromSqlRaw with user input: SQL injection risk
ctx.Posts.FromSqlRaw($"SELECT * FROM Posts WHERE Slug = '{userInput}'");
```

`FromSqlRaw` requires explicit `SqlParameter` array — use only with static SQL strings.
→ `ToQueryString()` debugging: `query-translation.md`

## 6. Interceptors [EF 3+]

Two common uses — SQL logging and audit stamping:

```csharp
// Slow query logger (DbCommandInterceptor)
public override ValueTask<DbDataReader> ReaderExecutedAsync(
    DbCommand cmd, CommandExecutedEventData data, DbDataReader result, CancellationToken ct = default)
{
    if (data.Duration.TotalMilliseconds > 100)
        Log.Warning("Slow ({ms}ms): {sql}", data.Duration.TotalMilliseconds, cmd.CommandText);
    return new(result);
}

// Audit stamp on save (SaveChangesInterceptor)
public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
    DbContextEventData data, InterceptionResult<int> result, CancellationToken ct = default)
{
    foreach (var e in data.Context!.ChangeTracker.Entries<Post>().Where(e => e.State == EntityState.Modified))
        e.Entity.UpdatedAt = DateTime.UtcNow;
    return new(result);
}
```

Register: `options.AddInterceptors(new QueryLoggingInterceptor(), new AuditInterceptor())`.
Note: interceptors do NOT fire for `ExecuteUpdate`/`ExecuteDelete` — see `bulk-operations.md`.

## Try it

- Extract your most-duplicated `Where` clause into a `Specification<Post>`; verify generated SQL is identical via `.ToQueryString()`.
- Add `HasQueryFilter` for soft delete on `Post`, then confirm deleted records reappear in an admin endpoint using `.IgnoreQueryFilters()`.
- Wrap a `FromSqlInterpolated` call with `.ToQueryString()` and verify parameters are bound, not inlined.
- Register `QueryLoggingInterceptor` with a 50ms threshold; run your test suite and identify the top 3 slow queries.
- Switch one `OwnsOne` to `.ToJson()` [EF 7+]; inspect the migration to confirm the join table is eliminated.
