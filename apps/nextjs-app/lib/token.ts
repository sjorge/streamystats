"use server";

import { cookies } from "next/headers";

export const getToken = async (): Promise<string | undefined> => {
  const c = await cookies();
  const token = c.get("streamystats-token");
  return token?.value;
};
