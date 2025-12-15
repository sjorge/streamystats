import { atomWithStorage } from "jotai/utils";
import type { Server } from "../types";

export const serverAtom = atomWithStorage<Server | null>(
  "selectedServer",
  null,
);
