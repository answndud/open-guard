# OpenGuard Beginner Guide

This guide is written for people who are new to development tools.
Follow the steps in order and copy commands as-is.

## 1) What OpenGuard does

OpenGuard scans a project and:

- finds risky commands and patterns,
- calculates a risk score (0 to 100),
- generates a least-privilege policy file (`openguard.policy.yaml`).

## 2) What you need first

- Node.js 20+
- pnpm

Check installation:

```bash
node -v
pnpm -v
```

If both commands print a version number, you are ready.

## 3) Install project dependencies

From the OpenGuard project folder:

```bash
pnpm install
```

## 4) First scan (easy mode)

Scan current folder and print a readable report:

```bash
pnpm dev -- scan . --format md
```

Save JSON output:

```bash
pnpm dev -- scan . --format json --out report.json
```

Save SARIF output:

```bash
pnpm dev -- scan . --format sarif --out openguard.sarif
```

## 5) How to read results quickly

Check these first:

1. `Risk Score`
2. `Subscores` (`shell`, `network`, `filesystem`, `credentials`)
3. `Findings` (rule id, file path, line number, evidence)

Simple interpretation:

- 0 to 29: low
- 30 to 59: moderate
- 60 to 79: high
- 80 to 100: very high

## 6) Generate a policy file

Create a policy from scan results:

```bash
pnpm dev -- policy generate . --out openguard.policy.yaml
```

Validate that policy during scan:

```bash
pnpm dev -- scan . --policy openguard.policy.yaml --format md
```

## 7) Scan only new changes

Compare current branch with `main`:

```bash
pnpm dev -- scan . --diff-base main --format md
```

## 8) Open local dashboard

Start server:

```bash
pnpm dev -- server --port 8787
```

Open in browser:

- `http://localhost:8787`

## 9) Common options

- `--format <md|json|sarif>` output format
- `--out <file>` save output to file
- `--rules <dir>` use custom rules
- `--policy <file>` validate policy input
- `--threshold <number>` return exit code 2 above threshold
- `--save-run` store run for dashboard
- `--data-dir <dir>` choose dashboard data location

## 10) Troubleshooting

### `pnpm: command not found`

pnpm is not installed. Install pnpm first.

### Node version error

Update Node.js to version 20 or newer.

### `diff-base` error

- confirm current folder is a git repository,
- confirm base branch/ref exists (for example `main`).

### `--policy` validation error

Check YAML syntax and required fields such as:

- `version`
- `defaults.action`
- `allow`

## 11) Safety tips

- Review `high` and `critical` findings before running anything.
- Be careful with commands like `curl | bash`.
- Treat `.env`, `~/.ssh`, `~/.aws` as sensitive paths.

## 12) Next docs to read

- `docs/RULES_CATALOG.md`
- `docs/INTERPRETING_RESULTS.md`
- `README.md`
- `ARCHITECTURE.md`
