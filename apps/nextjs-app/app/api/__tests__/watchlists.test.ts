import { describe, expect, test } from "bun:test";

// NOTE: These tests are pure unit tests for the watchlist route handlers.
// We mock db/auth functions to test the route logic in isolation.
//
// IMPORTANT: Bun caches module imports, so we set up mocks at the top level
// and use mock state that can be changed per test.

type Json = Record<string, unknown>;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function createMockRequest(
  options: {
    method?: string;
    body?: unknown;
    searchParams?: Record<string, string>;
  } = {},
): Request & { nextUrl: { searchParams: URLSearchParams } } {
  const url = new URL("http://localhost/api/watchlists");
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const request = new Request(url.toString(), {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return Object.assign(request, {
    nextUrl: { searchParams: url.searchParams },
  });
}

// Bun module mocking API
const bunMock = await import("bun:test").then((m) => (m as any).mock);

// Sample test data
const mockSession = {
  id: "user-123",
  serverId: 1,
  name: "Test User",
  isAdmin: false,
};

const mockAdminSession = {
  id: "admin-456",
  serverId: 1,
  name: "Admin User",
  isAdmin: true,
};

const mockWatchlist = {
  id: 1,
  serverId: 1,
  userId: "user-123",
  name: "My Favorites",
  description: "My favorite movies",
  isPublic: false,
  isPromoted: false,
  allowedItemType: "Movie",
  defaultSortOrder: "custom",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  itemCount: 2,
};

const mockWatchlistWithItems = {
  ...mockWatchlist,
  items: [
    {
      id: 1,
      watchlistId: 1,
      itemId: "item-abc",
      position: 0,
      addedAt: new Date().toISOString(),
      item: {
        id: "item-abc",
        name: "Test Movie",
        type: "Movie",
        productionYear: 2024,
      },
    },
    {
      id: 2,
      watchlistId: 1,
      itemId: "item-def",
      position: 1,
      addedAt: new Date().toISOString(),
      item: {
        id: "item-def",
        name: "Another Movie",
        type: "Movie",
        productionYear: 2023,
      },
    },
  ],
};

const mockWatchlistItem = {
  id: 3,
  watchlistId: 1,
  itemId: "item-new",
  position: 2,
  addedAt: new Date().toISOString(),
};

// ============================================================================
// Mock state - changed per test
// ============================================================================
const mockState = {
  // Auth
  isAuthenticated: true,
  isAdmin: false,

  // DB returns
  watchlists: [mockWatchlist] as (typeof mockWatchlist)[],
  watchlistWithItems: mockWatchlistWithItems as
    | typeof mockWatchlistWithItems
    | null,
  createdWatchlist: mockWatchlist as typeof mockWatchlist,
  updatedWatchlist: mockWatchlist as typeof mockWatchlist | null,
  deleteResult: true,
  addItemResult: mockWatchlistItem as typeof mockWatchlistItem | null,
  removeItemResult: true,
};

function resetMockState() {
  mockState.isAuthenticated = true;
  mockState.isAdmin = false;
  mockState.watchlists = [mockWatchlist];
  mockState.watchlistWithItems = mockWatchlistWithItems;
  mockState.createdWatchlist = mockWatchlist;
  mockState.updatedWatchlist = mockWatchlist;
  mockState.deleteResult = true;
  mockState.addItemResult = mockWatchlistItem;
  mockState.removeItemResult = true;
}

// ============================================================================
// Set up all mocks BEFORE any imports
// ============================================================================
bunMock.module("@/lib/api-auth", () => ({
  requireAuth: async () => {
    if (!mockState.isAuthenticated) {
      return {
        error: jsonResponse({ error: "Unauthorized" }, { status: 401 }),
        session: null,
      };
    }
    return {
      error: null,
      session: mockState.isAdmin ? mockAdminSession : mockSession,
    };
  },
}));

bunMock.module("@/lib/db/watchlists", () => ({
  getWatchlistsForUser: async () => mockState.watchlists,
  createWatchlist: async () => mockState.createdWatchlist,
  getWatchlistWithItemsLite: async () => mockState.watchlistWithItems,
  getWatchlistWithItems: async () => mockState.watchlistWithItems,
  updateWatchlist: async () => mockState.updatedWatchlist,
  updateWatchlistAsAdmin: async () => mockState.updatedWatchlist,
  deleteWatchlist: async () => mockState.deleteResult,
  addItemToWatchlist: async () => mockState.addItemResult,
  removeItemFromWatchlist: async () => mockState.removeItemResult,
}));

// ============================================================================
// Import routes AFTER mocks are set up
// ============================================================================
const watchlistsRoute = await import("../watchlists/route");
const watchlistByIdRoute = await import("../watchlists/[id]/route");
const watchlistItemsRoute = await import("../watchlists/[id]/items/route");
const watchlistItemByIdRoute = await import(
  "../watchlists/[id]/items/[itemId]/route"
);

// ============================================================================
// Tests
// ============================================================================

describe("GET /api/watchlists", () => {
  test("returns list of watchlists for authenticated user", async () => {
    resetMockState();
    const req = createMockRequest();
    const res = await watchlistsRoute.GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.data).toBeDefined();
    expect((body.data as unknown[]).length).toBe(1);
    expect((body.data as any[])[0].name).toBe("My Favorites");
  });

  test("returns 401 when not authenticated", async () => {
    resetMockState();
    mockState.isAuthenticated = false;

    const req = createMockRequest();
    const res = await watchlistsRoute.GET(req);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/watchlists", () => {
  test("creates a new watchlist", async () => {
    resetMockState();
    mockState.createdWatchlist = { ...mockWatchlist, id: 5, name: "New List" };

    const req = createMockRequest({
      method: "POST",
      body: { name: "New List", description: "A new watchlist" },
    });
    const res = await watchlistsRoute.POST(req);

    expect(res.status).toBe(201);
    const body = (await res.json()) as Json;
    expect((body.data as any).name).toBe("New List");
  });

  test("returns 400 when name is missing", async () => {
    resetMockState();

    const req = createMockRequest({
      method: "POST",
      body: { description: "No name provided" },
    });
    const res = await watchlistsRoute.POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe("Name is required");
  });

  test("returns 400 for invalid defaultSortOrder", async () => {
    resetMockState();

    const req = createMockRequest({
      method: "POST",
      body: { name: "Test", defaultSortOrder: "invalid" },
    });
    const res = await watchlistsRoute.POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect((body.error as string).includes("defaultSortOrder")).toBe(true);
  });
});

describe("GET /api/watchlists/[id]", () => {
  test("returns watchlist with items", async () => {
    resetMockState();

    const req = createMockRequest();
    const res = await watchlistByIdRoute.GET(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect((body.data as any).id).toBe(1);
    expect((body.data as any).items.length).toBe(2);
  });

  test("returns IDs format when requested", async () => {
    resetMockState();

    const req = createMockRequest({ searchParams: { format: "ids" } });
    const res = await watchlistByIdRoute.GET(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    const data = body.data as any;
    expect(data.items).toEqual(["item-abc", "item-def"]);
  });

  test("returns 400 for invalid watchlist ID", async () => {
    resetMockState();

    const req = createMockRequest();
    const res = await watchlistByIdRoute.GET(req, {
      params: Promise.resolve({ id: "invalid" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe("Invalid watchlist ID");
  });

  test("returns 404 when watchlist not found", async () => {
    resetMockState();
    mockState.watchlistWithItems = null;

    const req = createMockRequest();
    const res = await watchlistByIdRoute.GET(req, {
      params: Promise.resolve({ id: "999" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/watchlists/[id]", () => {
  test("updates watchlist name", async () => {
    resetMockState();
    mockState.updatedWatchlist = { ...mockWatchlist, name: "Updated Name" };

    const req = createMockRequest({
      method: "PATCH",
      body: { name: "Updated Name" },
    });
    const res = await watchlistByIdRoute.PATCH(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect((body.data as any).name).toBe("Updated Name");
  });

  test("returns 400 for empty name", async () => {
    resetMockState();

    const req = createMockRequest({
      method: "PATCH",
      body: { name: "   " },
    });
    const res = await watchlistByIdRoute.PATCH(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe("Name cannot be empty");
  });

  test("returns 403 when non-admin tries to set isPromoted", async () => {
    resetMockState();

    const req = createMockRequest({
      method: "PATCH",
      body: { isPromoted: true },
    });
    const res = await watchlistByIdRoute.PATCH(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as Json;
    expect((body.error as string).includes("admin")).toBe(true);
  });

  test("allows admin to set isPromoted", async () => {
    resetMockState();
    mockState.isAdmin = true;
    mockState.updatedWatchlist = { ...mockWatchlist, isPromoted: true };

    const req = createMockRequest({
      method: "PATCH",
      body: { isPromoted: true },
    });
    const res = await watchlistByIdRoute.PATCH(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect((body.data as any).isPromoted).toBe(true);
  });

  test("returns 404 when watchlist not found", async () => {
    resetMockState();
    mockState.updatedWatchlist = null;

    const req = createMockRequest({
      method: "PATCH",
      body: { name: "New Name" },
    });
    const res = await watchlistByIdRoute.PATCH(req, {
      params: Promise.resolve({ id: "999" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/watchlists/[id]", () => {
  test("deletes watchlist successfully", async () => {
    resetMockState();

    const req = createMockRequest({ method: "DELETE" });
    const res = await watchlistByIdRoute.DELETE(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.success).toBe(true);
  });

  test("returns 404 when watchlist not found or access denied", async () => {
    resetMockState();
    mockState.deleteResult = false;

    const req = createMockRequest({ method: "DELETE" });
    const res = await watchlistByIdRoute.DELETE(req, {
      params: Promise.resolve({ id: "999" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/watchlists/[id]/items", () => {
  test("returns items in watchlist", async () => {
    resetMockState();

    const req = createMockRequest();
    const res = await watchlistItemsRoute.GET(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect((body.data as any).items.length).toBe(2);
  });

  test("returns 404 when watchlist not found", async () => {
    resetMockState();
    mockState.watchlistWithItems = null;

    const req = createMockRequest();
    const res = await watchlistItemsRoute.GET(req, {
      params: Promise.resolve({ id: "999" }),
    });

    expect(res.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    resetMockState();
    mockState.isAuthenticated = false;

    const req = createMockRequest();
    const res = await watchlistItemsRoute.GET(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/watchlists/[id]/items", () => {
  test("adds item to watchlist", async () => {
    resetMockState();

    const req = createMockRequest({
      method: "POST",
      body: { itemId: "item-new" },
    });
    const res = await watchlistItemsRoute.POST(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as Json;
    expect((body.data as any).itemId).toBe("item-new");
  });

  test("returns 400 when itemId is missing", async () => {
    resetMockState();

    const req = createMockRequest({
      method: "POST",
      body: {},
    });
    const res = await watchlistItemsRoute.POST(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect(body.error).toBe("itemId is required");
  });

  test("returns 400 when add fails (duplicate or type mismatch)", async () => {
    resetMockState();
    mockState.addItemResult = null;

    const req = createMockRequest({
      method: "POST",
      body: { itemId: "item-existing" },
    });
    const res = await watchlistItemsRoute.POST(req, {
      params: Promise.resolve({ id: "1" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as Json;
    expect((body.error as string).includes("Failed to add item")).toBe(true);
  });
});

describe("DELETE /api/watchlists/[id]/items/[itemId]", () => {
  test("removes item from watchlist", async () => {
    resetMockState();

    const req = createMockRequest({ method: "DELETE" });
    const res = await watchlistItemByIdRoute.DELETE(req, {
      params: Promise.resolve({ id: "1", itemId: "item-abc" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.success).toBe(true);
  });

  test("returns 404 when item not found or access denied", async () => {
    resetMockState();
    mockState.removeItemResult = false;

    const req = createMockRequest({ method: "DELETE" });
    const res = await watchlistItemByIdRoute.DELETE(req, {
      params: Promise.resolve({ id: "1", itemId: "nonexistent" }),
    });

    expect(res.status).toBe(404);
  });

  test("returns 401 when not authenticated", async () => {
    resetMockState();
    mockState.isAuthenticated = false;

    const req = createMockRequest({ method: "DELETE" });
    const res = await watchlistItemByIdRoute.DELETE(req, {
      params: Promise.resolve({ id: "1", itemId: "item-abc" }),
    });

    expect(res.status).toBe(401);
  });

  test("returns 400 for invalid watchlist ID", async () => {
    resetMockState();

    const req = createMockRequest({ method: "DELETE" });
    const res = await watchlistItemByIdRoute.DELETE(req, {
      params: Promise.resolve({ id: "invalid", itemId: "item-abc" }),
    });

    expect(res.status).toBe(400);
  });
});
