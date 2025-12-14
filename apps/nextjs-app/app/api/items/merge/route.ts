import { requireAdmin } from "@/lib/api-auth";
import {
  db,
  items,
  sessions,
  hiddenRecommendations,
} from "@streamystats/database";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { leftId, rightId } = body;

    if (!leftId || !rightId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Both leftId and rightId are required",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (leftId === rightId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Left and right IDs must be different",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const [leftItem, rightItem] = await Promise.all([
      db
        .select()
        .from(items)
        .where(and(eq(items.id, leftId), isNull(items.deletedAt)))
        .limit(1),
      db
        .select()
        .from(items)
        .where(and(eq(items.id, rightId), isNull(items.deletedAt)))
        .limit(1),
    ]);

    if (leftItem.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Left item with ID ${leftId} not found or already deleted`,
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (rightItem.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Right item with ID ${rightId} not found or already deleted`,
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (leftItem[0].serverId !== rightItem[0].serverId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Items must be from the same server",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    const migratedSessions = await db
      .update(sessions)
      .set({ itemId: rightId })
      .where(eq(sessions.itemId, leftId))
      .returning({ id: sessions.id });

    const migratedRecs = await db
      .update(hiddenRecommendations)
      .set({ itemId: rightId })
      .where(eq(hiddenRecommendations.itemId, leftId))
      .returning({ id: hiddenRecommendations.id });

    await db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, leftId));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully merged item ${leftId} into ${rightId}`,
        metrics: {
          sessionsMigrated: migratedSessions.length,
          hiddenRecommendationsMigrated: migratedRecs.length,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error merging items:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to merge items",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
