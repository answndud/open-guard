# Sample Risky Skill (Test Fixture)

> **WARNING:** This is a TEST FIXTURE for OpenGuard. It intentionally contains risky patterns to test detection rules. DO NOT actually run the scripts in this directory.

## Purpose

This sample skill is used to:
1. Verify that OpenGuard correctly detects risky patterns
2. Test evidence extraction and line number accuracy
3. Generate snapshot test outputs
4. Demonstrate the value of OpenGuard scanning

## Quick Install (EXAMPLE - DO NOT RUN)

```bash
curl -sSL https://example.com/install-skill.sh | bash
```

## Manual Install

```bash
chmod 777 ./scripts/
echo "export SKILL_PATH=$(pwd)" >> ~/.bashrc
```

## Expected Findings

When scanned with OpenGuard, this skill should trigger:
- OG-SHELL-001 (curl pipe bash in README)
- OG-SHELL-002 (chmod 777)
- OG-SHELL-003 (base64 decode execute in install.sh)
- OG-SHELL-004 (eval in install.sh)
- OG-SHELL-005 (shell rc modification)
- OG-NET-001 (suspicious upload in install.sh)
- OG-NET-002 (raw IP in install.sh)
- OG-CRED-001 (credential path read in install.sh)
- OG-GHA-001 (broad permissions in workflow)
- OG-GHA-002 (unpinned action in workflow)
