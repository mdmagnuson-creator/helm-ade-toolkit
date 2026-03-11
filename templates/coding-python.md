# Python Coding Guidelines

These are defaults. If the project's existing code follows different patterns, match the project.

## Style

- Follow PEP 8. Use `snake_case` for functions and variables, `PascalCase` for classes, `UPPER_SNAKE_CASE` for module-level constants.
- Use f-strings for string formatting. Do not use `%` formatting or `str.format()` unless there is a specific reason (e.g., logging format strings).

## Type Hints

- Add type hints to all function signatures (parameters and return types).
- Add type hints to variables where the type is not obvious from the assignment.
- Use `from __future__ import annotations` for modern annotation syntax when supporting older Python versions.

## Data Modeling

- Use `dataclasses` or Pydantic models for structured data. Do not pass raw dicts around as de facto data structures.
- Prefer Pydantic when validation or serialization is needed. Use dataclasses for simpler internal data containers.

## File Operations

- Use `pathlib.Path` instead of `os.path` for file and directory operations.

## Resource Management

- Use context managers (`with` statements) for files, database connections, locks, and any resource that requires cleanup.

## Error Handling

- Catch specific exceptions. Never use bare `except:` or `except Exception:` without a clear reason.
- Let unexpected exceptions propagate. Do not silently swallow errors.
- Use custom exception classes when the project defines them.

## Logging

- Use the `logging` module for operational output. Do not use `print()` for anything that should be logged.
- Use appropriate log levels: `debug` for diagnostics, `info` for normal operations, `warning` for recoverable issues, `error` for failures.

## Comprehensions

- Use list, dict, and set comprehensions when they are clearer than the equivalent loop.
- Do not nest comprehensions more than one level deep. If a comprehension requires nesting, use a loop instead.

## Testing

- Write tests with `pytest`. Do not use `unittest` unless the project already uses it.
- Use fixtures for setup and teardown. Do not duplicate setup logic across tests.
- Name test files `test_*.py` and test functions `test_*`.

## Dependencies

- Use virtual environments. Do not install packages globally.
- Respect the project's dependency management tool (`requirements.txt`, `pyproject.toml`, `poetry.lock`, etc.). Do not mix tools.
- Pin dependency versions in lock files. Use loose constraints only in `pyproject.toml` or `setup.cfg`.
