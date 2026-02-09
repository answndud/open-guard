# Contributing to OpenGuard

Thank you for your interest in contributing to OpenGuard! This guide will help you get started.

## Development Setup

### Prerequisites
- Node.js 20+ (LTS recommended)
- pnpm 9+ (`npm install -g pnpm`)
- Git 2.30+

### Getting Started

```bash
# Clone the repository
git clone https://github.com/openguard/openguard.git
cd openguard

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Run CLI locally
pnpm dev scan ./examples/sample-skill
```

### Project Structure

```
src/
├── ingest/     # Repo loading & file classification
├── scanner/    # Rule engine & evidence extraction
├── scoring/    # Risk score computation
├── policy/     # Policy generation & serialization
├── report/     # Output formatters (JSON, MD, PR comment)
├── cli/        # CLI commands & orchestration
└── trust/      # SLSA-lite signing & verification

rules/          # Rule definitions (YAML)
schemas/        # JSON schemas for outputs
tests/          # Test suites
examples/       # Sample skills & policies
github-action/  # GitHub Action for CI
```

## How to Contribute

### 1. Adding a New Detection Rule

This is the most impactful and accessible contribution.

**Steps:**
1. Check [docs/RULES_CATALOG.md](docs/RULES_CATALOG.md) for existing rules (avoid duplicates)
2. Add rule definition to `rules/<category>.yaml`:

```yaml
- id: OG-SHELL-XXX
  title: "Descriptive title"
  description: "What this detects and why it's risky"
  severity: high          # info | low | medium | high | critical
  confidence: medium      # low | medium | high
  category: shell         # shell | network | filesystem | credentials | ...
  scope:
    file_types: [shell]   # Which file types this rule applies to
  patterns:
    - regex: 'your-regex-pattern-here'
      description: "What this pattern matches"
  remediation: "Suggested safer alternative"
  tags: [relevant, tags]
```

3. Add tests in `tests/rules/`:
   - At least 1 **positive test** (input that should match)
   - At least 1 **negative test** (input that should NOT match)
4. Update [docs/RULES_CATALOG.md](docs/RULES_CATALOG.md) with the new rule entry
5. Run tests: `pnpm test`

**Rule quality checklist:**
- [ ] High signal (low false positive rate)
- [ ] Clear description of what and why
- [ ] Actionable remediation
- [ ] Tests for both positive and negative cases
- [ ] Correct severity and confidence assessment

### 2. Improving Existing Rules

- Reduce false positives by tightening patterns
- Improve evidence extraction (more context)
- Better remediation suggestions
- Add more test cases for edge cases

### 3. Code Contributions

**Before starting:**
- Check existing issues for related work
- For significant changes, open an issue first to discuss the approach
- Read [AI_GUIDE.md](AI_GUIDE.md) for coding standards

**Coding standards:**
- TypeScript strict mode (`no any`)
- Result types for expected failures (not exceptions)
- Structured logging (no `console.log`)
- Every public function needs JSDoc documentation
- Follow existing code patterns

### 4. Documentation

- Fix typos, improve clarity
- Add examples to existing docs
- Translate documentation (create `docs/<lang>/` directory)

## Pull Request Process

### PR Checklist

- [ ] Tests added/updated for all changes
- [ ] Finding IDs remain stable (no unexpected snapshot changes)
- [ ] Report schema unchanged (or updated with clear rationale)
- [ ] No network calls added to scanner module
- [ ] No new `any` types introduced
- [ ] `pnpm test` passes
- [ ] `pnpm tsc --noEmit` passes
- [ ] docs/RULES_CATALOG.md updated (if adding/modifying rules)
- [ ] CHANGELOG.md updated under "Unreleased"

### PR Title Convention

Use conventional commit format:
- `feat: add OG-NET-006 DNS tunneling detection`
- `fix: reduce false positives in OG-SHELL-004`
- `docs: improve policy model documentation`
- `test: add edge case tests for scoring`
- `refactor: extract common pattern matching utils`

### Review Process

1. Automated checks must pass (CI scan, tests, lint)
2. At least 1 maintainer review required
3. Rule changes require review of false positive/negative rate
4. Schema changes require 2 maintainer approvals

## Development Workflow

### Running Tests

```bash
# All tests
pnpm test

# Specific module
pnpm test -- --filter scanner

# Watch mode
pnpm test -- --watch

# Update snapshots
pnpm test -- --update-snapshots

# Coverage
pnpm test -- --coverage
```

### Linting & Formatting

```bash
# Lint
pnpm lint

# Format
pnpm format

# Type check
pnpm tsc --noEmit
```

### Building

```bash
# Build CLI
pnpm build

# Build GitHub Action
pnpm build:action
```

## Issue Reporting

### Bug Reports

Include:
- OpenGuard version (`openguard --version`)
- Node.js version (`node --version`)
- OS and version
- Command run and full output
- Expected vs actual behavior
- Minimal reproduction (if possible)

### Feature Requests

Include:
- Use case description
- Why existing features don't meet the need
- Proposed solution (if any)
- Willingness to implement

## Code of Conduct

Be respectful, constructive, and collaborative. We're all here to make AI agent usage safer.

## License

By contributing to OpenGuard, you agree that your contributions will be licensed under the Apache License 2.0.
