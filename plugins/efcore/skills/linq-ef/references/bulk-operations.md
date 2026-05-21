# EF Core Bulk Operations Reference

Lambda-first. All examples use `BlogContext`, `Blog`, `Post`, `Comment` entities.
→ Change tracking semantics: `change-tracking.md` | Tracker bloat anti-patterns: `anti-patterns.md`

---

## 1. ExecuteUpdate / ExecuteDelete [EF 7+]

Benchmarks vs `SaveChanges` (10K rows):
- `ExecuteUpdateAsync`: **547× faster** — bypasses tracker entirely, single SQL UPDATE
- `ExecuteDeleteAsync`: **359× faster** — single SQL DELETE, no entity load

```csharp
// Bulk update — single SQL UPDATE WHERE
await ctx.Posts
    .Where(p => p.BlogId == blogId && !p.IsPublished)
    .ExecuteUpdateAsync(s => s
        .SetProperty(p => p.Status, "Archived")
        .SetProperty(p => p.UpdatedAt, DateTime.UtcNow));

// Bulk delete — single SQL DELETE WHERE
await ctx.Comments
    .Where(c => c.CreatedAt < DateTime.UtcNow.AddDays(-90))
    .ExecuteDeleteAsync();
```

**[EF 10+]** Regular lambda syntax in `ExecuteUpdateAsync` — no `SetProperty` needed:

```csharp
// EF 10+ only
await ctx.Posts
    .Where(p => p.BlogId == blogId)
    .ExecuteUpdateAsync(p => new Post { Status = "Archived", UpdatedAt = DateTime.UtcNow });
```

**Limitations:**
- No change tracking — `SaveChanges` not called, interceptors not triggered
- Executes immediately — no unit-of-work batching
- Single table per operation — no cross-table bulk ops in one call
- Audit interceptors (`SaveChangesInterceptor`) will NOT fire — handle auditing separately

---

## 2. Bulk Insert Strategies

| Scale | Strategy | Code | Notes |
|---|---|---|---|
| < 1K rows | `AddRange` + `SaveChanges` | Standard EF | Simple, tracked |
| 1K–10K rows | `AddRange` batched | Set `MaxBatchSize` | Batches SQL inserts |
| 10K+ rows | EFCore.BulkExtensions | `BulkInsertAsync` | 8× faster at 100K rows |
| Any size, simple | Raw SQL | `ExecuteSqlInterpolated` | No mapping overhead |

```csharp
// Standard — OK for < 1K rows
var posts = Enumerable.Range(1, 500)
    .Select(i => new Post { BlogId = 1, Title = $"Post {i}" });
ctx.Posts.AddRange(posts);
await ctx.SaveChangesAsync();

// EFCore.BulkExtensions — install package first
await ctx.BulkInsertAsync(posts);             // 8× faster at 100K scale
await ctx.BulkInsertOrUpdateAsync(posts);     // upsert
```

Configure batch size on the context to improve standard `AddRange` throughput:

```csharp
// In DbContext OnConfiguring or DI setup
options.UseSqlServer(conn, sql => sql.MaxBatchSize(500));
```

---

## 3. Batch Processing Pattern

For datasets too large to load into memory — process in chunks, recycle context per batch to prevent tracker bloat.

```csharp
const int BatchSize = 1000;
int processed = 0;

while (true)
{
    // Fresh context per batch — tracker never grows
    await using var ctx = await factory.CreateDbContextAsync();

    var batch = await ctx.Posts
        .Where(p => !p.Processed)
        .OrderBy(p => p.PostId)
        .Take(BatchSize)
        .ToListAsync();

    if (batch.Count == 0) break;

    foreach (var post in batch)
        post.Processed = true;

    await ctx.SaveChangesAsync();
    processed += batch.Count;
}
```

Key: use `IDbContextFactory<BlogContext>` (not scoped `DbContext`) so each iteration gets an isolated instance. Never accumulate thousands of tracked entities in a single context.

---

## 4. Version Notes

| Feature | Version | Notes |
|---|---|---|
| `ExecuteUpdate` / `ExecuteDelete` | [EF 7+] | Must use `SetProperty` lambda in 7/8/9 |
| Regular lambda in `ExecuteUpdateAsync` | [EF 10+] | Cleaner syntax, no `SetProperty` |
| Improved bulk insert performance | [EF 10+] | Reduced round-trips for large `AddRange` |
| `BulkInsertAsync` via BulkExtensions | Third-party | Works with EF 6+, actively maintained |

---

## Try it

- Replace a `foreach` + `SaveChanges` loop touching > 500 rows with `ExecuteUpdateAsync`; use `STATISTICS IO` to compare logical reads.
- Run `BenchmarkDotNet` comparing `AddRange(10K) + SaveChanges` vs `BulkInsertAsync(10K)` and record the multiplier for your DB provider.
- Instrument your batch processor with a `Stopwatch` per batch; tune `BatchSize` to find the knee of the throughput curve.
- Add a custom audit log call after `ExecuteUpdateAsync` (since interceptors don't fire) and verify the audit row is written.
- Check if any existing `SaveChanges` loops in your codebase qualify for `ExecuteDeleteAsync` — grep for `.Remove` or `.RemoveRange` followed by `SaveChangesAsync`.
