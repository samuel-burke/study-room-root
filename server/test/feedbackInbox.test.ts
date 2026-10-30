import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  feedbackTitle,
  loadFeedbackDestination,
  RemoteFeedbackInbox,
} from "../src/adapters/feedbackInbox";

const note = {
  id: "n1",
  userId: "ana",
  text: "More boss names please\nThanks",
  createdAt: Date.UTC(2026, 9, 30, 12),
  deliveredAt: null,
};

function fakeFetch(status = 201) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status }));
}

describe("loadFeedbackDestination", () => {
  it("prefers environment variables", () => {
    expect(
      loadFeedbackDestination(
        { FEEDBACK_GITHUB_TOKEN: "t", FEEDBACK_GITHUB_REPO: "sam/feedback" },
        "/nowhere",
      ),
    ).toEqual({ kind: "github", token: "t", repo: "sam/feedback" });
    expect(
      loadFeedbackDestination({ FEEDBACK_RESEND_KEY: "k", FEEDBACK_EMAIL: "a@b.c" }, "/nowhere"),
    ).toEqual({ kind: "email", apiKey: "k", to: "a@b.c", from: undefined });
  });

  it("falls back to the file the build wrote, and is off without one", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-"));
    expect(loadFeedbackDestination({}, dir)).toBeNull();
    fs.writeFileSync(
      path.join(dir, "feedback.json"),
      JSON.stringify({ githubToken: "t", githubRepo: "sam/feedback" }),
    );
    expect(loadFeedbackDestination({}, dir)).toMatchObject({
      kind: "github",
      repo: "sam/feedback",
    });
    fs.writeFileSync(path.join(dir, "feedback.json"), "not json");
    expect(loadFeedbackDestination({}, dir)).toBeNull();
    expect(
      loadFeedbackDestination(
        { FEEDBACK_GITHUB_TOKEN: "t", FEEDBACK_GITHUB_REPO: "../x" },
        "/nowhere",
      ),
    ).toBeNull();
  });
});

describe("RemoteFeedbackInbox", () => {
  it("opens a GitHub issue with only the note and when it was sent", async () => {
    const fetchFn = fakeFetch();
    await new RemoteFeedbackInbox({ kind: "github", token: "t", repo: "sam/fb" }, fetchFn).deliver(
      note,
    );
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/sam/fb/issues");
    expect(init.headers).toMatchObject({ Authorization: "Bearer t" });
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      title: "Feedback: More boss names please",
      body: "More boss names please\nThanks\n\n--\nSent from Study Squad on 2026-10-30T12:00:00.000Z",
    });
    expect(String(init.body)).not.toContain("ana");
  });

  it("emails through Resend once per note", async () => {
    const fetchFn = fakeFetch(200);
    await new RemoteFeedbackInbox({ kind: "email", apiKey: "k", to: "me@x.y" }, fetchFn).deliver(
      note,
    );
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ "Idempotency-Key": "feedback-n1" });
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: ["me@x.y"],
      subject: "Feedback: More boss names please",
    });
    expect(String(init.body)).not.toContain("ana");
  });

  it("throws when the destination refuses the note", async () => {
    const inbox = new RemoteFeedbackInbox(
      { kind: "github", token: "t", repo: "a/b" },
      fakeFetch(401),
    );
    await expect(inbox.deliver(note)).rejects.toThrow("github answered 401");
  });

  it("keeps titles short", () => {
    expect(feedbackTitle("x".repeat(100))).toBe(`Feedback: ${"x".repeat(59)}…`);
  });
});
