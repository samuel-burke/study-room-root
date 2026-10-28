# Contributing

## Setup

Node 22 (see `.nvmrc`), then:

```bash
npm install
```

```bash
npm run generate
```

`npm run demo` runs the app without a Root account. See the README for running inside Root.

## Branches

- `main` is what's released. Nobody pushes to it directly.
- `dev` is the integration branch.
- Work happens on short-lived branches off `dev`: `feature/…`, `fix/…`, `chore/…`.
- Open a pull request into `dev`. When `dev` is ready to release, open a reviewed pull request from `dev` into `main`.

Recommended branch protection for both `main` and `dev`: require a pull request, at least one approval for `main`, and these passing checks: `Lint, typecheck, test, build`, `End-to-end (Playwright)`, `CodeQL`, and (on pull requests) `Dependency review`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org): `feat(client): …`, `fix(core): …`, `chore(deps): …`, `docs: …`, `test(server): …`. Keep each pull request focused on one change.

## Before you push

```bash
npm run verify
```

```bash
npm run test:e2e
```

`verify` runs the format check, lint, typecheck, every unit and integration test, and all builds. CI runs the same steps.

## Where code goes

- Rules and use cases go in `core`. It must not import Node, React, knex or the Root SDK (ESLint enforces this).
- Anything that talks to Root or SQLite goes in `server`, behind an interface the engine already defines.
- Changing the wire format: edit `networking/src/studyroom.proto`, run `npm run generate`, update `contract`, and extend its round-trip test.
- New settings: add the key to `SETTINGS` in `core/src/settings.ts` and to `root-manifest.json`. The manifest test fails until both match.
- Update `DESIGN.md` when you change a rule, and add a line to `CHANGELOG.md` under "Unreleased".
