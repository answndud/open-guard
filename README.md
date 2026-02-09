<p align="center">
  <h1 align="center">OpenGuard</h1>
  <p align="center">
    <strong>Security scanner & trust layer for AI agent skills and workflows</strong>
  </p>
  <p align="center">
    <a href="#quickstart">Quickstart</a> ·
    <a href="#features">Features</a> ·
    <a href="ARCHITECTURE.md">Architecture</a> ·
    <a href="docs/ROADMAP.md">Roadmap</a> ·
    <a href="CONTRIBUTING.md">Contributing</a>
  </p>
</p>

---

## The Problem

AI coding agents (OpenCode, Cursor, Claude Code, Copilot Workspace, etc.) are rapidly adopting a **"skill" ecosystem** — repos, prompt packs, shell scripts, GitHub Actions, MCP servers, and automation workflows that extend agent capabilities.

These skills run with access to:

| Asset           | Example                                              |
| --------------- | ---------------------------------------------------- |
| **Credentials** | `~/.ssh`, `~/.aws`, API keys, `.env` files           |
| **Files**       | Source code, browser profiles, password exports      |
| **Network**     | Arbitrary outbound connections, data exfiltration    |
| **Shell**       | Full command execution, persistence via cron/launchd |

**There is no standardized way to assess, gate, or verify the safety of these skills before execution.** Users either trust blindly or manually audit — neither scales.

## The Solution

OpenGuard brings **dependency-grade security** to the AI agent skill supply chain:

```
┌─────────────────────────────────────────────────────────┐
│                    OpenGuard Pipeline                     │
│                                                           │
│  Skill Input ──► Static Scan ──► Risk Score ──► Policy   │
│  (repo/script)    (rules)        (evidence)    (allowlist)│
│                                                           │
│       ┌──────────────┐    ┌──────────────────┐           │
│       │ PR Comment    │    │ Publisher Sign    │           │
│       │ (CI Bot)      │    │ (SLSA-lite)      │           │
│       └──────────────┘    └──────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

## Features

### MVP (v0.1)

- **Static Risk Scanner** — Detects dangerous patterns (`curl|bash`, `chmod 777`, `base64|sh`, `osascript`, PowerShell obfuscation, credential access, etc.)
- **Multi-axis Risk Scoring** — Independent scores for shell, network, filesystem, and credential risk with transparent evidence
- **Least-Privilege Policy Generator** — Auto-generates allowlist policies (commands, paths, domains) with approval gates
- **GitHub PR Bot** — CI Action that comments on PRs with risk summary, new findings delta, and suggested policy changes
- **Publisher Signing (SLSA-lite)** — Sign artifacts with provenance metadata; consumers verify before install
- **Local Dashboard (Planned)** — Read-only web UI for latest scans, trends, and policy status

### Differentiators

| Feature                  | Traditional SAST | OpenGuard                                                                  |
| ------------------------ | ---------------- | -------------------------------------------------------------------------- |
| AI skill-aware rules     | No               | Yes — understands prompt packs, MCP servers, agent workflows               |
| Policy-based tool gating | No               | Yes — "prompt firewall" that gates execution even against prompt injection |
| Publisher identity       | No               | Yes — SLSA-lite signing + verified badges                                  |
| Approval workflows       | No               | Yes — 2-step approval for shell exec, new domains                          |

## Quickstart

```bash
# Install
npm install -g openguard

# Scan a local skill/repo
openguard scan ./path/to/skill --format json --out report.json

# Scan a remote GitHub repo
openguard scan https://github.com/org/repo --format markdown

# Generate least-privilege policy
openguard policy generate ./path/to/skill --out openguard.policy.yaml

# Generate policy and save a dashboard run
openguard policy generate ./path/to/skill --out openguard.policy.yaml --save-run

# Run local dashboard
openguard server --port 8787

# Verify a signed artifact
openguard verify ./artifact --pub publisher.pub

# Interactive menu (default)
openguard
```

## Project Status (MVP)

Current MVP features are implemented, with a small local dashboard planned:

- **Local dashboard** — Lightweight server + web UI for scan history and policy status

## CI Integration (GitHub Actions)

```yaml
# .github/workflows/openguard.yml
name: OpenGuard Scan
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: openguard/action@v1
        with:
          fail-on-score: 70 # fail PR if risk score >= 70
          comment: true # post PR comment with findings
```

The bot comments on every PR with:

- Overall risk score (with delta vs base branch)
- New findings introduced by the PR
- Suggested policy changes
- File/line evidence links

## What OpenGuard Scans

| Input Type            | Examples                                      |
| --------------------- | --------------------------------------------- |
| Git repositories      | Local path, remote URL                        |
| Shell scripts         | `*.sh`, `*.bash`, `*.zsh`, `*.ps1`            |
| Package scripts       | `npm postinstall`, `pip setup.py`, `Makefile` |
| GitHub Actions        | `.github/workflows/*.yml`                     |
| Markdown instructions | README install steps, skill docs              |
| MCP server configs    | Server manifests, tool definitions            |

## Non-Goals (MVP)

- Full dynamic sandbox execution (planned post-MVP)
- Signature-based malware detection
- Replacement for code review — OpenGuard is a guardrail, not a gatekeeper

## Project Structure

```
openguard/
├── README.md              # This file
├── SPEC.md                # Product specification
├── ARCHITECTURE.md        # Technical architecture
├── docs/BUSINESS.md       # Monetization & go-to-market
├── docs/THREAT_MODEL.md   # Threat model & attack surfaces
├── docs/POLICY.md         # Policy model documentation
├── docs/RULES_CATALOG.md  # Rule definitions & catalog
├── docs/SECURITY.md       # Security policy & disclosure
├── AI_GUIDE.md            # Instructions for AI coding agents
├── CONTRIBUTING.md        # Contribution guidelines
├── docs/TEST_PLAN.md      # Testing strategy
├── docs/ROADMAP.md        # Development roadmap
├── docs/VERSIONING.md     # Versioning policy
├── CHANGELOG.md           # Release changelog
├── schemas/               # JSON schemas for findings, policies, reports
├── rules/                 # Rule definitions (YAML)
├── examples/              # Sample skills & policies
├── src/                   # Source code
│   ├── ingest/            # Repo loader & file classifier
│   ├── scanner/           # Rule engine & evidence capture
│   ├── scoring/           # Risk scoring engine
│   ├── policy/            # Policy generator
│   ├── report/            # Report formatters (JSON, Markdown, SARIF)
│   ├── cli/               # CLI entry point
│   ├── server/             # Local dashboard server (planned)
│   └── trust/             # Signing & verification
├── tests/                 # Test suites
├── .github/workflows/     # CI configuration
└── docs/                  # Additional documentation
```

## License

Apache License 2.0 — See [LICENSE](LICENSE)

## Links

- [Product Spec](SPEC.md)
- [Architecture](ARCHITECTURE.md)
- [Business & Monetization](docs/BUSINESS.md)
- [Threat Model](docs/THREAT_MODEL.md)
- [Rules Catalog](docs/RULES_CATALOG.md)
- [Roadmap](docs/ROADMAP.md)
- [Local Dashboard Plan](docs/DASHBOARD_PLAN.md)
- [Interpreting Results](docs/INTERPRETING_RESULTS.md)
- [Contributing](CONTRIBUTING.md)
