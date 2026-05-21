---
name: linq-ef
description: >
  Entity Framework Core LINQ query best practices with lambda expressions.
  Use for EF Core query optimization, N+1 detection, change tracking issues,
  LINQ-to-SQL debugging, bulk operations. Covers EF Core 8/9/10.
  Trigger on: "EF Core", "Entity Framework", "LINQ query", "lambda",
  "N+1", "DbContext", "AsNoTracking", "Include", "cartesian explosion",
  "ExecuteUpdate", "ExecuteDelete", "change tracking", "SaveChanges".
metadata:
  version: "0.1.0"
---

# EF Core LINQ Best Practices

Lambda-first query patterns for EF Core 8/9/10. Slim overview here; load the relevant `references/*.md` when going deep.

Covers EF Core 8.0+ (8/9/10). Version-specific features marked with [EF N+] tags.

## Decision tree — pick the right reference

| User intent | Load |
|---|---|
| Write/fix LINQ query — filtering, projection, pagination, joins | `references/query-patterns.md` |
| Optimize query perf — loading strategy, tracking, split queries, pooling | `references/performance.md` |
| Understand generated SQL, debug untranslatable query, inspect SQL output | `references/query-translation.md` |
| Fix change tracking, SaveChanges issue, concurrency conflict | `references/change-tracking.md` |
| Fix N+1, cartesian explosion, DbContext lifetime, lazy loading bug | `references/anti-patterns.md` |
| Bulk insert/update/delete at scale, ExecuteUpdate/Delete | `references/bulk-operations.md` |
| Specification pattern, Query Objects, global filters, JSON columns, raw SQL | `references/advanced-patterns.md` |
| Test LINQ queries, testing strategy, SQLite in-memory, integration tests | `references/testing.md` |

## Top 5 inline patterns

### 1. Projection over full entity loading

```csharp
// BAD: loads all columns, tracks entity
var blogs = await ctx.Blogs.ToListAsync();

// GOOD: loads only needed columns, no tracking overhead
var blogs = await ctx.Blogs
    .Select(b => new { b.Title, PostCount = b.Posts.Count })
    .ToListAsync();
```

### 2. N+1 fix with Include + AsSplitQuery

```csharp
// BAD: lazy load triggers N queries in loop
foreach (var blog in ctx.Blogs.ToList())
    Console.WriteLine(blog.Posts.Count); // query per blog

// GOOD: eager load in 2 queries (split avoids cartesian)
var blogs = await ctx.Blogs
    .Include(b => b.Posts)
    .AsSplitQuery()
    .ToListAsync();
```

### 3. AsNoTracking for read-only queries

```csharp
// Read-only: 2x faster at scale, ~50% less memory
var posts = await ctx.Posts
    .AsNoTracking()
    .Where(p => p.IsPublished)
    .ToListAsync();
```

### 4. Filtered Include [EF 5+]

```csharp
// Load blog with only its published posts (not all posts)
var blog = await ctx.Blogs
    .Include(b => b.Posts.Where(p => p.IsPublished))
    .FirstAsync(b => b.BlogId == id);
```

### 5. Keyset pagination over offset

```csharp
// BAD: O(n) scan — slow at page 10,000
var page = await ctx.Posts.Skip(50000).Take(50).ToListAsync();

// GOOD: O(1) seek via index
var page = await ctx.Posts
    .Where(p => p.PostId > lastSeenId)
    .OrderBy(p => p.PostId)
    .Take(50)
    .ToListAsync();
```
