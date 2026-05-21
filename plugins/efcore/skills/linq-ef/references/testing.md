# EF Core Testing Reference

Lambda-first. All examples use `BlogContext`, `Blog`, `Post`, `Comment` entities.
→ ToQueryString details: `query-translation.md` | Why InMemory fails: `anti-patterns.md`

---

## 1. Strategy Comparison

| Strategy | SQL translation | Recommended use |
|---|---|---|
| InMemory provider | None — LINQ in-process | Never for query logic |
| SQLite in-memory | Real SQL, minor dialect gaps | Default for repo/query tests |
| Real DB (Testcontainers) | Exact match | Integration / dialect-specific |
| Mock `DbSet` | None | Non-query unit tests only |

InMemory pitfall: no referential integrity, no transactions, no SQL translation — passing in-memory tests can fail on real SQL Server/PostgreSQL. Do not use for LINQ expression testing.

---

## 2. SQLite In-Memory Setup

Keep the `SqliteConnection` open for the lifetime of the test — the in-memory DB is destroyed when the connection closes.

```csharp
public class BlogContextFactory : IDisposable
{
    private readonly SqliteConnection _conn = new("Data Source=:memory:");
    public BlogContext Context { get; }

    public BlogContextFactory()
    {
        _conn.Open();
        Context = new BlogContext(
            new DbContextOptionsBuilder<BlogContext>().UseSqlite(_conn).Options);
        Context.Database.EnsureCreated();
    }

    public void Dispose() { Context.Dispose(); _conn.Dispose(); }
}
```

Usage: `new BlogContextFactory()` per test method (or `IDisposable` xUnit class field). Seed data with `ctx.Posts.AddRange(...)` + `SaveChangesAsync()` before asserting.

SQLite dialect gaps: no `DateTimeOffset`, limited `decimal` precision, no schema-qualified tables. Use real DB tests for provider-specific features.

---

## 3. Testing Query Expressions

`ToQueryString()` verifies LINQ translates to expected SQL — catches untranslatable expressions at test time, not runtime.

```csharp
[Fact]
public void PublishedFilter_TranslatesToSqlWhere()
{
    using var f = new BlogContextFactory();

    var sql = f.Context.Posts
        .Where(p => p.IsPublished && p.BlogId == 1)
        .ToQueryString();

    Assert.Contains("WHERE", sql);
    Assert.Contains("Published", sql);
    Assert.Contains("BlogId", sql);
}
```

Use for reusable filter expressions, specs, and global query filters. Requires a real provider (SQLite fixture) — `ToQueryString()` returns empty string on InMemory.

---

## 4. Testing Repository Implementations

Use SQLite, not mocks — mocks bypass translation and miss real query bugs.

```csharp
[Fact]
public async Task GetByBlogId_ExcludesSoftDeleted()
{
    using var f = new BlogContextFactory();
    f.Context.Posts.AddRange(
        new Post { BlogId = 1, Title = "Live", IsDeleted = false },
        new Post { BlogId = 1, Title = "Gone", IsDeleted = true });
    await f.Context.SaveChangesAsync();

    var results = await new PostRepository(f.Context).GetByBlogIdAsync(1);

    Assert.Single(results);
    Assert.Equal("Live", results[0].Title);
}
```

Anti-pattern — mocking `DbSet`:

```csharp
// BAD: in-process LINQ, no SQL translation — misses real DB behavior
mockSet.As<IQueryable<Post>>().Setup(m => m.Provider).Returns(data.AsQueryable().Provider);
```

---

## 5. Integration Test Patterns

Use Testcontainers + transaction rollback for real-DB isolation without permanent writes.

Pattern: `IAsyncLifetime` fixture calls `MigrateAsync()` in `InitializeAsync`, starts a `BeginTransactionAsync`, then `RollbackAsync` in `DisposeAsync` — every test class starts with a clean slate.

```csharp
public async Task InitializeAsync()
{
    Context = new BlogContext(RealConnectionOptions());
    await Context.Database.MigrateAsync();
    _tx = await Context.Database.BeginTransactionAsync();
}
public async Task DisposeAsync() { await _tx.RollbackAsync(); await Context.DisposeAsync(); }
```

Isolation options: transaction rollback (fast, per class) → `Respawn` NuGet reset (per test, write-heavy) → separate schema (slowest, most isolated).

---

## Try it

- Swap one `InMemory` test to `BlogContextFactory` (SQLite); confirm it now catches untranslatable expressions that passed silently before.
- Add a `ToQueryString()` assertion to your most complex repo query; verify correct `WHERE` columns and no in-memory fallback.
- Test your `HasQueryFilter` soft-delete: insert a deleted `Post`, assert absent normally, present with `.IgnoreQueryFilters()`.
- Replace one `Mock<DbSet<Post>>` test with SQLite-backed; check whether it now exposes a previously hidden translation bug.
- Add Testcontainers to one integration test; verify a migration-dependent query (keyset pagination) behaves identically on the real provider.
