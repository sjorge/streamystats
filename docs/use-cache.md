# Next.js "use cache" Directive

The `'use cache'` directive is a Next.js feature for caching server-side data. It replaces the older `unstable_cache` API with a cleaner, more intuitive syntax.

## Setup

Enable in `next.config.mjs`:

```js
const nextConfig = {
  cacheComponents: true,
  // ...
};
```

## Usage

### File-level caching

All exports in the file will be cached:

```ts
"use cache";

export async function getData() {
  return await db.query("SELECT * FROM users");
}
```

### Function-level caching

Cache specific functions:

```ts
export async function getClientStatistics(serverId: number) {
  "use cache";
  cacheLife("days");
  cacheTag(`client-statistics-${serverId}`);

  return await db.select().from(sessions).where(eq(sessions.serverId, serverId));
}
```

## Cache Configuration

### cacheLife

Sets cache duration using presets:

| Preset    | Duration |
|-----------|----------|
| `seconds` | seconds  |
| `minutes` | minutes  |
| `hours`   | hours    |
| `days`    | 1 day    |
| `weeks`   | 1 week   |
| `max`     | max age  |

```ts
import { cacheLife } from "next/cache";

async function getData() {
  "use cache";
  cacheLife("days"); // Cache for 1 day
}
```

### cacheTag

Tag cache entries for manual revalidation:

```ts
import { cacheTag, revalidateTag } from "next/cache";

async function getData(id: number) {
  "use cache";
  cacheTag(`data-${id}`);
}

// Revalidate elsewhere
await revalidateTag("data-123");
```

## How Cache Keys Work

Cache keys are automatically generated from:

1. **Build ID** - invalidates all caches on new deploy
2. **Function ID** - hash of function location/signature
3. **Serializable arguments** - function params become part of the key

This means calling `getData(1)` and `getData(2)` produce separate cache entries automatically.

## Example: Client Statistics

```ts
// lib/db/client-statistics.ts
"use cache";

import { cacheLife, cacheTag } from "next/cache";

export async function getClientStatistics(
  serverId: number,
  startDate?: string,
  endDate?: string,
  userId?: string
) {
  "use cache";
  cacheLife("days");
  cacheTag(`client-statistics-${serverId}`);

  // Query is cached for 1 day per unique combination of args
  const stats = await db.select()...;
  return stats;
}
```

## vs unstable_cache

| Feature | `use cache` | `unstable_cache` |
|---------|-------------|------------------|
| Syntax | Directive | Wrapper function |
| Cache key | Automatic | Manual array |
| Setup | `cacheComponents: true` | None |
| Status | Stable (Next 15+) | Deprecated |

## References

- [Next.js use cache docs](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Cache components guide](https://nextjs.org/docs/app/getting-started/cache-components)

