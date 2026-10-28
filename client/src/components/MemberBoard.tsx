import type { MemberCardDto } from "@studyroom/core";
import type { Profile } from "../api/gateway";
import { isFocusing, rowTime, statusChip } from "../lib/view";
import { Avatar } from "./Avatar";
import { FlameIcon, LockIcon } from "./Icons";

interface BoardProps {
  members: MemberCardDto[];
  profiles: Map<string, Profile>;
  youId: string;
  now: number;
  compact?: boolean;
}

/** You first, then everyone else in the order they started. */
export function orderMembers(members: MemberCardDto[], youId: string): MemberCardDto[] {
  return [
    ...members.filter((m) => m.userId === youId),
    ...members.filter((m) => m.userId !== youId),
  ];
}

function goalText(member: MemberCardDto) {
  if (member.goalPrivate) return null;
  return member.goalText || null;
}

function MemberCard({
  member,
  profile,
  you,
  now,
}: {
  member: MemberCardDto;
  profile?: Profile;
  you: boolean;
  now: number;
}) {
  const chip = statusChip(member, now);
  const name = you ? "You" : (profile?.name ?? "Member");
  const goal = goalText(member);
  return (
    <li className="member-card" data-you={you} aria-label={`${name}, ${chip.label}`}>
      <div className="member-top">
        <Avatar userId={member.userId} profile={profile} you={you} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="member-name">
            <span className="name">{name}</span>
            <span className="level-chip">Lv {member.level}</span>
          </div>
          <div className="streak-line">
            <FlameIcon size={13} stroke="var(--flame)" />
            {member.streak} day streak
          </div>
        </div>
      </div>
      {goal ? (
        <div className="member-goal" title={goal}>
          {goal}
        </div>
      ) : (
        <div className="member-goal private">
          {member.goalPrivate && <LockIcon size={14} />}
          Focusing
        </div>
      )}
      <div className="chip" data-tone={chip.tone}>
        <span className="dot" />
        {chip.label}
      </div>
    </li>
  );
}

function MemberRow({
  member,
  profile,
  you,
  now,
}: {
  member: MemberCardDto;
  profile?: Profile;
  you: boolean;
  now: number;
}) {
  const chip = statusChip(member, now);
  const name = you ? "You" : (profile?.name ?? "Member");
  const goal = goalText(member) ?? (member.goalPrivate ? "Focusing (private)" : "Focusing");
  const time = rowTime(member, now);
  return (
    <li className="member-row" aria-label={`${name}, ${chip.label}`}>
      <Avatar userId={member.userId} profile={profile} you={you} />
      <div className="body">
        <div style={{ fontSize: 14, fontWeight: 700 }}>{name}</div>
        <div className="goal-line">{goal}</div>
      </div>
      <div className="time" data-tone={chip.tone}>
        {time}
      </div>
    </li>
  );
}

export function MemberBoard({ members, profiles, youId, now, compact }: BoardProps) {
  const ordered = orderMembers(members, youId);
  const focusing = members.filter(isFocusing).length;
  const onBreak = members.length - focusing;

  if (compact) {
    return (
      <section aria-label="Who is in the room" className="mobile-board">
        <h2>Focusing now · {focusing}</h2>
        <ul className="goal-list" style={{ gap: 8 }}>
          {ordered.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              profile={profiles.get(m.userId)}
              you={m.userId === youId}
              now={now}
            />
          ))}
        </ul>
        {members.length === 0 && <EmptyBoard />}
      </section>
    );
  }

  return (
    <section
      aria-label="Who is in the room"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div className="board-head">
        <h2>Focusing now · {focusing}</h2>
        {onBreak > 0 && <div className="small muted">{onBreak} on break</div>}
      </div>
      {members.length === 0 ? (
        <EmptyBoard />
      ) : (
        <ul className="board">
          {ordered.map((m) => (
            <MemberCard
              key={m.userId}
              member={m}
              profile={profiles.get(m.userId)}
              you={m.userId === youId}
              now={now}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyBoard() {
  return (
    <div className="empty-board">
      The room is quiet. Start a timer and you'll be the first card on the board.
    </div>
  );
}
