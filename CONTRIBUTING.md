# Contributing

Thanks for contributing to `yo-go`.

## How to Contribute

1. Create a branch from `main`
2. Make focused changes
3. Run validation scripts locally
4. Open a pull request with clear context

## Development Checks

Run these before submitting:

```bash
scripts/validate-toolkit-postchange.sh .
scripts/validate-handoff-contracts.sh .
scripts/validate-project-updates.sh .
scripts/validate-policy-testability.sh .
```

## Change Scope

This repository manages toolkit assets (agents, skills, templates, scaffolds, schemas, docs).

- Keep changes inside toolkit scope
- Avoid unrelated formatting-only churn
- Update `toolkit-structure.json` and docs when inventory changes

## Pull Request Guidelines

- Use conventional commit style in title when possible
- Explain why the change is needed
- Include validation output summary
- Note follow-up migration/update work if required
