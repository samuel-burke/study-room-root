import { defineProject } from "vitest/config";
import { workspaceAliases } from "../vitest.shared.mts";

export default defineProject({
  resolve: { alias: workspaceAliases },
  test: {
    name: "server",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
