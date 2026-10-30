import fs from "node:fs";
import path from "node:path";
import type { FeedbackInbox, FeedbackRecord } from "@studyroom/core";

/**
 * Where feedback goes. Root has no secret storage, so this is baked into the
 * package at build time (scripts/feedback-config.mjs) and never committed.
 */
export type FeedbackDestination =
  /** A fine-grained token with Issues read/write on one private repo ("owner/name"). */
  | { kind: "github"; token: string; repo: string }
  /** A Resend key. Without a verified domain, Resend only delivers to the account's own email. */
  | { kind: "email"; apiKey: string; to: string; from?: string };

/** Written next to main.js by the server build. */
export const FEEDBACK_CONFIG_FILE = "feedback.json";

const REPO = /^[A-Za-z0-9-]+\/(?!\.)[A-Za-z0-9_.-]+$/;

function parseDestination(raw: Record<string, unknown>): FeedbackDestination | null {
  const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  if (str("githubToken") && REPO.test(str("githubRepo"))) {
    return { kind: "github", token: str("githubToken"), repo: str("githubRepo") };
  }
  if (str("resendKey") && str("email")) {
    return {
      kind: "email",
      apiKey: str("resendKey"),
      to: str("email"),
      from: str("from") || undefined,
    };
  }
  return null;
}

/**
 * Reads the destination from FEEDBACK_* environment variables, else from the
 * file the build wrote. Returns null when nothing is set, which hides the box.
 */
export function loadFeedbackDestination(
  env: Record<string, string | undefined>,
  dir: string,
): FeedbackDestination | null {
  const fromEnv = parseDestination({
    githubToken: env.FEEDBACK_GITHUB_TOKEN,
    githubRepo: env.FEEDBACK_GITHUB_REPO,
    resendKey: env.FEEDBACK_RESEND_KEY,
    email: env.FEEDBACK_EMAIL,
    from: env.FEEDBACK_FROM,
  });
  if (fromEnv) return fromEnv;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, FEEDBACK_CONFIG_FILE), "utf8"));
    return raw && typeof raw === "object" ? parseDestination(raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 15_000;

/** The note's first line, shortened, for an issue title or email subject. */
export function feedbackTitle(text: string): string {
  const first = text.split("\n")[0]!.trim();
  return `Feedback: ${first.length > 60 ? `${first.slice(0, 59)}…` : first}`;
}

/**
 * Sends notes anonymously: only the text and when it was sent. No name, user
 * id or community leaves the app.
 */
export class RemoteFeedbackInbox implements FeedbackInbox {
  constructor(
    private readonly destination: FeedbackDestination,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async deliver(note: FeedbackRecord): Promise<void> {
    const title = feedbackTitle(note.text);
    const body = `${note.text}\n\n--\nSent from Study Squad on ${new Date(note.createdAt).toISOString()}`;
    const d = this.destination;
    const response =
      d.kind === "github"
        ? await this.fetchFn(`https://api.github.com/repos/${d.repo}/issues`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${d.token}`,
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "User-Agent": "study-squad-feedback",
              "X-GitHub-Api-Version": "2022-11-28",
            },
            body: JSON.stringify({ title, body }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          })
        : await this.fetchFn("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${d.apiKey}`,
              "Content-Type": "application/json",
              // A retried note is sent once, even if the first try timed out after Resend took it.
              "Idempotency-Key": `feedback-${note.id}`,
            },
            body: JSON.stringify({
              from: d.from ?? "Study Squad <onboarding@resend.dev>",
              to: [d.to],
              subject: title,
              text: body,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`${d.kind} answered ${response.status}: ${detail}`);
    }
  }
}
