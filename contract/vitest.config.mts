import { defineProject } from "vitest/config";
import { workspaceAliases } from "../vitest.shared.mts";

export default defineProject({
  resolve: { alias: workspaceAliases },
  test: {
    name: "contract",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
