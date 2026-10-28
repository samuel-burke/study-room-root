import { formatHours, type LeaderboardDto, type LeaderboardEntryDto } from "@studyroom/core";
import { useEffect, useMemo, useState } from "react";
import { toGatewayError, type Profile, type StudyRoomGateway } from "../api/gateway";
import { useProfiles } from "../state/useProfiles";
import { Avatar } from "./Avatar";
import { Toggle } from "./Toggle";

/** This week's standings by focus minutes, with the member's own opt-out switch. */
export function WeeklyLeaderboard({ gateway }: { gateway: StudyRoomGateway }) {
  const [board, setBoard] = useState<LeaderboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const youId = gateway.currentUserId();

  useEffect(() => {
    let cancelled = false;
    gateway
      .getLeaderboard()
      .then((b) => {
        if (cancelled) return;
        setBoard(b);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(toGatewayError(e).message));
    return () => {
      cancelled = true;
    };
  }, [gateway, attempt]);

  const userIds = useMemo(() => board?.entries.map((e) => e.userId) ?? [], [board]);
  const profiles = useProfiles(gateway, userIds);

  async function setShown(shown: boolean) {
    setSaving(true);
    setError(null);
    try {
      setBoard(await gateway.setLeaderboardHidden(!shown));
    } catch (e) {
      setError(toGatewayError(e).message);
    } finally {
      setSaving(false);
    }
  }

  const youListed = board?.entries.some((e) => e.userId === youId) ?? false;

  return (
    <section className="card" aria-label="Weekly leaderboard">
      <div className="row-between">
        <h2 style={{ fontSize: 16 }}>This week</h2>
        <span className="tiny dim">By focus minutes · resets Monday</span>
      </div>

      {error && (
        <div className="small" role="alert" style={{ color: "var(--coral-text)" }}>
          {error}
        </div>
      )}
      {!board && !error && <div className="muted small">Loading…</div>}
      {!board && error && (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      )}

      {board && (
        <>
          {board.entries.length === 0 ? (
            <div className="small muted">Nobody has focused yet this week. Start a timer!</div>
          ) : (
            <ol className="goal-list leaderboard" style={{ gap: 6 }}>
              {board.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  profile={profiles.get(entry.userId)}
                  you={entry.userId === youId}
                />
              ))}
              {!youListed && board.me.rank > 0 && (
                <LeaderboardRow
                  entry={{
                    userId: youId,
                    rank: board.me.rank,
                    focusMinutes: board.me.focusMinutes,
                  }}
                  you
                />
              )}
            </ol>
          )}
          {board.me.hidden && (
            <div className="small muted">
              You&apos;re hidden. Your {formatHours(board.me.focusMinutes)} this week still count
              for you and the boss.
            </div>
          )}
          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 700 }}>Show me on the leaderboard</div>
              <div className="hint">Also lists you in recap rankings</div>
            </div>
            <Toggle
              label="Show me on the leaderboard"
              checked={!board.me.hidden}
              disabled={saving}
              onChange={(shown) => void setShown(shown)}
            />
          </div>
        </>
      )}
    </section>
  );
}

function LeaderboardRow({
  entry,
  profile,
  you,
}: {
  entry: LeaderboardEntryDto;
  profile?: Profile;
  you: boolean;
}) {
  const name = you ? "You" : (profile?.name ?? "Member");
  const time = formatHours(entry.focusMinutes);
  return (
    <li className="member-row" data-you={you} aria-label={`Rank ${entry.rank}, ${name}, ${time}`}>
      <span className="rank tabular" aria-hidden="true">
        {entry.rank}
      </span>
      <Avatar userId={entry.userId} profile={profile} you={you} />
      <div className="body" style={{ fontSize: 14, fontWeight: 700 }}>
        {name}
      </div>
      <div className="time">{time}</div>
    </li>
  );
}
