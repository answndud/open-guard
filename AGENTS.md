# OpenGuard Agent Guide

This file is for agentic coding tools operating in this repo.
Follow the rules in this file, plus `AI_GUIDE.md`, `ARCHITECTURE.md`, and `SPEC.md`.

## Quick Commands

All commands use `pnpm`.

- Install: `pnpm install`
- Dev CLI: `pnpm dev`
- Build: `pnpm build`
- Clean: `pnpm clean`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Lint (fix): `pnpm lint:fix`
- Format: `pnpm format`
- Format (check): `pnpm format:check`
- Tests: `pnpm test`
- Tests (watch): `pnpm test:watch`
- Tests (coverage): `pnpm test:coverage`

### Run a Single Test

Vitest is used. Two common patterns:

- By name/pattern: `pnpm test -- --filter "pattern"`
- By file path: `pnpm test -- tests/path/to/test-file.test.ts`

For watch + single test:

- `pnpm test:watch -- --filter "pattern"`

## Project Structure (High Level)

- `src/` implementation modules
- `tests/` test suites
- `rules/` YAML rule catalog
- `schemas/` JSON schema for outputs
- `examples/` sample skills
- `github-action/` CI action

See `AI_GUIDE.md` for the module order and exact file lists.

## Cursor / Copilot Rules

None found in `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`.

## Core Constraints (Do Not Violate)

From `AI_GUIDE.md`:

- No data exfiltration from scans.
- Deterministic outputs (stable finding IDs).
- Evidence required for every finding.
- Never execute scanned code.
- Offline operation after repo clone.
- High signal, low noise.
- Secret masking in all logs.

## Code Style and Standards

### TypeScript

- Strict mode is required (`tsconfig.json` has `strict: true`).
- No `any` in implementation code.
- Prefer `readonly` fields for immutable data.
- Use `const enum` for fixed value sets.
- Avoid non-null assertions (`!`) unless unavoidable and justified.
- Keep public APIs in each module’s `index.ts`.
- Keep module types in `types.ts`.

### Error Handling

- Use `Result<T, E>` for expected failures.
- Throw only for programmer errors (bugs).
- Error messages must be actionable and user-friendly.
- Do not leak internal paths or stack traces to end users.

### Logging

- Do not use `console.log`.
- Use the structured logger module (when present).
- Log levels: debug, info, warn, error.
- Mask secrets in all logs (patterns like `sk-`, `ghp_`, `AKIA`, etc.).

### Determinism

- Finding IDs are a stable hash of rule id + file path + line + match.
- Avoid any non-deterministic iteration or timestamp inclusion.
- Same input must always produce the same output.

### File I/O and Safety

- Never follow symlinks outside the target directory.
- Respect `.gitignore` and `.openguardignore`.
- Skip files larger than 1MB by default (configurable).
- All reads are relative to the scan target.

### Naming and Structure

- Use descriptive, domain-aligned names (e.g., `file-discovery.ts`).
- Keep modules focused; avoid cross-module side effects.
- Tests mirror source structure in `tests/`.

### Imports and Modules

- Use ESM imports (`type: module` in `package.json`).
- Prefer Node built-ins when possible.
- Keep dependency surface small and explicit.

### Formatting

- Prettier is the formatter (`pnpm format`).
- Keep line lengths reasonable; let Prettier handle wrapping.
- Use consistent quote style per Prettier defaults.

### Tests

- Use Vitest for unit and integration tests.
- Every rule addition needs positive and negative tests.
- Snapshot tests are allowed for stable outputs.
- Keep fixtures in `tests/fixtures/` when needed.

### Documentation

- Public functions should have JSDoc (per `CONTRIBUTING.md`).
- Update `docs/RULES_CATALOG.md` when adding/modifying rules.
- Update `CHANGELOG.md` for user-visible changes.

## Module-Specific Guidance

- Implement modules in the order defined in `AI_GUIDE.md`.
- Each module is “done” only when tests pass and `pnpm typecheck` passes.
- Avoid network calls in scanner modules.
- Keep evidence extraction logic minimal and deterministic.

## CLI Notes

CLI interface is defined in `SPEC.md` Section 7.
Exit codes: 0 = success, 1 = error, 2 = findings exceed threshold.

## When in Doubt

- Follow `AI_GUIDE.md` and `ARCHITECTURE.md` as the source of truth.
- Prefer fewer, higher-quality findings over noisy detection.
- Do not introduce behaviors that conflict with determinism or offline operation.
