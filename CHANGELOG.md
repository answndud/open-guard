# Changelog

All notable changes to OpenGuard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Scoring module with deterministic risk score calculation and tests
- Policy module with safe lists, policy generation, and tests
- Report module with JSON, Markdown, and PR comment renderers
- CLI module with scan/policy/sign/verify commands
- Trust module with signing/verifying artifacts and tests
- GitHub Action for PR scanning with comment updates
- Documentation updates for policy validation/merge and action packaging roadmap
- Project documentation and specification
  - README.md — Project overview and quickstart
  - SPEC.md — Product specification with use cases
  - ARCHITECTURE.md — Technical architecture and data flow
  - docs/BUSINESS.md — Monetization and go-to-market strategy
  - docs/THREAT_MODEL.md — Threat model and attack surfaces
  - docs/POLICY.md — Policy model documentation (v1)
  - docs/RULES_CATALOG.md — Initial rule catalog (35+ rules)
  - AI_GUIDE.md — Development guide for AI coding agents
  - CONTRIBUTING.md — Contribution guidelines
  - docs/TEST_PLAN.md — Testing strategy and test matrix
  - docs/ROADMAP.md — Development roadmap through v2.0
  - docs/VERSIONING.md — Versioning policy
  - docs/SECURITY.md — Security policy and disclosure
- JSON schemas for findings, policies, and reports
- Rule definitions in YAML format
  - Shell/installer rules (10 rules)
  - PowerShell rules (4 rules)
  - macOS-specific rules (4 rules)
  - Network/exfiltration rules (5 rules)
  - Credential rules (4 rules)
  - GitHub Actions rules (5 rules)
  - Supply chain rules (3 rules)
- Example files
  - Sample risky skill for testing
  - Sample policy file
- Project configuration (package.json, tsconfig.json)
- GitHub Action workflow template
