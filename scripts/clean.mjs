// Removes installed dependencies and build output. Mirrors Root's template clean script.
import fs from "node:fs";

const paths = [
  "node_modules",
  "package-lock.json",
  "core/dist",
  "contract/dist",
  "networking/gen",
  "server/dist",
  "client/dist",
  "client/dist-demo",
  "coverage",
];

for (const path of paths) {
  if (path === "package-lock.json" && !process.argv.includes("--lockfile")) continue;
  fs.rmSync(path, { recursive: true, force: true });
  console.log(`clean: removed ${path}`);
}
