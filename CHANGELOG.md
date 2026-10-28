# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- Weekly leaderboard on the progress screen, ranked by focus minutes and reset every Monday in the community time zone. Members can hide themselves, which also keeps them out of recap rankings.
- The daily recap lists the week's top 3 by focus minutes (admin setting **Leaderboard in recap**, on by default)
- Badges (#9): 60+ permanent badges for streaks, levels, focus time, room rounds and combos, goals and the weekly boss, including the Early Bird, Night Owl, Marathon, Comeback and First Boss badges from the progress mockup
- Secret badges: Easter eggs for odd hours, special dates, exact numbers and rare situations, shown as "?" until someone finds them
- Earned badges show on member cards (one per card: your newest, or the one you pick), with a full-screen unlock animation and fanfare that get more epic with each tier
- Card styles: borders and colours unlocked by level (gold at level 8) or by certain badges, picked on the progress screen or left on automatic

### Changed

- Rewrote the privacy policy in a friendlier, plainer tone, and added weekly quests, the weekly leaderboard (with its opt-out), AFK checks and the on-device sound mute.

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
