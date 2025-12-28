import { atomWithStorage } from "jotai/utils";
import type { ServerPublic } from "../types";

export const serverAtom = atomWithStorage<ServerPublic | null>(
  "selectedServer",
  null,
);
