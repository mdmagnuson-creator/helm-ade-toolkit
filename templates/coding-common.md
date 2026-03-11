# Common Coding Guidelines

## Comments

- Do NOT over-comment. If the code is self-explanatory, leave it uncommented.
- Only add inline comments for esoteric or non-obvious logic that cannot be reasonably understood from the code alone.
- All exported functions and classes MUST have doc comments. Use the standard doc comment format for the language (e.g. JSDoc for TypeScript/JavaScript, docstrings for Python, `///` for Rust).

## Library Usage

When writing code that uses external libraries, use a documentation lookup tool if available before calling library APIs. If a docs tool is unavailable, use official upstream docs and local source references. Do not rely only on memory for API signatures, method names, or parameter types.

## AWS CLI

If any command fails with a message about an expired AWS session, expired credentials, or a prompt to run `aws sso login`, **stop and tell the user**. Do not attempt to run `aws sso login` or refresh credentials yourself. The user must do this manually in their own terminal.

## Temporary Files

- Never write temporary artifacts to system temp directories such as `/tmp/` or `/var/folders/`.
- Use project-local `.tmp/` for all temporary files.
- Ensure `.tmp/` is present in the repository `.gitignore`.
