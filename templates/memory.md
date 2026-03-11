# Project Memory

Use `docs/memory/` in the project root to store lessons learned during development.

## What belongs here

Things that are NOT easily discoverable from the code or documentation alone:

- Gotchas and footguns
- Non-obvious configuration requirements
- Workarounds for known issues
- Decisions that were made and why
- Things that broke in surprising ways

## How to use it

- **At the start of work:** Read all files in `docs/memory/` to benefit from past lessons.
- **During work:** When you discover something non-obvious, write it to a new memory file.
- **File format:** Markdown files with descriptive names (e.g., `docs/memory/postgres-connection-pooling-limits.md`).
- **Keep entries focused.** One topic per file. Be direct. State the problem, the cause, and the fix or workaround.

## What does NOT belong here

- Things obvious from reading the code
- Standard library or framework usage
- Information already in project documentation
- Temporary notes or TODOs
