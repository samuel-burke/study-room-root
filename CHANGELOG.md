# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org).

## [Unreleased]

### Fixed

- The room timer retries a wake-up that failed (for example on a locked database) instead of stalling until someone acts
- A failed presence update when a member opens or closes the app is logged instead of crashing the server
- The app still starts when Root's job scheduler is unavailable; only the daily recap is skipped
- Shutdown always closes the database, and the client shows a message instead of a blank screen if it fails to load

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
