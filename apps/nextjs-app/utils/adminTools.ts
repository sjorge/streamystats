"use server";

import { cookies } from "next/headers";
import { isUserAdmin } from "@/lib/db/users";

export const showAdminStatistics = async () => {
  const isAdmin = await isUserAdmin();

  if (!isAdmin) {
    return false;
  }

  const c = await cookies();
  const showCookie = c.get("show-admin-statistics")?.value;

  if (showCookie === "true") {
    return true;
  }

  return false;
};

export const setShowAdminStatistics = async (show: boolean) => {
  const c = await cookies();
  if (show) {
    c.set("show-admin-statistics", "true");
  } else {
    c.delete("show-admin-statistics");
  }
};
