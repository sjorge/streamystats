import { headers } from "next/headers";

export const shouldUseSecureCookies = async (): Promise<boolean> => {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "https";
};
