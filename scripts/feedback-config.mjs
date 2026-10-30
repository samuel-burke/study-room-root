// Bakes the feedback destination into server/dist, because Root has no secret
// storage. Reads FEEDBACK_GITHUB_TOKEN + FEEDBACK_GITHUB_REPO (issues in a
// private repo), or FEEDBACK_RESEND_KEY + FEEDBACK_EMAIL (+ optional
// FEEDBACK_FROM) from the environment, else from server/.env. With neither,
// any old file is removed and the feedback box stays hidden.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "server", "dist", "feedback.json");

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map(([, key, value]) => [key, value.replace(/^(["'])(.*)\1$/, "$2")]),
    );
  } catch {
    return {};
  }
}

const file = readEnvFile(path.join(root, "server", ".env"));
const get = (key) => process.env[key] || file[key] || "";
const config = {
  githubToken: get("FEEDBACK_GITHUB_TOKEN"),
  githubRepo: get("FEEDBACK_GITHUB_REPO"),
  resendKey: get("FEEDBACK_RESEND_KEY"),
  email: get("FEEDBACK_EMAIL"),
  from: get("FEEDBACK_FROM"),
};

if ((config.githubToken && config.githubRepo) || (config.resendKey && config.email)) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const kept = Object.fromEntries(Object.entries(config).filter(([, value]) => value));
  fs.writeFileSync(out, JSON.stringify(kept), { mode: 0o600 });
  console.log(
    `feedback: notes go to ${config.githubToken ? `issues in ${config.githubRepo}` : config.email}`,
  );
} else {
  fs.rmSync(out, { force: true });
  console.log("feedback: no destination set in server/.env, feedback box hidden");
}
