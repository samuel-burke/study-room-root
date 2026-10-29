import type { VoiceDto } from "@studyroom/core";
import { HeadphonesIcon } from "./Icons";

/**
 * Opens the admin's voice channel in Root, so people can talk while they
 * study. Hidden until an admin picks a channel. Compact shows only the icon
 * and how many people are in there.
 */
export function VoiceButton({ voice, compact }: { voice: VoiceDto; compact: boolean }) {
  if (!voice.joinUrl) return null;
  const count = voice.userIds.length;
  const where = voice.channelName ? ` #${voice.channelName}` : "";
  const label = count > 0 ? `Join voice${where}, ${count} in there` : `Join voice${where}`;
  return (
    <a
      className="voice-btn"
      href={voice.joinUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      data-compact={compact}
    >
      <HeadphonesIcon size={16} />
      {!compact && <span>Join voice</span>}
      {count > 0 && <span className="voice-count">{count}</span>}
    </a>
  );
}

/** Headphones next to the name of someone in the voice channel. */
export function InVoiceMark() {
  return (
    <span className="in-voice" title="In voice" role="img" aria-label="In voice">
      <HeadphonesIcon size={13} />
    </span>
  );
}
