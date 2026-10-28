# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- The weekly boss gets a new random funny name each week from a built-in list when the "Boss name" setting is blank (now the default). A name set by an admin still wins.
- Each boss has a strength from 0.5x to 2x that fits its name (a final exam is tougher than a pop quiz), and the list averages 1x. Its HP and its loot both scale with strength.

### Changed

- Boss HP and damage are measured in XP instead of focus minutes. Every XP earned focusing (combo included, before the daily cap) is damage. The "Boss HP (focus hours)" setting is replaced by "Boss base HP (XP)", default 10,000. Bosses already in the database convert at 2 XP per minute.
- Boss loot is 100 XP times the boss's strength (50 to 200 XP), up from a flat 50.

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
