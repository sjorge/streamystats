# Code of Conduct

A small set of non-negotiable TypeScript/JavaScript conventions for this codebase.

## Time and timestamps

- All timestamps **must** be ISO 8601 UTC with microseconds:
  - Format: `yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'`
  - Use `T` as the date–time separator.
  - Use **6-digit** fractional seconds (microseconds).
  - Always use `Z` to indicate UTC.
- Example: `2025-07-23T07:51:42.811836Z`

## TypeScript type safety

- **Never** use `any`.
  - Prefer `unknown` + narrowing, generics, discriminated unions, or explicit types.
- **Never** use the non-null assertion operator `!`.
  - Prefer control-flow narrowing, optional chaining, nullish coalescing, early returns, or explicit runtime checks / assertion helpers.

## Imports and module boundaries

- All `import` statements must be at the **top of the file**.
- **Never** use inline `await` for module loading (no `await import(...)` in the middle of a file).
- Use `import type` for type-only imports.
  - Example: `import type { Foo } from "./foo";`

## Code style

- Don't add "structure-only" comments (e.g. `/* Overview */`, `{/* Overview */}`).
  - Comments must explain *why*, constraints, or non-obvious behavior—not act as headings.

## React

- **Never** prefix hooks with `React.` (e.g., use `useEffect` not `React.useEffect`).
- **Always** include all dependencies in effect and memo dependency arrays.
  - Missing dependencies can cause stale closures and bugs.

## JavaScript built-ins

- Use `Number.parseInt(...)` instead of global `parseInt(...)`.
  - Example: `Number.parseInt(value, 10)`

## Compiler and linting

- TypeScript must run in **strict** mode (`"strict": true`) and must not allow implicit `any` (`"noImplicitAny": true`).
- Don’t use `@ts-ignore` or `@ts-nocheck`.
  - If you must suppress an error, use `@ts-expect-error` **with a reason** and remove it as soon as possible.
- Don’t use unsafe type assertions (`as Foo`) to “make it compile”.
  - Prefer narrowing, discriminated unions, or runtime validation at boundaries.

## Async correctness

- No floating promises.
  - Every promise must be `await`ed, `return`ed, or explicitly `void`ed.
- Handle errors at boundaries.
  - Don’t swallow errors; propagate or wrap with context.

## General JavaScript/TypeScript hygiene

- Prefer `const`; avoid `let` unless reassignment is required; never use `var`.
- Always use `===` / `!==` (no `==` / `!=`).
- No `console.*` in production code paths.
  - Use a logger abstraction with levels if needed.

## Exports

- Prefer named exports; avoid default exports (unless there’s a clear and consistent reason).

## Dates and numbers

- Never rely on local timezone behavior.
  - Parsing/formatting must be UTC and explicit.
- When parsing integers:
  - Always specify radix `10`.
  - Validate the result (`Number.isFinite(...)`) before use.

# How to create a migration / migrate data

## Normal migrations

Follow instructions carefully.

1. Make changes to `schema.ts` file
2. run `bun run db:generate`
3. Make optional changes to generated .sql file
4. Run migration with `bun run db:migrate`

NEVER manually create `.sql` files and NEVER update or create the _journal file or create snapshots. There are automatically generated and update when running migration commands. It is OK to make changes to the `.sql` file after generating it, for example to add migration of data or enable extensions.

## Manual migrations

If you need really need to create a custom migration without schema changes you can first generate the file with: `bunx drizzle-kit generate --custom --name=your_migration_name`. This should ONLY be used when no schema changes are needed, for example for only data migration.

# Statistics Exclusions

When creating or modifying statistics queries in `lib/db/`, you MUST implement exclusion filters.

## Required Steps

1. **Import the exclusion helper**:
```typescript
import { getStatisticsExclusions } from "./exclusions";
```

2. **Fetch exclusion settings** at the start of your function:
```typescript
const { userExclusion, itemLibraryExclusion, requiresItemsJoin } = await getStatisticsExclusions(serverId);
```

3. **Add user exclusion filter** when querying sessions:
```typescript
const conditions: SQL[] = [/* ... */];
if (userExclusion) {
  conditions.push(userExclusion);
}
```

4. **Add library exclusion filter**:
   - Requires joining the `items` table if not already joined.
   - Use `requiresItemsJoin` to check if you MUST join items.

```typescript
let query = db.select().from(sessions);

// If you need items join for other reasons OR for exclusions:
const needsJoin = requiresItemsJoin || myOtherCondition;

if (needsJoin) {
  query = query.innerJoin(items, eq(sessions.itemId, items.id));
  if (itemLibraryExclusion) {
    conditions.push(itemLibraryExclusion);
  }
}
```

## Key Rules

- Sessions don't have a direct `libraryId` - you MUST join with `items` table to filter by library
- Use `getStatisticsExclusions` to get pre-built SQL conditions
- Always respect both user and library exclusions unless the statistic is specific to one
- The exclusion settings are cached efficiently

## Reference Documentation

See `docs/STATISTICS_EXCLUSIONS.md` for complete implementation patterns and examples.
