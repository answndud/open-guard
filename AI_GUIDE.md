# AI Development Guide for OpenGuard

> **This document is for AI coding agents** (OpenCode, Cursor, Claude Code, etc.) to follow when implementing OpenGuard. It defines constraints, implementation order, coding standards, and module-by-module instructions.

## 1. Project Goal

Implement OpenGuard MVP — a security scanner and trust layer for AI agent skills:
- Static scanner with rule-based findings and multi-axis risk scoring
- Least-privilege policy generator (YAML)
- GitHub PR comment bot (Action)
- Minimal SLSA-lite signing/verification

## 2. Non-Negotiable Constraints

These rules must NEVER be violated:

1. **No data exfiltration** — Scanner must NEVER send scanned code, findings, or any data to external services
2. **Deterministic output** — Same input must ALWAYS produce the same Finding IDs and scores. Use hash(rule_id + file_path + start_line + matched_text) for Finding IDs
3. **Evidence required** — Every Finding must include evidence: file path, line range, code snippet, and matched pattern
4. **No code execution** — Scanner must NEVER execute, eval, or import scanned code
5. **Offline operation** — Scanning must work without internet access (after initial repo clone)
6. **High signal only** — Prefer fewer, higher-quality findings over noisy detection. When in doubt, require higher confidence
7. **Secret masking** — All logging must mask patterns that look like API keys, tokens, passwords (regex: patterns starting with `sk-`, `ghp_`, `AKIA`, etc.)

## 3. Technology Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript 5.x (strict mode) | `"strict": true` in tsconfig |
| Runtime | Node.js 20+ (LTS) | Use built-in APIs where possible |
| Package manager | pnpm | Lockfile must be committed |
| CLI framework | commander | Lightweight, well-documented |
| YAML | js-yaml | For rule loading and policy serialization |
| Git operations | simple-git | For repo cloning and diff |
| Crypto | @noble/ed25519 | For SLSA-lite signing/verification |
| Hashing | Node.js `crypto` | For Finding IDs and content hashing |
| Testing | vitest | Fast, TypeScript-native |
| Build | tsup | For CLI binary bundling |
| Linting | eslint + @typescript-eslint | Strict config |
| Formatting | prettier | Consistent formatting |

## 4. Coding Standards

### TypeScript
```typescript
// ✅ DO: Use strict types
interface Finding {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: Severity;
  // ...
}

// ✅ DO: Use const enums for fixed values
const enum Severity {
  Info = 'info',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

// ✅ DO: Use Result type for error handling
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// ❌ DON'T: Use `any`
// ❌ DON'T: Use non-null assertion (!) without clear justification
// ❌ DON'T: Throw errors for expected conditions (use Result)
// ❌ DON'T: Use console.log (use the logger module)
```

### Error Handling
- Use `Result<T, E>` types for operations that can fail expectedly
- Throw only for programmer errors (bugs)
- All error messages must be actionable ("Could not read file X: permission denied. Try running with sudo or check file permissions.")
- Never expose internal paths or stack traces to end users

### Logging
- Use a structured logger (pino or custom)
- Levels: debug, info, warn, error
- All log entries must include context (module, operation)
- Secret masking applied to all log output

### File I/O
- All file reads are relative to the scan target
- Never follow symlinks outside the target directory
- Respect `.gitignore` and `.openguardignore`
- File size limit: skip files > 1MB (configurable)

## 5. Module Implementation Order

Implement in this order. Each module should be complete with tests before moving to the next.

### Phase 1: Foundation

#### Module 1: `src/ingest/` — Repo Loader & File Discovery

**Files to create:**
- `src/ingest/index.ts` — Public API exports
- `src/ingest/repo-loader.ts` — Clone remote repos, resolve local paths
- `src/ingest/file-discovery.ts` — Walk directory tree, filter by ignore patterns
- `src/ingest/file-classifier.ts` — Classify files by category (shell, js, yaml, etc.)
- `src/ingest/types.ts` — FileEntry, FileCategory types

**Key behaviors:**
- `loadTarget(target: string): Promise<RepoContext>` — Returns repo metadata + file list
- Git URL → clone to temp dir (cleanup on exit)
- Local path → validate exists, resolve absolute
- File discovery respects `.gitignore`, `.openguardignore`, and max file size
- Classification maps file extensions to FileCategory enum

**Tests:**
- Local path with known file structure → correct classification
- `.gitignore` patterns are respected
- Large files are skipped
- Symlinks outside target are not followed

#### Module 2: `src/scanner/` — Rule Engine & Evidence

**Files to create:**
- `src/scanner/index.ts` — Public API
- `src/scanner/rule-loader.ts` — Load and validate rules/*.yaml
- `src/scanner/rule-engine.ts` — Match rules against file content
- `src/scanner/evidence.ts` — Extract evidence context
- `src/scanner/finding-factory.ts` — Create Finding objects with stable IDs
- `src/scanner/types.ts` — Rule, Finding, Evidence types

**Key behaviors:**
- `loadRules(rulesDir: string): Rule[]` — Parse and validate rule YAML files
- `scanFile(file: FileEntry, rules: Rule[]): Finding[]` — Run applicable rules
- `scanTarget(files: FileEntry[], rules: Rule[]): Finding[]` — Scan all files
- Evidence: capture ±3 lines context, matched text, line numbers
- Finding ID: `sha256(rule_id + ':' + relative_path + ':' + start_line + ':' + matched_text).slice(0, 12)`
- Deduplication: same Finding ID = same finding (keep first occurrence)

**Tests:**
- Each rule in rules catalog: at least 1 positive match test, 1 negative test
- Evidence extraction includes correct line range
- Finding IDs are stable across runs
- Rules for wrong file category are skipped

### Phase 2: Scoring & Policy

#### Module 3: `src/scoring/` — Risk Scoring

**Files to create:**
- `src/scoring/index.ts` — Public API
- `src/scoring/score-calculator.ts` — Compute subscores and total
- `src/scoring/weights.ts` — Constants: severity points, confidence weights, category weights
- `src/scoring/types.ts` — ScoreResult, Subscores types

**Key behaviors:**
- See ARCHITECTURE.md Section 2.3 for the exact algorithm
- Subscores capped at 100
- Total score capped at 100
- Critical finding floor: if any critical exists, total >= 60
- Score must be deterministic

**Tests:**
- Known findings → expected subscores and total
- Critical finding floor works
- Empty findings → score 0
- Category mapping is correct

#### Module 4: `src/policy/` — Policy Generator

**Files to create:**
- `src/policy/index.ts` — Public API
- `src/policy/policy-inferrer.ts` — Analyze findings to determine permissions
- `src/policy/policy-serializer.ts` — Write YAML policy
- `src/policy/policy-validator.ts` — Validate policy against schema
- `src/policy/safe-lists.ts` — Built-in safe commands/domains/paths
- `src/policy/types.ts` — Policy types

**Key behaviors:**
- `generatePolicy(findings: Finding[], context: RepoContext): Policy`
- Commands found in scripts: safe ones → allow, risky ones → approval required
- Domains found in network calls: known registries → allow, unknown → deny
- Paths: project-scoped → allow, credential paths → deny
- Output conforms to `schemas/policy.schema.json`

**Tests:**
- Known findings → expected policy entries
- Safe-listed commands are auto-allowed
- Credential paths are always denied
- Policy validates against schema

### Phase 3: Output & Interface

#### Module 5: `src/report/` — Report Formatters

**Files to create:**
- `src/report/index.ts` — Public API
- `src/report/json-reporter.ts` — Full JSON report
- `src/report/markdown-reporter.ts` — Human-readable Markdown
- `src/report/pr-comment-renderer.ts` — GitHub PR comment format
- `src/report/types.ts` — Report types

**Key behaviors:**
- JSON report conforms to `schemas/report.schema.json`
- Markdown includes risk score badge, findings table, evidence snippets
- PR comment includes: score delta, new findings only, policy diff
- PR comment is idempotent (includes HTML comment marker for update)

**Tests:**
- JSON report validates against schema
- Markdown renders correctly for known findings
- PR comment diff: base findings vs head findings → only new shown
- Snapshot tests for report formats

#### Module 6: `src/cli/` — Command Line Interface

**Files to create:**
- `src/cli/index.ts` — Entry point + command registration
- `src/cli/scan-command.ts` — scan command handler
- `src/cli/policy-command.ts` — policy generate command handler
- `src/cli/sign-command.ts` — sign command handler
- `src/cli/verify-command.ts` — verify command handler

**Key behaviors:**
- Commands: `scan`, `policy generate`, `sign`, `verify`
- See SPEC.md Section 7 for full CLI interface
- Exit codes: 0 = success, 1 = error, 2 = findings exceed threshold
- Colored output by default, `--no-color` flag
- Progress indication for long scans

**Tests:**
- Integration tests: known fixture → expected output
- Error cases: invalid path, invalid format, etc.
- Exit code matches threshold behavior

### Phase 4: Trust & CI

#### Module 7: `src/trust/` — Signing & Verification

**Files to create:**
- `src/trust/index.ts` — Public API
- `src/trust/signer.ts` — Sign artifact hash with Ed25519
- `src/trust/verifier.ts` — Verify signature
- `src/trust/metadata.ts` — Generate provenance metadata
- `src/trust/types.ts` — Signature, Metadata types

**Key behaviors:**
- Sign: hash(artifact contents) + metadata → Ed25519 signature
- Verify: check signature against public key + validate metadata
- Metadata: timestamp, version, commit SHA, builder info
- See ARCHITECTURE.md Section 2.7 for signature envelope format

#### Module 8: `github-action/` — PR Comment Action

**Files to create:**
- `github-action/action.yml` — Action metadata
- `github-action/index.ts` — Action entry point
- `github-action/pr-commenter.ts` — Post/update PR comment via API

**Key behaviors:**
- Triggered on `pull_request`
- Runs scan on HEAD, optionally diff with BASE
- Posts or updates comment (idempotent)
- Sets check status based on threshold
- Uses `@actions/core`, `@actions/github` packages

## 6. File Naming & Structure Conventions

```
src/
├── ingest/
│   ├── index.ts           # Re-exports public API
│   ├── types.ts           # Types for this module
│   ├── repo-loader.ts     # Implementation
│   └── __tests__/         # Module tests (or use tests/ at root)
├── scanner/
│   ├── index.ts
│   ├── types.ts
│   └── ...
└── ...
```

- Each module has an `index.ts` that exports the public API only
- Types are in `types.ts` within each module
- Shared types go in `src/types.ts`
- Tests mirror source structure in `tests/` directory

## 7. Rule Development Protocol

When adding or modifying rules:

1. Add/edit rule definition in `rules/<category>.yaml`
2. Add at least 2 tests: one positive match, one negative match
3. Add test fixtures in `tests/fixtures/` if needed
4. Update `docs/RULES_CATALOG.md` with the new rule entry
5. Run full test suite: `pnpm test`
6. Verify Finding IDs are stable (snapshot tests)

## 8. Output Contract

All outputs must conform to JSON schemas in `schemas/`:
- `finding.schema.json` — Individual finding format
- `policy.schema.json` — Policy file format
- `report.schema.json` — Scan report format

Any schema deviation must:
1. Update the schema file
2. Update all affected tests
3. Bump version according to docs/VERSIONING.md

## 9. Suggested Prompts for AI Agents

Use these prompts to guide implementation (one module at a time):

```
"Read AI_GUIDE.md, ARCHITECTURE.md, and SPEC.md. Then implement the ingest module (src/ingest/) following the specifications in AI_GUIDE.md Module 1. Create all listed files with full implementation and tests."

"Read AI_GUIDE.md and docs/RULES_CATALOG.md. Then implement the scanner module (src/scanner/) following AI_GUIDE.md Module 2. Load rules from rules/*.yaml and implement pattern matching with evidence extraction. Add tests for every rule."

"Read AI_GUIDE.md and ARCHITECTURE.md Section 2.3. Implement the scoring module (src/scoring/) with the exact algorithm specified. Include edge cases: empty findings, all critical, mixed categories."

"Read AI_GUIDE.md and docs/POLICY.md. Implement the policy module (src/policy/) that generates YAML policies from findings. Use the safe-lists defined in docs/POLICY.md Section 6."

"Read AI_GUIDE.md. Implement the report module (src/report/) with JSON, Markdown, and PR comment formatters. JSON must validate against schemas/report.schema.json."

"Read AI_GUIDE.md and SPEC.md Section 7. Implement the CLI (src/cli/) using commander. Wire up all modules into scan, policy, sign, and verify commands."

"Read AI_GUIDE.md Section Module 7. Implement SLSA-lite signing and verification using @noble/ed25519."

"Read AI_GUIDE.md Section Module 8. Create the GitHub Action in github-action/ that scans PRs and posts comments."
```

## 10. Definition of Done (per module)

A module is complete when:
- [ ] All specified files are created
- [ ] TypeScript compiles with zero errors (`pnpm tsc --noEmit`)
- [ ] All tests pass (`pnpm test`)
- [ ] No `any` types in implementation code
- [ ] Error handling uses Result type for expected failures
- [ ] Logging uses structured logger (not console.log)
- [ ] Public API is exported from module `index.ts`
- [ ] Integration with previous modules verified
