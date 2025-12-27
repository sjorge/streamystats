import type { Item } from "@streamystats/database";

// Person type from Jellyfin
export interface Person {
  Id: string;
  Name: string;
  Role?: string;
  Type: string;
  PrimaryImageTag?: string;
}

export interface ActorStats {
  id: string;
  name: string;
  type: string;
  role?: string;
  primaryImageTag?: string;
  totalItems: number;
  totalViews: number;
  totalWatchTime: number;
}

export interface ActorItem {
  item: Item;
  role?: string;
  totalViews: number;
  totalWatchTime: number;
}

export interface ActorDetailsResponse {
  id: string;
  name: string;
  type: string;
  primaryImageTag?: string;
  totalItems: number;
  totalViews: number;
  totalWatchTime: number;
  items: ActorItem[];
}

/**
 * Parse the people JSONB field from an item
 */
export function parsePeople(people: unknown): Person[] {
  if (!people) return [];

  try {
    if (Array.isArray(people)) {
      return people.filter(
        (p): p is Person => !!p && typeof p === "object" && !!p.Name && !!p.Id
      );
    }

    if (typeof people === "object") {
      return Object.values(people as Record<string, Person>).filter(
        (p): p is Person => !!p && typeof p === "object" && !!p.Name && !!p.Id
      );
    }

    if (typeof people === "string") {
      const parsed = JSON.parse(people);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (p): p is Person => !!p && typeof p === "object" && !!p.Name && !!p.Id
        );
      }
      if (typeof parsed === "object") {
        return Object.values(parsed as Record<string, Person>).filter(
          (p): p is Person => !!p && typeof p === "object" && !!p.Name && !!p.Id
        );
      }
    }
  } catch {
    // Failed to parse
  }

  return [];
}

/**
 * Get cast from an item's people field (only actors)
 */
export const getItemCast = (item: Item): Person[] => {
  const people = parsePeople(item.people);
  return people.filter((p) => p.Type === "Actor");
};

/**
 * Get directors from an item's people field
 */
export const getItemDirectors = (item: Item): Person[] => {
  const people = parsePeople(item.people);
  return people.filter((p) => p.Type === "Director");
};

/**
 * Get writers from an item's people field
 */
export const getItemWriters = (item: Item): Person[] => {
  const people = parsePeople(item.people);
  return people.filter((p) => p.Type === "Writer");
};

/**
 * Get all people from an item grouped by type
 */
export const getItemPeopleGrouped = (
  item: Item
): Record<string, Person[]> => {
  const people = parsePeople(item.people);
  const grouped: Record<string, Person[]> = {};

  for (const person of people) {
    const type = person.Type || "Other";
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(person);
  }

  return grouped;
};

