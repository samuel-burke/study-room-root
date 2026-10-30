import { LIMITS } from "@studyroom/core";
import { useState } from "react";
import { toGatewayError, type StudyRoomGateway } from "../api/gateway";
import { Sheet } from "./Sheet";

/**
 * A note for the community admins. The server posts it to the feedback
 * channel they picked in App settings, so it reads as a normal Root message.
 */
export function FeedbackSheet({
  gateway,
  onClose,
}: {
  gateway: StudyRoomGateway;
  onClose(): void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = LIMITS.feedbackMaxLength;
  const empty = text.trim().length === 0;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await gateway.sendFeedback(text);
      setSent(true);
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet labelledBy="feedback-title" onClose={onClose}>
      <h1 id="feedback-title">Send feedback</h1>
      {sent ? (
        <>
          <div role="status" className="small">
            Thanks! Your note was sent to the people who run Study Squad here.
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
            Done
          </button>
        </>
      ) : (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!empty && !busy) void send();
          }}
        >
          <label className="field">
            <span className="small muted">
              Ideas, bugs, anything. Your name is shown with it in the community&apos;s feedback
              channel.
            </span>
            <textarea
              className="input feedback-input"
              rows={5}
              maxLength={max}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              data-autofocus
            />
            <span className="tiny dim" style={{ textAlign: "right" }}>
              {text.length} / {max}
            </span>
          </label>
          {error && (
            <div role="alert" className="small" style={{ color: "var(--coral)" }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={empty || busy}
            >
              {busy ? "Sending…" : "Send"}
            </button>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
