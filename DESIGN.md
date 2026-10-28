# Design decisions

This file records the "why" behind Study Squad's rules and structure. Numbers live in code in `core/src/constants.ts`; if they change, update this file in the same pull request.

## The server owns the timer

The room timer is stored as one row: when the current cycle started and which preset it uses. A cycle is laid out deterministically (`core/src/timer/roomCycle.ts`): focus, break, focus, break, focus, break, focus, long break. Any phase at any instant is a pure function of those two values, so:

- every client computes the same countdown from server timestamps, and a late or dropped push never makes them drift;
- clients estimate their clock offset from request round trips (`ClockSync`, keeping the lowest-latency sample), so a phone with a wrong clock still shows the right time;
- after a restart the server settles every phase that ended while it was down, then carries on.

Admins can change the preset at any time. The change applies from the next cycle, so nobody's running round changes length underneath them.

## One engine, behind ports

`StudyRoomEngine` (in `core`) contains every use case. It depends only on interfaces: `Store`, `Clock`, `WakeScheduler`, `Notifier`, `Announcer`, `Logger`. The server plugs in SQLite and Root's broadcast and channel APIs; the browser demo plugs in an in-memory store and local events. This is why the rules are tested without Root, and why the demo behaves exactly like production.

Every engine operation goes through a serial queue and one store transaction. It first settles whatever came due, then does its work, then pushes notifications only after the transaction commits. A failed operation leaves no partial state and notifies nobody.

Importing `@rootsdk/server-app` exits the process when `COMMUNITY_ID` is missing, so only `server/src/main.ts` and `server/src/studyRoomService.ts` import it. Everything else on the server takes interfaces and is unit tested.

## Shared timer first, solo timers welcome

The room timer is the default and the brighter button because joining it is what makes the room feel like a group and what feeds the combo. Solo timers (5 to 180 minutes) still appear on the board so nobody is left out. You can be on one or the other, not both.

## Rewards

| Rule              | Value                                                             | Why                                                                      |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Focus XP          | 2 XP per whole minute × combo                                     | Rewards time, not task count                                             |
| Goal XP           | +25 once per goal                                                 | Unchecking and rechecking can't farm it                                  |
| Daily cap         | 300 XP (admin setting)                                            | Nobody should feel pushed to study 12 hours                              |
| Level curve       | Level _n_ needs 150 + 50·_n_ XP (level 7 needs 500)               | Matches the mockups; early levels come fast                              |
| Combo             | 1.0x + 0.1x per extra person who **finishes** the round, max 2.0x | Rewards focusing together                                                |
| Finishing a round | At least 5 minutes in that round (or half the round, if shorter)  | Joining in the last seconds doesn't count toward the combo or the streak |
| Leaving early     | Minutes so far are credited, round not finished                   | Honest time still counts                                                 |
| Boss loot         | +50 XP to every contributor, outside the cap                      | Happens once a week; a capped reward would often be zero                 |

The live combo on screen counts everyone on the room timer, as a preview. The combo actually paid out counts finishers.

## Anti-AFK guardrails

A random "are you there?" tap is planned for v2. For v1:

- participants are released from the room timer when a cycle ends (about two hours with 25/5), so a forgotten timer can't run all night;
- people who joined during the final long break haven't focused yet, so they roll into a fresh cycle instead of being dropped;
- the daily XP cap bounds what any idle timer can earn.

## Streaks without guilt

- A day counts after one finished session (a finished room round or a completed solo timer), in the community's time zone.
- Each week (Monday to Sunday) has one free freeze that covers one missed day. A gap of several days survives only if each missed day falls in a different week with an unused freeze.
- The streak shown is "as of today": yesterday's streak is still alive, and a gap a freeze could still cover isn't shown as zero.
- There are no public "you lost your streak" messages. Only milestones (7, 30, 50, 100, 200, 365 days) are posted.

## Private goals

Members choose whether their goals show on the board. Private members appear as "Focusing" with a lock. The server never sends private goal text to other clients: room state is built with the text already removed, and personal data (XP, goals, results) is sent only to the member's own devices.

Data is kept for as long as the app is installed, so streaks and history survive. Members can erase all of it themselves with **Delete my data** on the progress screen (`StudyRoomEngine.deleteMyData` and `Store.eraseUser`). Self-service deletion is simpler and more reliable than handling requests by email, because Root hosts the database and there's no admin console to delete from. See [PRIVACY.md](PRIVACY.md).

## Weekly boss

A boss spawns lazily each Monday (community time zone) with the admin's name and HP in focus hours. Every focus minute deals damage, multiplied by the combo for room rounds. Admins can rename or resize the live boss; damage is never healed, and lowering HP below the damage dealt defeats it on the spot (with the usual post and loot).

## Weekly leaderboard

- Ranked by focus **minutes**, not goals, so it can't be gamed with tiny tasks. It sums `daily_stats` for the current week; there's no separate counter to drift.
- The week is the boss's week: Monday to Sunday in the community time zone. A new week starts empty.
- Minutes are rounded down to whole minutes before ranking, and equal minutes share a rank (1, 2, 2, 4), so two people shown with the same time never get different places.
- The board lists the top 10. You always see your own rank and minutes, even below the top 10.
- Members can hide themselves. Hidden members are left out of the board and out of every ranking in posts (the recap's top focusers and top streaks). Their minutes still count for the boss and community totals. The opt-out lives in its own table so it's erased with the rest of a member's data.
- The daily recap lists the week's top 3 when the admin setting **Leaderboard in recap** is on (default).

## Channel posts

- **Busy room**: once when the number of people focusing reaches the threshold, then not again until it drops below and three hours have passed.
- **Daily recap**: at the admin's time, as a one-time Root job rescheduled after each run so it stays correct across daylight saving changes. Quiet days are skipped so the channel never reads "0 hours". A missed job is still posted if it's under two hours late.
- **Milestones and boss defeats**: as they happen.

Display names come from Root nicknames and are stripped of markup and mention characters before they're posted.

## Admin settings use Root's Global Settings

Root already provides a settings UI restricted to people who can manage apps, so Study Squad doesn't build or secure its own. The mockup's admin setup screen maps to two groups in `root-manifest.json`: **Timer and room** and **Game layer**. The server validates and clamps every value (`parseSettings`), and a test checks that the manifest declares exactly the keys the server reads and that its defaults match the server's.

Numeric settings are `select` items, not `number` items: in `@rootsdk/dev-tools` 0.21.3 the dev host maps `number` items to the wrong oneof case. Revisit when the SDK fixes it.

## Where the app differs from the mockups

- **Name**: the mockups say "Study Room"; the app is now called Study Squad. Internal code names (`StudyRoomEngine`, the `StudyRoomService` Protobuf service, `@studyroom/*` packages) keep the old name, because renaming the service would change the wire paths for no user benefit.
- **Admin setup** is Root's App settings screen (see above). The room shows a read-only summary behind the settings button.
- **Weekly quests and badges** on the progress screen are not in v1. They were in the gamification ideas but outside the v1 scope (XP, combo, boss).
- **"Chat in #study-hall"** on the break screen is a hint, not a link, because the SDK has no supported way to deep-link to a channel.
- **Avatars** use Root profile pictures when a member has one, and the design's initials and colors otherwise.
- Fonts (DM Sans, Space Grotesk) are bundled with the client instead of loaded from Google Fonts, to avoid third-party requests from inside Root.

## Known limits

- One room per installed app instance (one Root server process serves one community).
- Not yet run against a live Root community; that needs a developer token. The server compiles against the real SDK types and boots up to Root's environment check.
