"use server";

import { db, servers } from "@streamystats/database";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteServer as deleteServerFromDb } from "@/lib/db/server";

/**
 * Server action to delete a server
 * @param serverId - The ID of the server to delete
 */
export async function deleteServerAction(serverId: number) {
  try {
    const result = await deleteServerFromDb({ serverId });

    if (result.success) {
      // Revalidate relevant paths
      revalidatePath("/");
      revalidatePath("/servers");

      // Return success result
      return {
        success: true,
        message: result.message,
      };
    }
    return {
      success: false,
      message: result.message,
    };
  } catch (error) {
    console.error("Server action - Error deleting server:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to delete server",
    };
  }
}

/**
 * Server action to update server timezone
 * @param serverId - The ID of the server to update
 * @param timezone - IANA timezone identifier (e.g., "America/New_York")
 */
export async function updateServerTimezoneAction(
  serverId: number,
  timezone: string,
) {
  try {
    // Validate timezone is a valid IANA identifier
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return {
        success: false,
        message: "Invalid timezone identifier",
      };
    }

    await db
      .update(servers)
      .set({ timezone, updatedAt: new Date() })
      .where(eq(servers.id, serverId));

    // Revalidate all pages that display dates for this server
    revalidatePath(`/servers/${serverId}`);

    return {
      success: true,
      message: "Timezone updated successfully",
    };
  } catch (error) {
    console.error("Server action - Error updating timezone:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to update timezone",
    };
  }
}
