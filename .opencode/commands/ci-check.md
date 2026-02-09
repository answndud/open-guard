# ci-check

Run the fast-fail CI checks locally.

Steps:
- Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- Stop on first failure and report the error.
