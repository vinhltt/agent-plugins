# EF Core LINQ — Change Tracking

**Entity model:** `Blog (Id, Title, Url)` → `Post (Id, BlogId, Title, Content, PublishedAt, IsPublished, RowVersion)` → `Comment (Id, PostId, Author, Body, CreatedAt)` | DbContext: `BlogContext`

---

## 1. Entity State Machine

```
Detached
   │ .Add()         .Attach()     .Update()
   ↓               ↓              ↓
 Added          Unchanged ←→  Modified
                   │                │
                .Remove()        .Remove()
                   ↓                ↓
                Deleted          Deleted
                   │
             .SaveChanges()
                   ↓
              Unchanged (or Detached if deleted)
```

Inspect state at any point:

```csharp
var post = await ctx.Posts.FindAsync(1);          // Unchanged
post.Title = "Updated";                            // Modified (auto-detected)
Console.WriteLine(ctx.Entry(post).State);          // EntityState.Modified

var newPost = new Post { Title = "New" };
ctx.Posts.Add(newPost);
Console.WriteLine(ctx.Entry(newPost).State);       // EntityState.Added
```

---

## 2. DetectChanges Triggers

EF Core calls `DetectChanges()` automatically before:
- `SaveChanges()` / `SaveChangesAsync()`
- `Entry()`, `Entries()`, `Add()`, `Attach()`, `Update()`, `Remove()`
- Executing a query (when `AutoDetectChangesEnabled = true`)

**Disable for bulk operations** — call `DetectChanges()` manually at the end:

```csharp
ctx.ChangeTracker.AutoDetectChangesEnabled = false;
try {
    foreach (var post in posts) { post.IsPublished = true; }
    ctx.ChangeTracker.DetectChanges();   // single pass over all entities
    await ctx.SaveChangesAsync();
} finally {
    ctx.ChangeTracker.AutoDetectChangesEnabled = true;
}
```

---

## 3. Tracking vs NoTracking Semantics

| | Tracking | NoTracking |
|---|---|---|
| Identity resolution | Same instance for same PK | New instance each time |
| Memory (10K entities) | ~25 MB | ~12 MB |
| Query speed | Baseline | ~2× faster |
| `SaveChanges` support | Yes | No (Detached) |

```csharp
// Read-only — no tracking needed
var posts = await ctx.Posts.AsNoTracking().Where(p => p.IsPublished).ToListAsync();

// Read + display related entities with deduplication but no writes [EF 5+]
var posts = await ctx.Posts.AsNoTrackingWithIdentityResolution().Include(p => p.Blog).ToListAsync();
```

**Set no-tracking as default** for read-heavy contexts:

```csharp
ctx.ChangeTracker.QueryTrackingBehavior = QueryTrackingBehavior.NoTracking;
```

---

## 4. Explicit State Manipulation

`Update()` marks **all** properties modified — generates `UPDATE` with every column.
`Attach()` + property assignment generates a minimal `UPDATE`.

```csharp
// ANTI: Update() on a disconnected entity — all columns in UPDATE even if only Title changed
ctx.Posts.Update(post);
await ctx.SaveChangesAsync();
// SQL: UPDATE Posts SET Title=@p0, Content=@p1, PublishedAt=@p2, IsPublished=@p3 WHERE Id=@p4

// FIX: Attach then mark only the changed property
ctx.Posts.Attach(post);                                     // Unchanged
ctx.Entry(post).Property(p => p.Title).IsModified = true;  // only Title
await ctx.SaveChangesAsync();
// SQL: UPDATE Posts SET Title=@p0 WHERE Id=@p1
```

**ExecuteUpdate** [EF 7+] — no tracking needed, single round-trip:

```csharp
await ctx.Posts
    .Where(p => p.BlogId == blogId)
    .ExecuteUpdateAsync(s => s.SetProperty(p => p.IsPublished, true));
// SQL: UPDATE Posts SET IsPublished = 1 WHERE BlogId = @p0
```

---

## 5. Concurrency Handling

Mark columns as concurrency tokens to detect conflicting updates.

```csharp
public class Post {
    public int Id { get; set; }
    public string Title { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; }  // SQL Server rowversion
}
```

Handle the exception:

```csharp
try {
    await ctx.SaveChangesAsync();
} catch (DbUpdateConcurrencyException ex) {
    var entry = ex.Entries.Single();
    var dbValues = await entry.GetDatabaseValuesAsync();
    if (dbValues == null) { /* entity deleted by another user */ }
    else {
        // Refresh original values, let user decide: overwrite or merge
        entry.OriginalValues.SetValues(dbValues);
        // Retry SaveChanges or throw to caller
    }
}
```

`[ConcurrencyCheck]` on any property (e.g., `Title`) adds it to the `WHERE` clause instead of a dedicated version column.

---

## 6. ChangeTracker Debugging

```csharp
// Human-readable dump of all tracked entities and their states
Console.WriteLine(ctx.ChangeTracker.DebugView.LongView);

// Count tracked entities (watch for growth in long-running operations)
var count = ctx.ChangeTracker.Entries().Count();
Console.WriteLine($"Tracked: {count}");

// Per-state breakdown
var modified = ctx.ChangeTracker.Entries().Where(e => e.State == EntityState.Modified);
```

If tracked count grows unboundedly in a loop, call `ctx.ChangeTracker.Clear()` [EF 5+] between batches or switch to `AsNoTracking()`.

---

> Cross-refs: → [`performance.md`](./performance.md) for AsNoTracking optimization | → [`anti-patterns.md`](./anti-patterns.md) for tracker bloat patterns

## Try it

- Call `ctx.ChangeTracker.DebugView.LongView` after a complex operation and verify only the entities you expect are tracked
- Replace one `Update(entity)` call with `Attach` + `IsModified = true` and compare the generated SQL using `ToQueryString()`
- Add `[Timestamp]` to `Post.RowVersion`, trigger a concurrent save in a test, and handle `DbUpdateConcurrencyException`
- Set `QueryTrackingBehavior.NoTracking` globally on your read-only reporting context and benchmark query times
- Add `ctx.ChangeTracker.Entries().Count()` logging in a background job and verify it stays bounded across iterations
