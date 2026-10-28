import { fileURLToPath } from "node:url";

/** Workspace packages resolve to their TypeScript source in tests, so no build step is needed first. */
export const workspaceAliases = {
  "@studyroom/core": fileURLToPath(new URL("./core/src/index.ts", import.meta.url)),
  "@studyroom/contract": fileURLToPath(new URL("./contract/src/index.ts", import.meta.url)),
};
