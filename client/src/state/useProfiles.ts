import { useEffect, useMemo, useState } from "react";
import type { Profile, StudyRoomGateway } from "../api/gateway";

/** Looks up names and avatars for user ids, fetching only ones it hasn't seen. */
export function useProfiles(
  gateway: StudyRoomGateway,
  userIds: readonly string[],
): Map<string, Profile> {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(() => new Map());
  const key = useMemo(() => [...new Set(userIds)].sort().join("|"), [userIds]);

  useEffect(() => {
    const missing = key.split("|").filter((id) => id && !profiles.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    gateway
      .getProfiles(missing)
      .then((found) => {
        if (cancelled) return;
        setProfiles((current) => {
          const next = new Map(current);
          for (const profile of found) next.set(profile.userId, profile);
          // Remember misses too, so a deleted account isn't fetched on every render.
          for (const id of missing) if (!next.has(id)) next.set(id, { userId: id, name: "Member" });
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [gateway, key, profiles]);

  return profiles;
}
