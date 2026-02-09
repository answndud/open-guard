# OpenGuard — Product Specification (MVP)

## 1. Problem Statement

AI agent skills and workflows are installed from public repos and executed with broad local access. Unlike traditional package dependencies that have established registries, vulnerability databases, and sandboxing (e.g., Deno permissions), AI agent skills frequently:

- Instruct users to run shell commands with elevated privileges
- Touch sensitive local paths (`~/.ssh`, `~/.aws`, browser profiles)
- Call arbitrary network endpoints
- Request API keys and secrets
- Modify shell configurations for persistence

Users currently rely on **manual judgment**, which fails at scale. As the AI agent ecosystem grows (OpenCode, Cursor, Claude Code, OpenClaw, MCP servers), the "skill supply chain" becomes a critical attack surface.

Teams need:

- A **standardized way** to assess risk before installation
- **Enforceable least-privilege** policies for agent tool execution
- **Provenance and identity** verification of skill publishers

## 2. Target Users

### 2.1 Individual Power Users (Free Tier)

- Use OpenCode, Cursor, Claude Code, OpenClaw, or similar AI coding agents
- Install community skills, prompt packs, and MCP servers regularly
- Want a **single-command risk check** before installing any skill
- Appreciate a "verified" badge on skills they consume

### 2.2 Engineering Teams (Team Tier)

- Standardize AI agent tooling across the team
- Need **policy templates** enforced across repos
- Want CI guardrails: PRs introducing risky scripts must be visible and blockable
- Require **audit logs** for compliance (SOC 2, ISO 27001)
- Need **SSO** integration and central policy deployment

### 2.3 Skill Publishers & Maintainers (Free / Pro Tier)

- Want a "Verified Publisher" badge and distribution trust
- Need a **repeatable release workflow** with signing
- Want their skills to be discoverable as "OpenGuard Verified"

### 2.4 Platform Builders (Enterprise Tier)

- Building AI agent platforms or skill marketplaces
- Want to embed OpenGuard scanning in their platform
- Need API access, white-label reports, custom rule sets

## 3. Core Value Proposition

| Layer              | What OpenGuard Provides                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| **Visibility**     | High-signal findings with evidence (file, line, snippet, pattern)         |
| **Enforceability** | Generated policies that gate tool execution (prompt firewall + tool gate) |
| **Trust**          | Publisher signing + consumer verification (SLSA-lite)                     |
| **Automation**     | CI bot that catches regressions on every PR                               |

MVP focuses on **Visibility** and **Enforceability** with basic **Trust** and **Automation**.

## 4. Scope

### 4.1 MVP In-Scope

- Static scanning of repositories, text instructions, and scripts
- Rule-based findings with evidence + risk scoring
- Policy generation (allowlist YAML) with approval gates
- GitHub PR comment bot (GitHub Action) with summary + diff-based new findings
- Basic signing/verification for releases (SLSA-lite minimal)
- CLI tool (`openguard`) for local use
- Local dashboard server (read-only) for scan history and policy status

### 4.2 MVP Out-of-Scope

- Full runtime sandbox / dynamic analysis
- Organization-wide policy distribution UI (team dashboard)
- Full SLSA level 3+ attestation / reproducible builds
- Integration with non-GitHub CI platforms (GitLab, Bitbucket — planned)
- AI/LLM-powered semantic analysis of code intent
- Paid billing infrastructure

## 5. Primary Use Cases

### UC1: Scan Before Install (Individual)

**As a user**, I want to scan a skill repo before I install or run it, so I can understand the risks involved.

**Flow:**

1. User runs `openguard scan ./path/to/skill` or `openguard scan https://github.com/org/repo`
2. OpenGuard discovers relevant files (scripts, workflows, markdown)
3. Rules engine produces findings with evidence
4. Scoring engine computes risk subscores and total
5. Policy generator creates recommended allowlist
6. Report is output as JSON or Markdown

**Acceptance Criteria:**

- Produces at least: (a) overall score, (b) top findings with evidence, (c) recommended allowlist policy
- Completes scan of a typical repo (< 1000 files) within 10 seconds
- Zero network calls during scan (offline-capable after repo fetch)

### UC2: PR Guardrail (Team)

**As a team lead**, I want PRs that add or modify suspicious scripts to be automatically flagged, so risky changes don't slip through review.

**Flow:**

1. Developer opens PR that adds/modifies scripts or workflows
2. GitHub Action runs OpenGuard scan on the PR diff
3. Bot posts comment with: overall score delta, new findings, file/line evidence
4. Optionally fails the check if score exceeds threshold

**Acceptance Criteria:**

- Comment includes stable "Finding IDs" for tracking across PRs
- Comment is idempotent (updates existing comment, no spam)
- Configurable score threshold for pass/fail
- Delta-aware: only highlights NEW findings vs base branch

### UC3: Verified Release (Publisher)

**As a skill publisher**, I want to sign my release so consumers can verify its authenticity.

**Flow:**

1. Publisher runs `openguard sign ./dist --key private.key`
2. Creates signature file + provenance metadata
3. Consumer runs `openguard verify ./dist --pub publisher.pub`
4. Verification checks signature + metadata integrity

**Acceptance Criteria:**

- `openguard verify` returns clear pass/fail with details
- Signature covers content hash + metadata (timestamp, version, commit SHA)
- Works with standard Ed25519 keys

### UC4: Policy Enforcement (Post-MVP Preview)

**As a team**, we want agent tool execution to be gated by our policy, even against prompt injection attacks.

**Flow:**

1. Policy is loaded at agent startup
2. Before any tool call (shell, network, file write), the policy gate checks the allowlist
3. Denied actions are blocked; borderline actions require 2-step approval

**Note:** Full runtime enforcement is post-MVP, but the policy format and generation are MVP.

## 6. Outputs & Data Model

### 6.1 Finding

| Field         | Type     | Description                                                                                               |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `id`          | string   | Stable hash: `rule_id` + evidence context hash                                                            |
| `rule_id`     | string   | Rule identifier (e.g., `OG-SHELL-001`)                                                                    |
| `severity`    | enum     | `info`, `low`, `medium`, `high`, `critical`                                                               |
| `category`    | enum     | `shell`, `network`, `filesystem`, `credentials`, `obfuscation`, `supply-chain`, `gha`, `macos`, `windows` |
| `confidence`  | enum     | `low`, `medium`, `high`                                                                                   |
| `title`       | string   | Human-readable title                                                                                      |
| `description` | string   | Detailed explanation of the risk                                                                          |
| `evidence`    | object   | `{ path, start_line, end_line, snippet, match }`                                                          |
| `remediation` | string   | Suggested safer alternative                                                                               |
| `tags`        | string[] | Optional categorization tags                                                                              |

### 6.2 Risk Scoring

**Subscore Dimensions:**

- `shell` — command execution risk
- `network` — outbound connection risk
- `filesystem` — file access risk
- `credentials` — credential exposure risk

**Scoring Algorithm:**

```
Per finding contribution:
  base_points = severity_to_points(severity)
    critical = 30, high = 15, medium = 8, low = 3, info = 1
  confidence_weight = confidence_to_weight(confidence)
    high = 1.0, medium = 0.7, low = 0.4
  contribution = base_points × confidence_weight

Category subscore (0–100):
  raw = sum of contributions for that category
  subscore = min(raw, 100)

Total score (0–100):
  total = min(weighted_sum(subscores), 100)
  weights: shell=0.30, network=0.25, filesystem=0.20, credentials=0.25

Override: if any critical finding exists, total >= 60 (floor)
```

**Score interpretation:**
| Score Range | Risk Level | Recommendation |
|------------|------------|----------------|
| 0–19 | Low | Safe to use with standard caution |
| 20–39 | Moderate | Review findings before use |
| 40–59 | High | Careful review required; apply policy |
| 60–79 | Very High | Not recommended without strict policy |
| 80–100 | Critical | Do not install without thorough audit |

### 6.3 Policy File (YAML)

See [docs/POLICY.md](docs/POLICY.md) for full specification.

Key fields:

- `version`: Schema version (v1)
- `defaults`: Default deny + approval requirements
- `allow`: Allowlist for commands, paths, network
- `approvals`: Conditions requiring explicit human approval

**Implementation note:** policy schema validation and merge semantics are supported (deny-first, approval escalation only).

### 6.4 Local Dashboard Data

The dashboard reads stored scan outputs and policies from a local data directory (default `./.openguard/`).
All data is file-based and offline-only. See `docs/DASHBOARD_PLAN.md`.

## 7. CLI Interface

```
openguard <command> [options]

Commands:
  scan <target>              Scan a skill/repo for security risks
  policy generate <target>   Generate least-privilege policy from scan
  sign <artifact>            Sign an artifact with provenance metadata
  verify <artifact>          Verify artifact signature and provenance
  server                     Run local dashboard server

Scan options:
  --format <json|md|sarif>   Output format (default: md)
  --out <file>               Write report to file (default: stdout)
  --diff-base <gitref>       Show only new findings vs base ref
  --rules <path>             Custom rules directory
  --policy <path>            Existing policy to validate against
  --threshold <number>       Exit with error if score >= threshold

Policy options:
  --out <file>               Write policy to file (default: stdout)
  --merge <file>             Merge with existing policy

Sign options:
  --key <path>               Path to private key (Ed25519)
  --out <path>               Output signature + metadata

Verify options:
  --pub <path>               Path to public key
  --strict                   Fail on any metadata mismatch

Global options:
  --verbose                  Verbose output
  --quiet                    Suppress non-essential output
  --no-color                 Disable colored output
  --version                  Show version
  --help                     Show help
```

## 8. CI / GitHub Action Requirements

### Inputs

| Input           | Type    | Default    | Description                             |
| --------------- | ------- | ---------- | --------------------------------------- |
| `fail-on-score` | number  | `80`       | Fail check if total score >= this value |
| `comment`       | boolean | `true`     | Post PR comment with report             |
| `diff-only`     | boolean | `true`     | Only report new findings vs base        |
| `rules`         | string  | (built-in) | Path to custom rules                    |
| `policy`        | string  | (none)     | Path to existing policy for validation  |

### Behavior

- Runs on `pull_request` events
- Checks out PR head and base for diff analysis
- Posts/updates a single comment (idempotent via comment marker)
- Sets check status based on `fail-on-score` threshold
- Comment includes: score badge, findings table, policy diff, evidence links

### Build/Packaging

- Action runtime expects a bundled `github-action/dist/index.js` entry (build step required before release)

## 9. Quality Attributes (Non-Functional Requirements)

| Attribute                | Requirement                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| **Determinism**          | Same input always produces same Finding IDs and scores              |
| **Performance**          | Scan 5,000 files within 30 seconds on standard hardware             |
| **Low false positives**  | Focus on high-signal patterns; prefer fewer, better findings        |
| **Explainability**       | Every finding includes evidence (file, line, snippet) and rationale |
| **Offline capability**   | Scanning works without internet (after initial repo fetch)          |
| **No data exfiltration** | Scanner never sends scanned code to external services               |
| **Extensibility**        | Custom rules via YAML without code changes                          |
| **Local visibility**     | Dashboard exposes scan history without external storage             |

## 10. Success Metrics

### Individual Users

- "Scan before run" adoption rate
- Repeat usage frequency
- Time from discovery to safe install decision

### Teams

- % of repos with OpenGuard CI enabled
- Number of risky PRs caught before merge
- Policy adoption rate (teams using generated policies)

### Publishers

- Verified badge issuance volume
- Verified vs unverified install ratio
- Time from release to verification

### Platform

- GitHub stars / npm downloads (open source health)
- Community rule contributions
- Conversion rate from free to team tier
