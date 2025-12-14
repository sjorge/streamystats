import { requireAdmin } from "@/lib/api-auth";
import {
  db,
  items,
  sessions,
  hiddenRecommendations,
} from "@streamystats/database";
import { eq, isNotNull } from "drizzle-orm";

interface MergePair {
  deletedItemId: string;
  activeItemId: string;
}

export async function POST(request: Request) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await request.json();
    const { pairs } = body as { pairs: MergePair[] };

    if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "pairs array is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let totalSessionsMigrated = 0;
    let totalRecsMigrated = 0;
    let totalItemsDeleted = 0;
    const errors: string[] = [];

    for (const pair of pairs) {
      try {
        const deletedItem = await db
          .select()
          .from(items)
          .where(eq(items.id, pair.deletedItemId))
          .limit(1);

        if (deletedItem.length === 0) {
          errors.push(`Deleted item ${pair.deletedItemId} not found`);
          continue;
        }

        if (!deletedItem[0].deletedAt) {
          errors.push(`Item ${pair.deletedItemId} is not deleted`);
          continue;
        }

        const activeItem = await db
          .select()
          .from(items)
          .where(eq(items.id, pair.activeItemId))
          .limit(1);

        if (activeItem.length === 0) {
          errors.push(`Active item ${pair.activeItemId} not found`);
          continue;
        }

        if (activeItem[0].deletedAt) {
          errors.push(`Target item ${pair.activeItemId} is deleted`);
          continue;
        }

        const migratedSessions = await db
          .update(sessions)
          .set({ itemId: pair.activeItemId })
          .where(eq(sessions.itemId, pair.deletedItemId))
          .returning({ id: sessions.id });

        totalSessionsMigrated += migratedSessions.length;

        const migratedRecs = await db
          .update(hiddenRecommendations)
          .set({ itemId: pair.activeItemId })
          .where(eq(hiddenRecommendations.itemId, pair.deletedItemId))
          .returning({ id: hiddenRecommendations.id });

        totalRecsMigrated += migratedRecs.length;

        await db.delete(items).where(eq(items.id, pair.deletedItemId));
        totalItemsDeleted++;
      } catch (pairError) {
        errors.push(
          `Error merging ${pair.deletedItemId} -> ${pair.activeItemId}: ${
            pairError instanceof Error ? pairError.message : "Unknown error"
          }`
        );
      }
    }

    const allSucceeded = errors.length === 0;
    const someSucceeded = totalItemsDeleted > 0;

    let message: string;
    if (allSucceeded) {
      message = `Successfully merged ${totalItemsDeleted} items`;
    } else if (someSucceeded) {
      message = `Merged ${totalItemsDeleted} of ${pairs.length} items (${errors.length} skipped)`;
    } else {
      message = "No items were merged";
    }

    return new Response(
      JSON.stringify({
        success: someSucceeded,
        message,
        metrics: {
          itemsMerged: totalItemsDeleted,
          sessionsMigrated: totalSessionsMigrated,
          hiddenRecommendationsMigrated: totalRecsMigrated,
        },
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error merging items in bulk:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to merge items",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
