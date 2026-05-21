# efcore

Entity Framework Core LINQ query best practices with lambda expressions.
Covers EF Core 8/9/10 — query patterns, performance, anti-patterns, change tracking, bulk operations.

## Skills

| Skill | Description |
|-------|-------------|
| `linq-ef` | Progressive disclosure skill: slim decision tree + 8 reference files |

## Installation

```bash
npx skills add vinhltt/agent-plugins@linq-ef
```

## Layout

```
plugins/efcore/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── linq-ef/
│       ├── SKILL.md              # Decision tree + top 5 inline patterns (<100 lines)
│       ├── CHANGELOG.md
│       └── references/
│           ├── query-patterns.md     # Projection, filtering, pagination, joins, grouping
│           ├── query-translation.md  # LINQ→SQL pipeline, ToQueryString, TagWith, client eval
│           ├── change-tracking.md    # Entity states, DetectChanges, NoTracking, concurrency
│           ├── anti-patterns.md      # N+1, cartesian, DbContext lifetime, lazy loading traps
│           ├── performance.md        # Loading strategies, compiled queries, pooling, indexes
│           ├── bulk-operations.md    # ExecuteUpdate/Delete, BulkInsert, batch patterns
│           ├── advanced-patterns.md  # Specification, Query Objects, global filters, JSON, raw SQL
│           └── testing.md            # SQLite in-memory, ToQueryString testing, integration patterns
├── CHANGELOG.md
└── README.md
```

## Trigger Phrases

- "EF Core", "Entity Framework", "LINQ query", "lambda expression"
- "N+1", "cartesian explosion", "DbContext", "AsNoTracking"
- "Include", "AsSplitQuery", "ExecuteUpdate", "ExecuteDelete"
- "change tracking", "SaveChanges", "concurrency"

## Roadmap

- `migration-advisor` — schema migration best practices (planned)
- `schema-analyzer` — DbContext model analysis (planned)
