# add-rule

Add one new rule with tests and update the catalog.

Steps:
- Choose a new rule ID and category.
- Add the rule to `rules/<category>.yaml`.
- Add 1 positive and 1 negative test in `tests/rules/`.
- Update `docs/RULES_CATALOG.md` with the new rule entry.
- Keep changes small and deterministic.
