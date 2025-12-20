# Statistics Exclusions

## Overview

StreamyStats supports excluding specific users and libraries from all statistics. This is an admin-only feature that hides data from the UI while still collecting and syncing all underlying data.

## Database Schema

Exclusion settings are stored on the `servers` table:

```typescript
// packages/database/src/schema.ts
excludedUserIds: text("excluded_user_ids").array().default([]),
excludedLibraryIds: text("excluded_library_ids").array().default([]),
```

## Helper Functions

All exclusion logic is centralized in `apps/nextjs-app/lib/db/exclusions.ts`:

```typescript
import { getExclusionSettings } from "./exclusions";

// Fetch exclusion settings (cached)
const { excludedUserIds, excludedLibraryIds } = await getExclusionSettings(serverId);
```

## Implementation Pattern

### For User Exclusions

User exclusions filter sessions by `userId`. This is straightforward since sessions have a direct `userId` field:

```typescript
import { notInArray } from "drizzle-orm";
import { getExclusionSettings } from "./exclusions";

const { excludedUserIds } = await getExclusionSettings(Number(serverId));

const whereConditions: ReturnType<typeof eq>[] = [
  eq(sessions.serverId, serverId),
  // ... other conditions
];

if (excludedUserIds.length > 0) {
  whereConditions.push(notInArray(sessions.userId, excludedUserIds));
}
```

### For Library Exclusions

Library exclusions require joining the `items` table since sessions don't have a direct `libraryId`:

```typescript
import { notInArray } from "drizzle-orm";
import { getExclusionSettings } from "./exclusions";

const { excludedUserIds, excludedLibraryIds } = await getExclusionSettings(
  Number(serverId)
);

const whereConditions: ReturnType<typeof eq>[] = [
  eq(sessions.serverId, serverId),
  // ... other conditions
];

// User exclusion
if (excludedUserIds.length > 0) {
  whereConditions.push(notInArray(sessions.userId, excludedUserIds));
}

// Library exclusion - requires items join
if (excludedLibraryIds.length > 0) {
  whereConditions.push(notInArray(items.libraryId, excludedLibraryIds));
}

// Query MUST join items table when library exclusions exist
const results = await db
  .select({ /* ... */ })
  .from(sessions)
  .innerJoin(items, eq(sessions.itemId, items.id))  // Required for library filter
  .where(and(...whereConditions));
```

### Conditional Join Pattern

When a function may or may not need the items join (e.g., optional item type filtering), use this pattern:

```typescript
const { excludedUserIds, excludedLibraryIds } = await getExclusionSettings(serverId);

// Need items join if we have library exclusions OR other item-dependent filters
const needsItemJoin = 
  excludedLibraryIds.length > 0 || 
  someOtherConditionRequiringItems;

let query = db
  .select({ /* ... */ })
  .from(sessions)
  .leftJoin(users, eq(sessions.userId, users.id));

if (needsItemJoin) {
  query = query.innerJoin(items, eq(sessions.itemId, items.id));
  
  if (excludedLibraryIds.length > 0) {
    whereConditions.push(notInArray(items.libraryId, excludedLibraryIds));
  }
}
```

## Files Updated

The following statistics files implement exclusions:

| File | Exclusion Type |
|------|----------------|
| `lib/db/statistics.ts` | User + Library |
| `lib/db/users.ts` | User + Library |
| `lib/db/client-statistics.ts` | User |
| `lib/db/transcoding-statistics.ts` | User |
| `lib/db/library-statistics.ts` | User + Library |
| `lib/db/items.ts` | User |
| `lib/db/history.ts` | User + Library |
| `lib/db/similar-statistics.ts` | User + Library |
| `lib/db/similar-series-statistics.ts` | User + Library |
| `lib/db/user-similarity.ts` | User |
| `lib/db/seasonal-recommendations.ts` | Library |

## Checklist for New Statistics Functions

When creating a new statistics query function:

1. [ ] Import `getExclusionSettings` from `./exclusions`
2. [ ] Fetch exclusion settings at the start of the function
3. [ ] Add user exclusion filter if querying sessions
4. [ ] Add library exclusion filter if the statistic should respect library visibility
5. [ ] Join with `items` table if library exclusion is needed
6. [ ] Use `notInArray` from drizzle-orm for exclusion conditions

## Settings UI

Admins can manage exclusions at:
`/servers/[id]/settings/exclusions`

The UI is in:
- `app/(app)/servers/[id]/(auth)/settings/exclusions/page.tsx`
- `ExcludedUsersManager.tsx`
- `ExcludedLibrariesManager.tsx`

## Cache Invalidation

When exclusion settings change, the following cache tags are invalidated:
- `exclusion-settings-{serverId}`

The exclusion settings themselves are cached with `cacheLife("hours")`.

