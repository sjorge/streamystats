import { atomWithStorage } from "jotai/utils";
import type { Server } from "../types";

export const tokenAtom = atomWithStorage<string | null>("token", null);
