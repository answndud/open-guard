# OpenGuard Architecture (MVP)

## 1. System Overview

OpenGuard is a CLI-first TypeScript application that scans AI agent skills/workflows for security risks and generates least-privilege policies. A lightweight local server exposes scan history and policy status in a web UI. The architecture is designed for:

- **Extensibility** — New rules via YAML, new file types via plugins
- **Determinism** — Same input always produces same output
- **Offline operation** — No network required during analysis
- **Composability** — Each module can be used independently

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLI (src/cli/)                            │
│  Commands: scan | policy generate | sign | verify                │
└──────┬───────────────┬──────────────────┬───────────────────┬────┘
       │               │                  │                   │
       │               │                  │                   │
       ▼               ▼                  ▼                   ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌───────────────┐
│   Ingest    │ │   Scanner   │ │    Policy     │ │    Trust      │
│ (src/ingest)│ │(src/scanner)│ │ (src/policy)  │ │  (src/trust)  │
│             │ │             │ │              │ │               │
│ repo loader │ │ rule engine │ │ allowlist    │ │ sign/verify   │
│ file class. │ │ evidence    │ │ inference    │ │ metadata      │
│ git ops     │ │ extraction  │ │ serializer   │ │ provenance    │
└──────┬──────┘ └──────┬──────┘ └──────┬───────┘ └───────────────┘
       │               │               │
       ▼               ▼               │
┌─────────────┐ ┌─────────────┐        │
│   Scoring   │ │   Report    │◄───────┘
│(src/scoring)│ │ (src/report)│
│             │ │             │
│ subscores   │ │ JSON writer │
│ aggregation │ │ MD renderer │
│ thresholds  │ │ PR comment  │
└─────────────┘ └─────────────┘
       │
       ▼
┌───────────────┐
│    Server     │
│ (src/server)  │
│ dashboard API │
│ static UI     │
└───────────────┘
```

## 2. Component Details

### 2.1 Ingest (`src/ingest/`)

**Responsibility:** Load a target (local path or git URL) and classify files for scanning.

**Modules:**

- `repo-loader.ts` — Clone remote repos (temp dir), resolve local paths
- `file-discovery.ts` — Walk directory tree, respect `.gitignore` / `.openguardignore`
- `file-classifier.ts` — Classify files by type for appropriate rule sets

**File Classification:**

| Category        | Extensions / Patterns                                 |
| --------------- | ----------------------------------------------------- |
| `shell`         | `*.sh`, `*.bash`, `*.zsh`, `Makefile`, `Justfile`     |
| `powershell`    | `*.ps1`, `*.psm1`, `*.psd1`                           |
| `javascript`    | `*.js`, `*.mjs`, `*.cjs`                              |
| `typescript`    | `*.ts`, `*.mts`, `*.cts`                              |
| `python`        | `*.py`, `setup.py`, `setup.cfg`                       |
| `yaml-workflow` | `.github/workflows/*.yml`, `.github/workflows/*.yaml` |
| `yaml-config`   | `*.yml`, `*.yaml` (non-workflow)                      |
| `markdown`      | `*.md`, `*.mdx`                                       |
| `json-config`   | `package.json`, `composer.json`, `*.config.json`      |
| `dockerfile`    | `Dockerfile`, `*.dockerfile`, `docker-compose*.yml`   |
| `mcp-config`    | MCP server manifests, tool definitions                |

**Output:** `FileEntry[]` — list of `{ path, category, content, size }`

### 2.2 Scanner (`src/scanner/`)

**Responsibility:** Run rules against classified files, produce findings with evidence.

**Modules:**

- `rule-loader.ts` — Parse `rules/*.yaml` into typed rule objects
- `rule-engine.ts` — Match rules against file content, extract evidence
- `evidence.ts` — Capture file path, line range, snippet, matched pattern
- `finding-factory.ts` — Create Finding objects with stable IDs

**Rule Execution Flow:**

```
For each FileEntry:
  1. Select applicable rules (by file category + rule scope)
  2. For each applicable rule:
     a. Run pattern matcher (regex with context)
     b. If match found:
        - Extract evidence (line range, snippet, matched text)
        - Create Finding with stable ID = hash(rule_id + path + start_line + match)
  3. Deduplicate findings by ID
```

**Rule Definition Schema (YAML):**

```yaml
id: OG-SHELL-001
title: "Remote code execution via curl pipe"
description: "Detects curl/wget output piped to shell execution"
severity: critical
confidence: high
category: shell
scope:
  file_types: [shell, markdown, yaml-workflow]
patterns:
  - regex: 'curl\s+[^|]*\|\s*(ba)?sh'
    description: "curl output piped to bash"
  - regex: 'wget\s+[^|]*\|\s*(ba)?sh'
    description: "wget output piped to bash"
remediation: "Download the script, inspect it, verify checksum, then run"
tags: [supply-chain, rce]
```

### 2.3 Scoring (`src/scoring/`)

**Responsibility:** Compute risk scores from findings.

**Modules:**

- `score-calculator.ts` — Compute subscores and total
- `weights.ts` — Severity/confidence weights and category weights
- `thresholds.ts` — Score range interpretation

**Algorithm:**

```typescript
// Severity to base points
const SEVERITY_POINTS = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

// Confidence multiplier
const CONFIDENCE_WEIGHT = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

// Category weights for total score
const CATEGORY_WEIGHTS = {
  shell: 0.3,
  network: 0.25,
  filesystem: 0.2,
  credentials: 0.25,
};

// Per-finding contribution
function findingScore(finding: Finding): number {
  return (
    SEVERITY_POINTS[finding.severity] * CONFIDENCE_WEIGHT[finding.confidence]
  );
}

// Category subscore
function categorySubscore(findings: Finding[], category: string): number {
  const raw = findings
    .filter((f) => categoryMap(f.category) === category)
    .reduce((sum, f) => sum + findingScore(f), 0);
  return Math.min(raw, 100);
}

// Total score with critical floor
function totalScore(subscores: Subscores, hasCritical: boolean): number {
  const weighted = Object.entries(CATEGORY_WEIGHTS).reduce(
    (sum, [cat, w]) => sum + subscores[cat] * w,
    0,
  );
  const score = Math.min(Math.round(weighted), 100);
  return hasCritical ? Math.max(score, 60) : score;
}
```

**Category Mapping:**
| Finding Category | Subscore Dimension |
|-----------------|-------------------|
| `shell`, `obfuscation` | `shell` |
| `network`, `supply-chain` | `network` |
| `filesystem`, `macos`, `windows` | `filesystem` |
| `credentials` | `credentials` |
| `gha` | Split: permissions → `credentials`, run steps → `shell` |

### 2.4 Policy (`src/policy/`)

**Responsibility:** Infer least-privilege policies from scan findings.

**Modules:**

- `policy-inferrer.ts` — Analyze findings to determine needed permissions
- `policy-serializer.ts` — Write YAML policy file
- `policy-validator.ts` — Validate policy against schema
- `policy-merge.ts` — Merge generated policy with existing user policy (deny-first)

**Inference Logic:**

1. Collect all commands found in shell scripts → add safe ones to allowlist
2. Collect all file paths accessed → add project-scoped paths to read allowlist
3. Collect all outbound domains → add known-safe to domain allowlist
4. For anything risky (found in findings), add to approval-required list
5. Default: deny everything not explicitly allowed

### 2.5 Report (`src/report/`)

**Responsibility:** Format scan results for various outputs.

**Modules:**

- `json-reporter.ts` — Full JSON report (conforms to `schemas/report.schema.json`)
- `markdown-reporter.ts` — Human-readable Markdown summary
- `pr-comment-renderer.ts` — GitHub PR comment with badges, tables, evidence links
- `sarif-reporter.ts` — SARIF format for GitHub Code Scanning (post-MVP)

**PR Comment Format:**

```markdown
## 🛡️ OpenGuard Scan Report

**Risk Score: 72/100** (Very High) ⬆️ +15 vs base

| Category    | Score | Findings           |
| ----------- | ----- | ------------------ |
| Shell       | 85    | 3 critical, 2 high |
| Network     | 60    | 1 high, 1 medium   |
| Filesystem  | 45    | 2 medium           |
| Credentials | 30    | 1 high             |

### New Findings (this PR)

| ID         | Severity    | Rule         | File         | Line |
| ---------- | ----------- | ------------ | ------------ | ---- |
| `a1b2c3d4` | 🔴 Critical | OG-SHELL-001 | `install.sh` | L12  |
| `e5f6g7h8` | 🟠 High     | OG-NET-001   | `setup.sh`   | L45  |

<details><summary>📋 Recommended Policy Changes</summary>
... YAML diff ...
</details>
```

### 2.6 CLI (`src/cli/`)

**Responsibility:** Command-line interface and orchestration.

**Modules:**

- `index.ts` — Entry point, command parser (using `commander` or `yargs`)
- `scan-command.ts` — Orchestrate: ingest → scan → score → report
- `policy-command.ts` — Orchestrate: ingest → scan → policy generate
- `sign-command.ts` — Sign artifact
- `verify-command.ts` — Verify artifact

### 2.7 Server (`src/server/`)

**Responsibility:** Serve a local, read-only dashboard for scan history and policy status.

**Modules (planned):**

- `index.ts` — HTTP server entry point
- `api.ts` — Minimal JSON API for runs, summary, policies
- `store.ts` — File-based run store and index management
- `ui/` — Static HTML/JS/CSS assets

### 2.8 Trust (`src/trust/`)

**Responsibility:** SLSA-lite signing and verification.

**Modules:**

- `signer.ts` — Sign artifact hash + metadata with Ed25519 key
- `verifier.ts` — Verify signature against public key
- `metadata.ts` — Generate provenance metadata (timestamp, commit, version)

**Signature Envelope:**

```json
{
  "payload_hash": "sha256:abc123...",
  "payload_type": "application/vnd.openguard.skill.v1",
  "metadata": {
    "timestamp": "2026-02-09T12:00:00Z",
    "version": "1.0.0",
    "commit": "abc123def456",
    "builder": "openguard-cli/0.1.0"
  },
  "signature": "base64-encoded-ed25519-signature"
}
```

## 3. Data Flow Diagrams

### 3.1 Scan Flow

```
User: openguard scan ./skill
          │
          ▼
    ┌─────────────┐
    │  Ingest      │
    │  repo-loader │──► Resolve path / clone repo
    │  file-disc.  │──► Walk & discover files
    │  file-class. │──► Classify by type
    └──────┬───────┘
           │ FileEntry[]
           ▼
    ┌─────────────┐
    │  Scanner     │
    │  rule-loader │──► Load rules/*.yaml
    │  rule-engine │──► Match patterns per file
    │  evidence    │──► Extract context
    └──────┬───────┘
           │ Finding[]
           ▼
    ┌─────────────┐
    │  Scoring     │──► Compute subscores + total
    └──────┬───────┘
           │ ScoredReport
           ▼
    ┌─────────────┐
    │  Policy      │──► Infer allowlist (optional)
    └──────┬───────┘
           │ Policy
           ▼
    ┌─────────────┐
    │  Report      │──► Format output (JSON/MD/PR)
    └──────┬───────┘
           │
           ▼
     stdout / file
```

### 3.2 CI Flow (GitHub Action)

```
PR opened/updated
       │
       ▼
GitHub Action triggered
       │
       ▼
Checkout HEAD + BASE
       │
       ▼
 Build action bundle (dist/index.js)
       │
       ▼
Run scan on HEAD ──────────────────┐
Run scan on BASE ──────┐           │
                       │           │
                       ▼           ▼
                 base_report   head_report
                       │           │
                       └─────┬─────┘
                             │
                        Diff findings
                             │
                             ▼
                     New findings only
                             │
                             ▼
                    Render PR comment
                             │
                             ▼
                  Post/update comment via API
                             │
                             ▼
                  Set check status (pass/fail)
```

## 4. Technology Choices

| Concern         | Choice                | Rationale                                                   |
| --------------- | --------------------- | ----------------------------------------------------------- |
| Language        | TypeScript (strict)   | Ecosystem alignment (npm, GitHub Actions), team familiarity |
| Runtime         | Node.js 20+           | LTS, stable, good perf for I/O-bound work                   |
| Package manager | pnpm                  | Fast, strict, good monorepo support                         |
| CLI framework   | `commander`           | Lightweight, widely used                                    |
| YAML parsing    | `js-yaml`             | Standard, well-maintained                                   |
| Git operations  | `simple-git`          | Programmatic git access                                     |
| Hashing         | Node.js `crypto`      | Built-in, no external deps                                  |
| Signing         | `@noble/ed25519`      | Pure JS, audited, no native deps                            |
| Testing         | `vitest`              | Fast, TypeScript-native, good DX                            |
| Linting         | `eslint` + `prettier` | Standard                                                    |
| Build           | `tsup`                | Fast bundler for CLIs                                       |

## 5. Rule System Design

### 5.1 Rule Definition Format

Rules are data-driven YAML files in `rules/` directory, organized by category:

```
rules/
├── shell.yaml        # Shell/installer patterns
├── powershell.yaml   # PowerShell patterns
├── network.yaml      # Network/exfiltration patterns
├── credentials.yaml  # Credential access patterns
├── gha.yaml          # GitHub Actions patterns
├── macos.yaml        # macOS-specific patterns
├── supply-chain.yaml # Supply chain patterns
└── _meta.yaml        # Shared severity/confidence definitions
```

### 5.2 Rule Loading & Caching

- Rules are loaded once at startup and cached in memory
- Rule files are validated against the rule schema
- Custom rules can be added via `--rules` CLI flag (merged with built-in)
- Rule conflicts resolved by: custom > built-in

### 5.3 Pattern Matching

MVP uses **regex-based matching** with:

- Per-line matching for most rules
- Multi-line matching for specific patterns (e.g., heredoc detection)
- Context extraction: ±3 lines around match for evidence snippet
- Match groups captured for evidence detail

Post-MVP extensions:

- AST-based analysis for JavaScript/TypeScript/Python
- YAML structure-aware matching for GitHub Actions
- OPA/Rego policy evaluation

## 6. Extension Points (Post-MVP)

| Extension          | Description                                    |
| ------------------ | ---------------------------------------------- |
| Custom rule packs  | Community-contributed rule sets (npm packages) |
| Language analyzers | AST-based analysis beyond regex                |
| Policy evaluator   | OPA/Rego runtime for complex policies          |
| Sandbox executor   | Container-based dynamic analysis               |
| Web dashboard      | Team policy management, audit logs, team admin |
| API server         | REST/GraphQL for platform integrations         |
| Plugin system      | Custom reporters, ingestors, scorers           |

## 7. Security Considerations

- **No code execution** — Scanner is purely static; never executes scanned code
- **No network calls** — Scanning is offline (except initial repo clone)
- **No telemetry** — No data leaves the user's machine (MVP)
- **Deterministic output** — Same input always produces same finding IDs
- **Secret masking** — Logging masks patterns that look like API keys/tokens
- **Minimal dependencies** — Reduce supply chain surface of the tool itself
