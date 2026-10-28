# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Weekly quests on the progress screen: three rotating quests each week that reset on Monday and pay a small XP bonus, plus the three quest badges
- Badges (#9): 60+ permanent badges for streaks, levels, focus time, room rounds and combos, goals and the weekly boss, including the Early Bird, Night Owl, Marathon, Comeback and First Boss badges from the progress mockup
- Secret badges: Easter eggs for odd hours, special dates, exact numbers and rare situations, shown as "?" until someone finds them
- Earned badges show on member cards (one per card: your newest, or the one you pick), with a full-screen unlock animation and fanfare that get more epic with each tier
- Card styles: borders and colours unlocked by level (gold at level 8) or by certain badges, picked on the progress screen or left on automatic

### Changed

- Rewrote the privacy policy in a friendlier, plainer tone, and added weekly quests, the weekly leaderboard (with its opt-out), AFK checks and the on-device sound mute.

### Fixed

- The room timer retries a wake-up that failed (for example on a locked database) instead of stalling until someone acts
- A failed presence update when a member opens or closes the app is logged instead of crashing the server
- The app still starts when Root's job scheduler is unavailable; only the daily recap is skipped
- Shutdown always closes the database
- The client shows a message with a retry instead of a blank screen if it fails to load or hits a rendering bug

## [0.1.0] - 2026-10-28

First release of **Study Squad: Group Study Timer**, covering the v1 scope.

### Added

- Shared room timer (25/5, 50/10 or custom) with rounds of 4 and a long break, derived from server time so every screen shows the same countdown
- Solo timers that show on the board
- Live focus board with private goals
- Goals with check-off
- XP and levels with a daily cap, combo multiplier, weekly boss with loot
- Streaks with one freeze per week
- Break moment and a room-wide celebration when a round ends
- Progress screen with a five-week heatmap
- Daily recap, busy-room, milestone and boss-defeated posts in a Root channel
- Admin settings through Root's Global Settings
- Demo mode that runs the real engine in the browser
- **Delete my data** on the progress screen: members can erase everything Study Squad stores about them
- Privacy policy (`PRIVACY.md`)
- CI with lint, typecheck, unit, integration and end-to-end tests; CodeQL; dependency review; Dependabot

### Security

- Override `sqlite3` to `^6.0.1` (the Root SDK asks for 5.x) to drop `node-gyp` and `tar@6`, which had high and critical advisories
