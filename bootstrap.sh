#!/usr/bin/env bash
set -euo pipefail

# yo-go bootstrap — TUI wizard to set up AGENTS.md in a repository.
# Run from within the target repository, or pass a path as the first argument.

VERSION="1.0.0"
TARGET_DIR="${1:-.}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

# ---------------------------------------------------------------------------
# TUI helpers — use dialog/whiptail if available, fall back to plain prompts
# ---------------------------------------------------------------------------

TUI=""
if [[ -t 0 ]] && [[ -t 1 ]]; then
  if command -v dialog &>/dev/null; then
    TUI="dialog"
  elif command -v whiptail &>/dev/null; then
    TUI="whiptail"
  fi
fi

BACKTITLE="yo-go bootstrap v${VERSION}"

# Display an info message box.
info_box() {
  local title="$1" msg="$2"
  if [[ -n "$TUI" ]]; then
    $TUI --backtitle "$BACKTITLE" --title "$title" --msgbox "$msg" 10 60
  else
    echo ""
    echo "=== $title ==="
    echo -e "$msg"
    echo ""
  fi
}

# Single-select radio list. Sets REPLY to the chosen tag.
radio_select() {
  local title="$1" prompt="$2"
  shift 2
  # remaining args: tag label status ...
  if [[ -n "$TUI" ]]; then
    local args=()
    while [[ $# -gt 0 ]]; do
      args+=("$1" "$2" "$3")
      shift 3
    done
    REPLY=$($TUI --backtitle "$BACKTITLE" --title "$title" \
      --radiolist "$prompt" 16 60 8 "${args[@]}" 3>&1 1>&2 2>&3) || exit 1
  else
    echo ""
    echo "=== $title ==="
    echo "$prompt"
    local i=1
    local -a tags=()
    while [[ $# -gt 0 ]]; do
      tags+=("$1")
      echo "  $i) $2"
      shift 3
      ((i++))
    done
    while true; do
      read -rp "Choice [1-${#tags[@]}]: " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#tags[@]} )); then
        REPLY="${tags[$((choice-1))]}"
        break
      fi
      echo "Invalid choice, try again."
    done
  fi
}

# Multi-select checklist. Sets REPLY to space-separated tags.
check_select() {
  local title="$1" prompt="$2"
  shift 2
  if [[ -n "$TUI" ]]; then
    local args=()
    while [[ $# -gt 0 ]]; do
      args+=("$1" "$2" "$3")
      shift 3
    done
    REPLY=$($TUI --backtitle "$BACKTITLE" --title "$title" \
      --checklist "$prompt" 20 60 12 "${args[@]}" 3>&1 1>&2 2>&3) || exit 1
  else
    echo ""
    echo "=== $title ==="
    echo "$prompt (comma-separated numbers, e.g. 1,3,5)"
    local i=1
    local -a tags=()
    while [[ $# -gt 0 ]]; do
      local marker=" "
      [[ "$3" == "on" ]] && marker="*"
      tags+=("$1")
      echo "  $i) [$marker] $2"
      shift 3
      ((i++))
    done
    read -rp "Choices: " choices
    REPLY=""
    IFS=',' read -ra nums <<< "$choices"
    for n in "${nums[@]}"; do
      n="${n// /}"
      if [[ "$n" =~ ^[0-9]+$ ]] && (( n >= 1 && n <= ${#tags[@]} )); then
        REPLY+="${tags[$((n-1))]} "
      fi
    done
    REPLY="${REPLY% }"
  fi
}

# Yes/No prompt. Returns 0 for yes, 1 for no.
yesno() {
  local title="$1" msg="$2"
  if [[ -n "$TUI" ]]; then
    $TUI --backtitle "$BACKTITLE" --title "$title" --yesno "$msg" 8 60
    return $?
  else
    echo ""
    echo "=== $title ==="
    read -rp "$msg [y/N]: " ans
    [[ "$ans" =~ ^[Yy] ]]
    return $?
  fi
}

# Text input. Sets REPLY to the entered text.
text_input() {
  local title="$1" prompt="$2" default="$3"
  if [[ -n "$TUI" ]]; then
    REPLY=$($TUI --backtitle "$BACKTITLE" --title "$title" \
      --inputbox "$prompt" 10 60 "$default" 3>&1 1>&2 2>&3) || exit 1
  else
    echo ""
    echo "=== $title ==="
    read -rp "$prompt [$default]: " ans
    REPLY="${ans:-$default}"
  fi
}

# ---------------------------------------------------------------------------
# Incorporate: merge new template sections into an existing file
# ---------------------------------------------------------------------------

# Extract top-level heading titles (lines starting with "# ") from text.
# Prints one title per line.
extract_headings() {
  local text="$1"
  while IFS= read -r line; do
    if [[ "$line" =~ ^#\ (.+)$ ]]; then
      echo "${BASH_REMATCH[1]}"
    fi
  done <<< "$text"
}

# Split a markdown document into sections keyed by top-level heading.
# Writes files into a temp dir: one file per section, named by index.
# Also writes a manifest file mapping heading -> index.
# Content before the first heading goes into section "000-preamble".
split_sections() {
  local text="$1" out_dir="$2"
  mkdir -p "$out_dir"

  local idx=0
  local current_file="$out_dir/000-preamble"
  local current_heading=""
  local manifest="$out_dir/manifest"

  : > "$current_file"
  : > "$manifest"

  while IFS= read -r line; do
    if [[ "$line" =~ ^#\ (.+)$ ]]; then
      current_heading="${BASH_REMATCH[1]}"
      ((idx++)) || true
      current_file="$out_dir/$(printf '%03d' "$idx")"
      : > "$current_file"
      echo "$idx|$current_heading" >> "$manifest"
    fi
    printf '%s\n' "$line" >> "$current_file"
  done <<< "$text"
}

# Incorporate new content into existing content.
# Strategy:
#   - Sections in new content replace matching sections in existing content
#     (matched by top-level heading title).
#   - Existing sections with no match in new content are preserved in place.
#   - New sections with no match in existing content are appended at the end.
incorporate_content() {
  local existing="$1" new="$2"

  local bootstrap_tmp_base tmp_existing tmp_new
  bootstrap_tmp_base="$TARGET_DIR/.tmp/bootstrap-$$"
  mkdir -p "$bootstrap_tmp_base"
  tmp_existing="$bootstrap_tmp_base/existing"
  tmp_new="$bootstrap_tmp_base/new"
  mkdir -p "$tmp_existing" "$tmp_new"
  trap "rm -rf '$bootstrap_tmp_base'" RETURN

  split_sections "$existing" "$tmp_existing"
  split_sections "$new" "$tmp_new"

  # Build associative arrays: heading -> file for new content
  declare -A new_heading_file
  declare -a new_headings_order=()
  if [[ -s "$tmp_new/manifest" ]]; then
    while IFS='|' read -r nidx nheading; do
      local nfile="$tmp_new/$(printf '%03d' "$nidx")"
      new_heading_file["$nheading"]="$nfile"
      new_headings_order+=("$nheading")
    done < "$tmp_new/manifest"
  fi

  # Track which new headings got used (so we know what to append)
  declare -A used_new_headings

  local result=""

  # Start with existing preamble if it has content
  if [[ -s "$tmp_existing/000-preamble" ]]; then
    local preamble
    preamble=$(<"$tmp_existing/000-preamble")
    # Only include if it has non-whitespace
    if [[ "$preamble" =~ [^[:space:]] ]]; then
      result+="$preamble"
    fi
  fi

  # Walk existing sections in order, ensuring blank line between sections
  if [[ -s "$tmp_existing/manifest" ]]; then
    while IFS='|' read -r eidx eheading; do
      local efile="$tmp_existing/$(printf '%03d' "$eidx")"
      if [[ -n "${new_heading_file[$eheading]+x}" ]]; then
        # This section exists in new content — use the new version
        result+=$'\n\n'
        result+=$(<"${new_heading_file[$eheading]}")
        used_new_headings["$eheading"]=1
      else
        # This section is unique to the existing file — preserve it
        result+=$'\n\n'
        result+=$(<"$efile")
      fi
    done < "$tmp_existing/manifest"
  fi

  # Append new sections that didn't exist in the original
  for nheading in "${new_headings_order[@]}"; do
    if [[ -z "${used_new_headings[$nheading]+x}" ]]; then
      result+=$'\n\n'
      result+=$(<"${new_heading_file[$nheading]}")
    fi
  done

  # Strip leading blank lines
  result="${result#"${result%%[!$'\n']*}"}"

  printf '%s\n' "$result"
}

# ---------------------------------------------------------------------------
# Autodetect code types by looking at the target repo
# ---------------------------------------------------------------------------

autodetect_codetypes() {
  local -a detected=()
  local dir="$1"

  # Go
  if compgen -G "$dir"/*.go &>/dev/null || compgen -G "$dir"/go.mod &>/dev/null || \
     find "$dir" -maxdepth 3 -name '*.go' -print -quit 2>/dev/null | grep -q .; then
    detected+=("go")
  fi

  # TypeScript
  if [[ -f "$dir/tsconfig.json" ]] || \
     find "$dir" -maxdepth 3 -name '*.ts' -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q .; then
    detected+=("typescript")
  fi

  # JavaScript (only if typescript not already detected)
  if [[ ! " ${detected[*]} " =~ " typescript " ]]; then
    if find "$dir" -maxdepth 3 -name '*.js' -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q .; then
      detected+=("javascript")
    fi
  fi

  # Java
  if find "$dir" -maxdepth 3 -name '*.java' -print -quit 2>/dev/null | grep -q . || \
     [[ -f "$dir/pom.xml" ]] || [[ -f "$dir/build.gradle" ]]; then
    detected+=("java")
  fi

  # Python
  if find "$dir" -maxdepth 3 -name '*.py' -not -path '*/venv/*' -not -path '*/.venv/*' -print -quit 2>/dev/null | grep -q . || \
     [[ -f "$dir/pyproject.toml" ]] || [[ -f "$dir/requirements.txt" ]]; then
    detected+=("python")
  fi

  # React (check for jsx/tsx or react dependency)
  if find "$dir" -maxdepth 3 -name '*.tsx' -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q . || \
     find "$dir" -maxdepth 3 -name '*.jsx' -not -path '*/node_modules/*' -print -quit 2>/dev/null | grep -q . || \
     ([ -f "$dir/package.json" ] && grep -q '"react"' "$dir/package.json" 2>/dev/null); then
    detected+=("react")
  fi

  # Playwright
  if [[ -f "$dir/playwright.config.ts" ]] || [[ -f "$dir/playwright.config.js" ]] || \
     ([ -f "$dir/package.json" ] && grep -q '"@playwright/test"' "$dir/package.json" 2>/dev/null); then
    detected+=("playwright")
  fi

  # CloudFormation
  if find "$dir" -maxdepth 3 -name '*.template' -print -quit 2>/dev/null | grep -q . || \
     find "$dir" -maxdepth 3 -name '*.cfn.yml' -print -quit 2>/dev/null | grep -q . || \
     find "$dir" -maxdepth 3 -name '*.cfn.yaml' -print -quit 2>/dev/null | grep -q . || \
     grep -rql 'AWSTemplateFormatVersion' "$dir" --include='*.yml' --include='*.yaml' -m 1 2>/dev/null; then
    detected+=("cloudformation")
  fi

  # Terraform
  if find "$dir" -maxdepth 3 -name '*.tf' -print -quit 2>/dev/null | grep -q .; then
    detected+=("terraform")
  fi

  echo "${detected[@]}"
}

# ---------------------------------------------------------------------------
# Embedded templates
# ---------------------------------------------------------------------------

# Each template is stored in a function that prints its content to stdout.
# This keeps the script self-contained / downloadable.

template_branching() {
cat << 'TEMPLATE_EOF'
# Branch Naming Conventions

Use a short descriptive summary as the branch name:

```
short-summary
```

Examples:
- `fix-login-bug`
- `add-retry-logic`

## With GitHub Issues

Use `gh/{ticket_number}/short-summary` when a GitHub issue exists:

```
gh/{ticket_number}/short-summary
```

Examples:
- `gh/123/fix-login-bug`
- `gh/42/add-retry-logic`

## Rules

- Use lowercase and hyphens in the summary portion.
- Keep the summary short — 2 to 4 words.
- Never include spaces or uppercase letters in branch names.
TEMPLATE_EOF
}

template_branching_github() {
cat << 'TEMPLATE_EOF'
# Branch Naming Conventions

Use `gh/{ticket_number}/short-summary` when a GitHub issue exists:

```
gh/{ticket_number}/short-summary
```

Examples:
- `gh/123/fix-login-bug`
- `gh/42/add-retry-logic`

If there is no ticket, use just the short summary:

```
fix-login-bug
```

## Rules

- Use lowercase and hyphens in the summary portion.
- Keep the summary short — 2 to 4 words.
- Never include spaces or uppercase letters in branch names.
TEMPLATE_EOF
}

template_branching_none() {
cat << 'TEMPLATE_EOF'
# Branch Naming Conventions

Use a short descriptive summary as the branch name:

```
short-summary
```

Examples:
- `fix-login-bug`
- `add-retry-logic`

## Rules

- Use lowercase and hyphens in the summary portion.
- Keep the summary short — 2 to 4 words.
- Never include spaces or uppercase letters in branch names.
TEMPLATE_EOF
}

template_build() {
cat << 'TEMPLATE_EOF'
# Build System

All projects use a Makefile as the standard interface for building, testing, and deploying. Always use `make {target}` to perform these operations. Do not attempt to determine or run the underlying commands directly.

## Targets

| Target | Purpose |
|---|---|
| `make build` | Compile or transpile the project source code. |
| `make package` | Package the built artifact for deployment (e.g., Docker image, zip archive, apt package). |
| `make publish` | Push the packaged artifact to a remote registry or host (e.g., ECR, S3, remote server). |
| `make deploy` | Update a remote environment with the published artifact. |
| `make lint` | Run static analysis and linting tools. |
| `make test` | Run unit tests. |
| `make run` | Run the project locally (typically via docker-compose). |
| `make regressions` | Run Playwright end-to-end/regression tests. |

## Notes

- Some targets accept environment variables or arguments. Check the project's Makefile for specifics.
- Not every project implements every target. If a target is missing, it is not supported for that project.
TEMPLATE_EOF
}

template_coding_common() {
cat << 'TEMPLATE_EOF'
# Common Coding Guidelines

## Comments

- Do NOT over-comment. If the code is self-explanatory, leave it uncommented.
- Only add inline comments for esoteric or non-obvious logic that cannot be reasonably understood from the code alone.
- All exported functions and classes MUST have doc comments. Use the standard doc comment format for the language (e.g. JSDoc for TypeScript/JavaScript, docstrings for Python, `///` for Rust).

## Library Usage

When writing code that uses external libraries, use documentation lookup tools to check current documentation before calling library APIs. Do not rely on training data for API signatures, method names, or parameter types. Look them up. This avoids hallucinating deprecated or nonexistent methods.

## AWS CLI

If any command fails with a message about an expired AWS session, expired credentials, or a prompt to run `aws sso login`, **stop and tell the user**. Do not attempt to run `aws sso login` or refresh credentials yourself. The user must do this manually in their own terminal.

## Temporary Files

- Never write temporary artifacts to system temp directories such as `/tmp/` or `/var/folders/`.
- Use project-local `.tmp/` for all temporary files.
- Ensure `.tmp/` is present in the repository `.gitignore`.
TEMPLATE_EOF
}

template_coding_go() {
cat << 'TEMPLATE_EOF'
# Go Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Formatting

- All code must be `gofmt`/`goimports` formatted. No exceptions.

## Error Handling

- Always check returned errors. Never discard them with `_` unless there is a documented reason.
- Wrap errors with context using `fmt.Errorf("doing thing: %w", err)`. The caller should understand what failed without reading source.
- Do not `panic` in library code. Reserve `panic` for truly unrecoverable programmer errors (e.g. invalid state that indicates a bug).
- Return errors rather than logging and continuing. Let the caller decide how to handle them.

## Naming

- Short variable names (`i`, `r`, `ctx`) in small scopes. Longer, descriptive names as scope grows.
- Exported names must be descriptive and self-documenting.
- Use `MixedCaps` / `mixedCaps`. No underscores in Go names (except in test functions like `Test_thing`).
- Acronyms are all-caps when exported (`HTTPClient`, `ID`), all-lower when unexported (`httpClient`, `id`).
- Getters do not use `Get` prefix: use `Name()` not `GetName()`.

## Package Design

- Packages should be small and focused on a single responsibility.
- Package names are short, lowercase, singular nouns. No `util`, `common`, `misc`, `helpers`, or `base`.
- Avoid package-level state (global vars, `init()` functions). Prefer passing dependencies explicitly.
- Only use `init()` when there is no practical alternative (e.g. registering database drivers).

## Interfaces

- Keep interfaces small — 1 to 3 methods. Compose larger behaviors from small interfaces.
- Define interfaces where they are consumed, not where they are implemented.
- Accept interfaces, return concrete structs.
- Do not define interfaces preemptively. Extract them when a second implementation or a test boundary is needed.

## Context

- Use `context.Context` for cancellation, deadlines, and request-scoped values.
- Always pass it as the first parameter: `func DoThing(ctx context.Context, ...)`.
- Do not store `context.Context` in structs.

## Concurrency

- Use goroutines and channels where they simplify the design. Do not use them to look clever.
- Every goroutine must have a clear shutdown path. Do not leak goroutines.
- Use `sync.WaitGroup` or `errgroup.Group` to manage goroutine lifetimes.
- Prefer `sync.Mutex` over channels for simple state protection. Use channels for communication between goroutines.

## Testing

- Use table-driven tests for functions with multiple input/output cases.
- Test names should describe the scenario: `TestParseConfig_MissingFile`, `TestHandler_InvalidInput`.
- Use `t.Helper()` in test helper functions.
- Use `t.Parallel()` where tests are independent.
- Prefer stdlib `testing` over test frameworks unless the project already uses one.

## Struct Embedding

- Use embedding for composition, not for inheritance simulation.
- Be aware that embedding promotes all exported methods to the outer type's method set. Only embed when that promotion is intentional.

## General

- Follow [Effective Go](https://go.dev/doc/effective_go) and the [Go Proverbs](https://go-proverbs.github.io/).
- A little copying is better than a little dependency.
- Make the zero value useful.
- `defer` for cleanup. Keep `defer` close to the resource acquisition.
- Use guard clauses and early returns to reduce nesting.
TEMPLATE_EOF
}

template_coding_java() {
cat << 'TEMPLATE_EOF'
# Java Coding Guidelines

These are defaults. If the project's existing code follows different conventions, match those instead.

## Language Features

- Use modern Java idioms: records for data carriers, sealed classes for restricted hierarchies, pattern matching in `switch` and `instanceof` where the project's Java version supports them.
- Prefer immutable data structures. Use `List.of()`, `Map.of()`, `Set.of()` and unmodifiable collections over mutable ones unless mutation is necessary.
- Use `Optional<T>` as a return type instead of returning `null`. Do not use `Optional` for fields or method parameters.
- Use try-with-resources for anything that implements `AutoCloseable`. Never rely on `finally` blocks for resource cleanup when try-with-resources is available.

## Naming

- Classes and interfaces: `PascalCase`
- Methods and variables: `camelCase`
- Constants (`static final`): `UPPER_SNAKE_CASE`
- Packages: `lowercase`, no underscores
- Type parameters: single uppercase letter (`T`, `E`, `K`, `V`) or short descriptive name (`ID`)

## Design

- Prefer composition over inheritance. Use interfaces and delegation instead of deep class hierarchies.
- Use dependency injection. Business logic classes should receive their dependencies through constructors, not instantiate them directly. This applies whether or not a DI framework is in use.
- Apply the most restrictive access modifier that works. Default to `private`; widen only when needed. Do not make fields `public`.

## Error Handling

- Do not catch `Exception` or `Throwable` unless you are at a top-level boundary (e.g., a request handler or task runner). Catch specific exception types.
- Never swallow exceptions silently. At minimum, log them.
- Use unchecked exceptions for programming errors. Use checked exceptions only when the caller can reasonably recover.
- Include context in exception messages. Bad: `"Not found"`. Good: `"User not found: id=" + userId`.

## Logging

- Use SLF4J (`org.slf4j.Logger`) for all logging. Do not use `System.out`, `System.err`, or `java.util.logging`.
- Use parameterized messages: `log.info("Processing order: {}", orderId)` — not string concatenation.
- Use appropriate log levels: `error` for failures requiring attention, `warn` for recoverable issues, `info` for significant state changes, `debug` for diagnostic detail.

## Testing

- Use JUnit 5 (`org.junit.jupiter`).
- Name test methods descriptively: `shouldReturnEmptyListWhenNoResultsFound()`, not `test1()` or `testGetResults()`.
- Use `@DisplayName` only if the method name alone is insufficient to convey intent.
- One assertion concept per test. Multiple `assert` calls are fine if they verify a single logical outcome.
- Use AssertJ or Hamcrest matchers for readable assertions when the project already includes them.
- Mock external dependencies with Mockito. Do not mock types you own unless necessary to isolate the unit under test.
TEMPLATE_EOF
}

template_coding_javascript() {
cat << 'TEMPLATE_EOF'
# JavaScript Coding Guidelines

These are defaults. If the project's existing code follows different conventions, match those instead.

## Language Features

- Use `const` by default. Use `let` only when reassignment is necessary. Never use `var`.
- Use `async`/`await` for asynchronous code. Avoid raw `.then()` chains and callbacks unless the API requires them.
- Use strict equality (`===` and `!==`). Never use `==` or `!=`.
- Use template literals over string concatenation: `` `Hello, ${name}` `` not `"Hello, " + name`.
- Use destructuring for object and array access where it improves clarity: `const { id, name } = user`.
- Use optional chaining (`?.`) instead of manual null checks: `user?.address?.city` not `user && user.address && user.address.city`.
- Use nullish coalescing (`??`) instead of `||` when the intent is to fall back only on `null`/`undefined`: `value ?? defaultValue`.
- Prefer modern ES module syntax (`import`/`export`) over CommonJS (`require`/`module.exports`) unless the project uses CommonJS.
- Prefer named exports over default exports. Named exports improve refactoring, auto-imports, and grep-ability.

## Naming

- Variables and functions: `camelCase`
- Classes: `PascalCase`
- Constants (module-level fixed values): `UPPER_SNAKE_CASE`
- Boolean variables: prefix with `is`, `has`, `should`, `can` when it aids readability

## Design

- Do not mutate function arguments. If you need to modify an object or array, create a copy first.
- Keep functions small and focused. Prefer pure functions where practical.
- Avoid deeply nested conditionals. Use early returns to flatten logic.

## Error Handling

- Always handle errors in async code. Every `await` in a function that can fail should be in a `try`/`catch` block, or the function should propagate the error to a caller that handles it.
- Never swallow promise rejections. At minimum, log them. Unhandled rejections crash Node.js processes and silently break browser apps.
- Include context in error messages. Bad: `"Failed"`. Good: `"Failed to fetch user: id=${userId}"`.
- When re-throwing, wrap the original error as the cause: `throw new Error("operation failed", { cause: err })`.

## Testing

- Use the project's existing test framework. Match the test file location and naming patterns already in use.
- Write descriptive test names that state the expected behavior: `"returns empty array when no results match"`, not `"test getResults"`.
- One logical assertion per test. Multiple `expect` calls verifying a single outcome are fine.
- Test error cases and edge cases, not just the happy path.
TEMPLATE_EOF
}

template_coding_typescript() {
cat << 'TEMPLATE_EOF'
# TypeScript Coding Guidelines

These are guidelines, not rigid rules. Always defer to the project's existing patterns and conventions when they conflict with anything below.

## Compiler Configuration

- Use strict TypeScript configuration (`"strict": true` or equivalent individual flags).
- Do not suppress errors with `@ts-ignore` or `@ts-expect-error` unless there is no alternative. Add a comment explaining why.

## Types

- Do NOT use `any`. If you must, add a comment explaining why it's unavoidable. Prefer `unknown` for truly unknown types and narrow from there.
- Prefer **interfaces** for object shapes. Use **type aliases** for unions, intersections, and utility types.
- Use **discriminated unions** to model state (e.g. `{ status: "loading" } | { status: "error"; error: Error } | { status: "ok"; data: T }`).
- Avoid type assertions (`as`). Prefer type narrowing with type guards, `in` checks, or `instanceof`.
- Use `readonly` for properties and parameters that should not be mutated.
- Use `const` assertions (`as const`) for literal values and fixed arrays/objects.
- Use enums sparingly. Prefer `as const` objects or union types unless the project already uses enums.

## Naming

- `camelCase` for variables, functions, and methods.
- `PascalCase` for types, interfaces, classes, and enums.
- `UPPER_SNAKE_CASE` for constants (module-level fixed values).

## Exports

- Prefer **named exports** over default exports.

## Async

- Use `async`/`await` over raw promise chains (`.then`/`.catch`).
- Handle errors with `try`/`catch`. Type caught errors as `unknown` and narrow before accessing properties.

```typescript
try {
  await doSomething();
} catch (err: unknown) {
  if (err instanceof Error) {
    logger.error(err.message);
  }
  throw err;
}
```

## Testing

- Write tests using the project's existing test framework and conventions.
- Use descriptive test names that state the expected behavior, not the implementation.
- Prefer `it("returns an empty array when no items match")` over `it("test filter")`.
TEMPLATE_EOF
}

template_coding_python() {
cat << 'TEMPLATE_EOF'
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
TEMPLATE_EOF
}

template_coding_react() {
cat << 'TEMPLATE_EOF'
# React Coding Guidelines

These are guidelines, not rigid rules. Always defer to the project's existing patterns and conventions when they conflict with anything below.

## Components

- Use **functional components** with hooks. Do not use class components.
- Keep components small and focused on a single responsibility. If a component is doing too much, split it.
- One component per file. The filename must match the component name (`UserProfile.tsx` exports `UserProfile`).
- Use **PascalCase** for component names.
- Use **fragments** (`<>...</>`) to avoid unnecessary wrapper `<div>` elements.

## Props

- Define props with a **TypeScript interface** (or `PropTypes` in JS projects). Name it `{ComponentName}Props`.
- Destructure props in the function signature.

```tsx
interface UserCardProps {
  name: string;
  email: string;
  onSelect: (id: string) => void;
}

function UserCard({ name, email, onSelect }: UserCardProps) {
  // ...
}
```

## State Management

- Manage state at the lowest component level that needs it. Lift state up only when sibling components must share it.
- Use `useState` for simple local state. Use `useReducer` when state transitions are complex or interdependent.
- Do not reach for global state (Context, Redux, Zustand, etc.) when local state or prop drilling through one or two levels is sufficient.

## Custom Hooks

- Extract reusable or complex logic into custom hooks (`use` prefix, e.g. `useAuth`, `usePagination`).
- A custom hook should have a single clear purpose.

## Performance

- Do **not** wrap components in `React.memo` or use `useMemo`/`useCallback` preemptively. Apply these only when you have identified a measured performance problem.
- Avoid creating new objects, arrays, or functions inside render when they are passed as props to memoized children — but only if memoization is already in use.

## Event Handlers

- Prefix event handler functions with `handle` (e.g. `handleClick`, `handleSubmit`, `handleInputChange`).
- Prefix callback props with `on` (e.g. `onClick`, `onSubmit`, `onChange`).

## Keys

- Use **stable, unique identifiers** for the `key` prop (database IDs, UUIDs, etc.).
- Do not use array indices as keys unless the list is static and will never be reordered, filtered, or modified.

## Forms

- Use **controlled components** for form inputs. Bind input values to state and update via `onChange`.
- Avoid uncontrolled components (`ref`-based access) unless there is a specific reason (e.g. integrating with a non-React library).

## UI States

- Handle **loading**, **error**, and **empty** states explicitly. Do not render components in an undefined or partially loaded state.

```tsx
if (isLoading) return <Spinner />;
if (error) return <ErrorMessage error={error} />;
if (items.length === 0) return <EmptyState />;
return <ItemList items={items} />;
```

## Styling

- Do not use inline styles. Use the project's established styling solution (CSS modules, Tailwind, styled-components, etc.).
- If no convention exists, prefer CSS modules or the approach closest to the rest of the codebase.

## Exports

- Prefer **named exports** over default exports for components.
TEMPLATE_EOF
}

template_coding_playwright() {
cat << 'TEMPLATE_EOF'
# Playwright Test Guidelines

These are defaults. If the project has established patterns that differ, follow the project's patterns.

## Page Object Model

Encapsulate page interactions in page object classes. Tests should call methods on page objects, not interact with locators directly.

```typescript
// pages/login.page.ts
export class LoginPage {
  constructor(private page: Page) {}

  async login(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }
}

// tests/login.spec.ts
test("user can log in with valid credentials", async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.login("user@example.com", "password");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
```

## Locators

Prefer user-facing locators in this order:

1. `getByRole` - buttons, links, headings, etc. with accessible names
2. `getByLabel` - form fields associated with labels
3. `getByPlaceholder` - form fields by placeholder text
4. `getByText` - elements by visible text content
5. `data-testid` - fallback when semantic locators are not stable or possible

Do not use CSS selectors or XPath unless there is no viable alternative. If you must, leave a comment explaining why.

## Assertions

Use web-first assertions. They auto-retry until the condition is met or the timeout expires.

```typescript
// Correct
await expect(page.getByRole("alert")).toBeVisible();
await expect(page.getByRole("heading")).toHaveText("Welcome");
await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();

// Wrong - do not manually check then assert
const isVisible = await page.getByRole("alert").isVisible();
expect(isVisible).toBe(true);
```

## Waiting

Never use `page.waitForTimeout()`. Playwright actions auto-wait for elements to be actionable. If you need to wait for a specific condition, use:

- `await expect(locator).toBeVisible()` - wait for element to appear
- `await page.waitForResponse(url)` - wait for a network response
- `await page.waitForURL(url)` - wait for navigation

## Test Independence

Each test must be fully independent. Do not rely on execution order or shared mutable state between tests. Every test should set up its own preconditions and clean up after itself if necessary.

## Fixtures

Use test fixtures for shared setup and teardown logic. Extend the base `test` object to provide reusable context.

```typescript
type MyFixtures = {
  loginPage: LoginPage;
};

export const test = base.extend<MyFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});
```

## Authentication

Use `storageState` to avoid repeating login flows in every test. Set up authentication once in a setup project and reuse the saved state.

```typescript
// auth.setup.ts
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("user@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.context().storageState({ path: ".auth/user.json" });
});

// playwright.config.ts - reference the setup project and storageState
```

## Test Organization

Group related tests with `test.describe`. Use descriptive test names that state what is being verified, not how.

```typescript
test.describe("invoice creation", () => {
  test("displays validation error when amount is negative", async ({ page }) => { ... });
  test("creates invoice and shows confirmation", async ({ page }) => { ... });
});
```

## Tagging

Tag tests for selective execution. Use annotations in the test title.

```typescript
test("user can check out @smoke", async ({ page }) => { ... });
test("order history shows past orders @regression", async ({ page }) => { ... });
```

Run tagged subsets with `npx playwright test --grep @smoke`.
TEMPLATE_EOF
}

template_coding_cloudformation() {
cat << 'TEMPLATE_EOF'
# CloudFormation Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Format

- Use YAML for all CloudFormation templates. Never JSON.
- Use `AWSTemplateFormatVersion: '2010-09-09'` at the top of every template.
- Always include a `Description` for the stack that explains what it provisions.

## Naming

- Use PascalCase for all logical resource names (`WebAppSecurityGroup`, `PrimaryDatabase`, `ApiGatewayRestApi`).
- Names should be meaningful and describe what the resource is, not just its type.

## Parameters

- Use `Parameters` for any value that changes between environments or deployments (account IDs, instance types, CIDR ranges, feature flags).
- Always include `Description` on every parameter.
- Use `AllowedValues` to constrain inputs where a finite set of valid values exists.
- Set `Default` values where a sensible default exists.
- Use `AllowedPattern` and `ConstraintDescription` for free-form string inputs that must match a format.
- Use `Type: AWS::SSM::Parameter::Value<String>` to reference SSM parameters directly.

## Mappings

- Use `Mappings` for static lookups that vary by a known key (e.g. AMI IDs per region, CIDR blocks per environment).
- Access values with `!FindInMap [MapName, Key, SubKey]`.
- Do not use Mappings for values that should be Parameters.

## Conditions

- Use `Conditions` to control whether resources are created, or to toggle resource properties.
- Define conditions from parameter values: `IsProduction: !Equals [!Ref Environment, production]`.
- Apply with `Condition:` on resources, or `!If` in property values.

## Intrinsic Functions

- Prefer `!Sub` over `!Join` for string construction. `!Sub` is more readable.
  ```yaml
  # Prefer this
  !Sub 'arn:aws:s3:::${BucketName}/*'

  # Over this
  !Join ['', ['arn:aws:s3:::', !Ref BucketName, '/*']]
  ```
- Use `!Ref` to reference parameter values and resource logical IDs.
- Use `!GetAtt` to access resource attributes (`!GetAtt MyBucket.Arn`).
- Use `!Select` and `!Split` sparingly — if you find yourself chaining these, reconsider the approach.

## Tagging

- Tag all taggable resources with a consistent set of standard tags.
- At minimum include: `Environment`, `Project`/`Application`, and `ManagedBy: CloudFormation`.
- Use a `Tags` property on every resource that supports it. Do not rely on tag propagation alone.

## Outputs

- Use `Outputs` to expose important values: ARNs, endpoints, resource IDs, DNS names.
- Include `Description` on every output.
- Use `Export` with `!Sub '${AWS::StackName}-OutputName'` for values consumed by other stacks.
- Only export values that are actually referenced cross-stack. Unnecessary exports create coupling.

## Stateful Resources

- Set `DeletionPolicy: Retain` on stateful resources (RDS instances, DynamoDB tables, S3 buckets, EFS file systems).
- Set `UpdateReplacePolicy: Retain` on the same resources to prevent data loss during updates that require replacement.
- Use `DeletionPolicy: Snapshot` on RDS and EBS resources where a final snapshot is acceptable instead of full retention.

## Template Organization

- Keep templates focused on a single logical concern (networking, compute, database, etc.).
- Break large stacks into nested stacks using `AWS::CloudFormation::Stack`. Pass values between them via parameters and outputs.
- Order template sections consistently: `AWSTemplateFormatVersion`, `Description`, `Metadata`, `Parameters`, `Mappings`, `Conditions`, `Resources`, `Outputs`.

## Validation

- Validate templates with `cfn-lint` before deploying. Fix all errors and warnings.
- Use `aws cloudformation validate-template` as an additional check, but note it only catches syntax errors, not best-practice violations.
TEMPLATE_EOF
}

template_coding_terraform() {
cat << 'TEMPLATE_EOF'
# Terraform Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Formatting

- All code must be `terraform fmt` formatted. No exceptions.

## Naming

- Use `snake_case` for all resource names, variables, outputs, locals, and modules.
- Resource names should be meaningful and describe what the resource is, not its type: `main` or `primary` for a single instance, `this` if there's only one of a kind in the module, or a descriptive name for multiples (e.g. `public`, `private` for subnets).
- Do not repeat the resource type in the name. Use `aws_instance.web`, not `aws_instance.web_instance`.

## Variables and Locals

- Use `variable` blocks for values that change between environments (region, instance size, CIDR blocks, feature flags).
- Use `locals` for computed or derived values (constructed names, merged maps, conditional expressions).
- Every `variable` must have a `description`. Include a `type` constraint. Add `validation` blocks where input correctness matters.
- Set sensible `default` values where appropriate. Variables without defaults are required inputs — that should be intentional.

## Outputs

- Every `output` must have a `description`.
- Output values that downstream consumers or other state files will need (IDs, ARNs, endpoints).

## Modules

- Use modules to encapsulate reusable infrastructure patterns. A module should represent a logical unit (e.g. a VPC, an ECS service, a database).
- Pin module versions. For registry modules: `version = "~> 3.0"`. For git sources: use a `ref` tag.
- Keep the root module thin — it should primarily compose modules and pass variables.
- Modules should have a `README.md` with usage examples if they are shared.

## Providers

- Pin provider versions in `required_providers` with `~>` constraints.
- Do not put provider configuration in reusable modules. Let the calling root module configure providers.

## State Management

- Use remote state. Our standard is S3 backend with DynamoDB locking.
- Keep state files scoped per-service and per-environment. Do not put unrelated infrastructure in the same state.
- Use `terraform_remote_state` data sources to read outputs from other state files when cross-referencing infrastructure.

## Data Sources

- Use `data` sources to reference existing infrastructure (VPCs, AMIs, IAM policies, ACM certificates). Do not hardcode IDs, ARNs, or account numbers.
- Prefer data source lookups by tags or names over hardcoded identifiers.

## Resource Creation Patterns

- Use `for_each` for creating multiple similar resources. Prefer `for_each` over `count` because it uses map keys as identifiers, making additions and removals predictable.
- Use `count` only for simple conditional creation (`count = var.enable_feature ? 1 : 0`).

## Tagging

- Tag all resources that support tags. At minimum include:
  - `Environment` — the deployment environment (e.g. `dev`, `staging`, `production`)
  - `Service` or `Project` — the service or project that owns the resource
- Use `default_tags` in the provider block for tags that apply to everything. Add resource-specific tags inline.

## Plan and Apply

- Always run `terraform plan` and review the output before applying.
- Never use `-auto-approve` in production environments.
- Destructive changes (replacements, deletions) must be reviewed carefully. Use `lifecycle { prevent_destroy = true }` on critical resources.

## File Organization

- `main.tf` — primary resources and module calls.
- `variables.tf` — all input variables.
- `outputs.tf` — all outputs.
- `providers.tf` or `versions.tf` — provider configuration and required versions.
- `locals.tf` — local values (if there are enough to warrant a separate file).
- `data.tf` — data source lookups (if there are enough to warrant a separate file).
- Split into additional files by logical grouping when `main.tf` gets large (e.g. `networking.tf`, `iam.tf`).

## General

- Use `terraform validate` to catch syntax and type errors before planning.
- Use `moved` blocks for refactoring resource addresses instead of manual state surgery.
- Avoid `provisioner` blocks (especially `local-exec` and `remote-exec`). Use native resource types, cloud-init, or configuration management tools instead.
- Do not store secrets in Terraform state or variable defaults. Use secret management tools (Secrets Manager, SSM Parameter Store) and reference them via data sources.
TEMPLATE_EOF
}

template_environments() {
cat << 'TEMPLATE_EOF'
# Environments

There are four environments. Changes flow in one direction: `dev` -> `test` -> `stage` -> `prod`.

Always use these exact names when referring to environments.

## dev

Development. Unrestricted. Anyone can deploy anything at any time. Used for rapid iteration and experimentation. Not gated by the release process.

## test

Test. Receives the full set of changes from a pending release. Used to verify functionality before further promotion. Gated by the release process.

## stage

Staging. Receives the full set of changes from a pending release, typically after verification in `test`. Used for a second round of verification and to catch deployment-related issues. Gated by the release process.

## prod

Production. Customer-facing. Changes reach here only after passing through `dev`, `test`, and `stage`. Gated by the release process.
TEMPLATE_EOF
}

template_git_single_repo() {
cat << 'TEMPLATE_EOF'
# Git Workflow: Single Project Repo

## Branches and Environments

| Branch | Environment |
|---|---|
| `develop` | Dev |
| `release/{shortcode}-{major.minor.patch}` | Test, Stage |
| `main` | Production |

## Workflow

1. Create feature branches from `develop`.
2. Open PRs targeting `develop`.
3. When ready for release, a release branch is cut from `develop` (e.g. `release/app-1.3.0`). This branch progresses through test and stage environments.
4. The release branch is merged to `main` for production deployment.

## Autodeploy

Commits pushed to designated branches trigger automatic deployment. Do not push directly to `develop`, `main`, or release branches — always use a PR.
TEMPLATE_EOF
}

template_git_monorepo() {
cat << 'TEMPLATE_EOF'
# Git Workflow: Monorepo

## Branches

- **`main`** — The primary integration branch.
- **`release/{shortcode}-{major.minor.patch}`** — Release branches scoped to a specific package or service (e.g. `release/auth-2.1.0`).

## Working in a Release Branch

When a release branch exists for the work you are doing:

1. Create your feature branch **from the release branch**, not from `main`.
2. Your PR **must target the release branch**, not `main`.
3. Do not merge release branch changes into `main` yourself. That is handled by the release process.

## Autodeploy

Commits pushed to designated branches trigger automatic deployment. Do not push directly to `main` or release branches — always use a PR.
TEMPLATE_EOF
}

template_git_safety() {
cat << 'TEMPLATE_EOF'
# Git Safety

## Worktrees

Always work in a git worktree, not the main checkout. Use the worktree tool or `git worktree add` to create an isolated working directory for your branch. This prevents interference with the user's working tree.

## Committing

Always commit your changes when you are done working. Do not leave uncommitted work behind. Stage and commit with a clear message before finishing.

## Do Not Revert Others' Changes

NEVER unstage, discard, or revert changes that you did not make. If the working tree has uncommitted changes that are not yours, **stop and ask the user** what to do. Do not assume they should be stashed, reset, or discarded.
TEMPLATE_EOF
}

template_memory() {
cat << 'TEMPLATE_EOF'
# Project Memory

Use `docs/memory/` to store lessons learned during development.

## What belongs here

Things that are NOT easily discoverable from the code or documentation alone:

- Gotchas and footguns
- Non-obvious configuration requirements
- Workarounds for known issues
- Decisions that were made and why
- Things that broke in surprising ways

## Where to write memories

- **Unirepo:** `docs/memory/<description>.md` in the project root.
- **Monorepo, project-specific lesson:** `{project}/docs/memory/<description>.md`.
- **Monorepo, root/cross-project lesson:** `docs/memory/<description>.md` in the repo root.

## Where to read memories

- **Unirepo:** Read all files in `docs/memory/`.
- **Monorepo:** Read all files in BOTH `docs/memory/` (root) AND `{project}/docs/memory/` for the project you are working in.

## How to use it

- **At the start of work:** Read all applicable memory files (see above) to benefit from past lessons.
- **During work:** When you discover something non-obvious, write it to a new memory file.
- **Sub-agents (developer, felix, etc.):** When you learn something worth remembering — a gotcha, a workaround, a non-obvious project behavior — write it to the appropriate `docs/memory/` location before finishing your task.
- **File format:** Markdown files with descriptive names (e.g., `docs/memory/postgres-connection-pooling-limits.md`).
- **Keep entries focused.** One topic per file. Be direct. State the problem, the cause, and the fix or workaround.

## What does NOT belong here

- Things obvious from reading the code
- Standard library or framework usage
- Information already in project documentation
- Temporary notes or TODOs
TEMPLATE_EOF
}

template_tools() {
cat << 'TEMPLATE_EOF'
# Tool Usage

## Code Search

Use the `code_search` MCP tool to discover how projects and services communicate with each other. This is critical for understanding the downstream and upstream consequences of changes.

Before modifying any of the following, run `code_search` to find all affected services:

- API endpoints or request/response schemas
- Event schemas and message formats
- Shared contracts, interfaces, or types
- Inter-service communication (REST calls, queue messages, shared databases)

Do not assume you know the full blast radius of a change. Search first.
TEMPLATE_EOF
}

# ---------------------------------------------------------------------------
# Main wizard flow
# ---------------------------------------------------------------------------

main() {
  info_box "yo-go bootstrap" \
    "This wizard will set up AI agent configuration for your repository at:\n\n  $TARGET_DIR\n\nIt will generate AGENTS.md with coding guidelines, git workflow, and tool usage instructions."

  # --- Step 1: Determine output files and check for conflicts ---
  local -a output_files=("AGENTS.md")

  # Track which files should be incorporated vs overwritten.
  # Keys are output file paths, value "1" means incorporate.
  declare -A incorporate_files

  for f in "${output_files[@]}"; do
    local filepath="$TARGET_DIR/$f"
    if [[ -f "$filepath" ]]; then
      radio_select "File exists: $f" "$f already exists. What would you like to do?" \
        "incorporate" "Incorporate (merge with existing)" "on" \
        "overwrite"   "Overwrite"                         "off" \
        "relocate"    "Write to a different path"         "off"
      case "$REPLY" in
        incorporate)
          incorporate_files["$f"]=1
          ;;
        overwrite)
          # nothing special — will overwrite
          ;;
        relocate)
          text_input "Output path" "Enter alternative path for $f (relative to repo root):" "$f"
          local new_path="$REPLY"
          output_files=("${output_files[@]/$f/$new_path}")
          ;;
      esac
    fi
  done

  # --- Step 2: Autodetect code types ---
  local detected
  detected=$(autodetect_codetypes "$TARGET_DIR")

  local -a all_types=(go typescript javascript java python react playwright cloudformation terraform)
  local -a checklist_args=()
  for t in "${all_types[@]}"; do
    local status="off"
    if [[ " $detected " == *" $t "* ]]; then
      status="on"
    fi
    checklist_args+=("$t" "$t" "$status")
  done

  check_select "Code Types" "Detected code types are pre-selected. Add or remove as needed:" "${checklist_args[@]}"
  local selected_types="$REPLY"
  # strip quotes that dialog may add
  selected_types="${selected_types//\"/}"

  # --- Step 3: Ticket system ---
  radio_select "Ticket System" "Where are tickets tracked?" \
    "github" "GitHub Issues"  "on" \
    "none"   "None / Other"   "off"
  local ticket_system="$REPLY"

  # --- Step 4: Repo type ---
  radio_select "Repository Type" "Is this a monorepo or a single-project repo?" \
    "single"   "Single project repo" "on" \
    "monorepo" "Monorepo"            "off"
  local repo_type="$REPLY"

  # --- Step 5: Build system ---
  local has_makefile="no"
  if [[ -f "$TARGET_DIR/Makefile" ]] || [[ -f "$TARGET_DIR/makefile" ]] || [[ -f "$TARGET_DIR/GNUmakefile" ]]; then
    has_makefile="yes"
  fi

  local include_build="no"
  if [[ "$has_makefile" == "yes" ]]; then
    if yesno "Build System" "Makefile detected. Include standard build system instructions (make build/test/lint/etc)?"; then
      include_build="yes"
    fi
  fi

  # --- Step 6: Environments ---
  local include_environments="no"
  if yesno "Environments" "Include environment definitions (dev/test/stage/prod)?"; then
    include_environments="yes"
  fi

  # --- Assemble the document ---
  local content=""

  # Coding guidelines — common first, then language-specific
  content+="$(template_coding_common)"
  content+=$'\n'

  IFS=' ' read -ra types_array <<< "$selected_types"
  for t in "${types_array[@]}"; do
    case "$t" in
      go)              content+=$'\n'; content+="$(template_coding_go)" ;;
      typescript)      content+=$'\n'; content+="$(template_coding_typescript)" ;;
      javascript)      content+=$'\n'; content+="$(template_coding_javascript)" ;;
      java)            content+=$'\n'; content+="$(template_coding_java)" ;;
      python)          content+=$'\n'; content+="$(template_coding_python)" ;;
      react)           content+=$'\n'; content+="$(template_coding_react)" ;;
      playwright)      content+=$'\n'; content+="$(template_coding_playwright)" ;;
      cloudformation)  content+=$'\n'; content+="$(template_coding_cloudformation)" ;;
      terraform)       content+=$'\n'; content+="$(template_coding_terraform)" ;;
    esac
  done

  # Git workflow
  content+=$'\n'
  case "$repo_type" in
    single)   content+="$(template_git_single_repo)" ;;
    monorepo) content+="$(template_git_monorepo)" ;;
  esac

  # Branching
  content+=$'\n'
  case "$ticket_system" in
    github) content+="$(template_branching_github)" ;;
    none)   content+="$(template_branching_none)" ;;
  esac

  # Git safety
  content+=$'\n'
  content+="$(template_git_safety)"

  # Build system
  if [[ "$include_build" == "yes" ]]; then
    content+=$'\n'
    content+="$(template_build)"
  fi

  # Environments
  if [[ "$include_environments" == "yes" ]]; then
    content+=$'\n'
    content+="$(template_environments)"
  fi

  # Memory
  content+=$'\n'
  content+="$(template_memory)"

  # Tools
  content+=$'\n'
  content+="$(template_tools)"

  # --- Write output files ---
  for f in "${output_files[@]}"; do
    local filepath="$TARGET_DIR/$f"
    # ensure parent directory exists
    mkdir -p "$(dirname "$filepath")"

    local file_content="$content"

    if [[ -n "${incorporate_files[$f]+x}" ]] && [[ -f "$filepath" ]]; then
      # Incorporate: merge new content into existing file
      local existing
      existing=$(<"$filepath")
      local merged
      merged=$(incorporate_content "$existing" "$file_content")
      printf '%s\n' "$merged" > "$filepath"
    else
      printf '%s\n' "$file_content" > "$filepath"
    fi
  done

  # --- Write project-config.json if ticket system is jira or github ---
  if [[ "$ticket_system" != "none" ]]; then
    local config_file="$TARGET_DIR/project-config.json"
    if [[ ! -f "$config_file" ]]; then
      # try to infer repo name from git remote
      local repo_name=""
      if command -v git &>/dev/null && git -C "$TARGET_DIR" rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
        repo_name=$(git -C "$TARGET_DIR" remote get-url origin 2>/dev/null | sed -E 's#.*/([^/]+/[^/]+?)(\.git)?$#\1#' || true)
      fi
      cat > "$config_file" <<EOF
{
  "repository": "${repo_name}",
  "tickets": "${ticket_system}"
}
EOF
    fi
  fi

  # --- Create docs/memory directory ---
  mkdir -p "$TARGET_DIR/docs/memory"

  # --- Create docs/.gitignore ---
  cat > "$TARGET_DIR/docs/.gitignore" <<'GITIGNORE'
prd.*
felix.json
GITIGNORE

  # --- Summary ---
  local file_list=""
  for f in "${output_files[@]}"; do
    file_list+="  - $f\n"
  done
  if [[ "$ticket_system" != "none" ]] && [[ ! -f "$TARGET_DIR/project-config.json" || true ]]; then
    file_list+="  - project-config.json\n"
  fi
  file_list+="  - docs/memory/ (directory)\n"
  file_list+="  - docs/.gitignore\n"

  local type_list=""
  for t in "${types_array[@]}"; do
    type_list+="$t, "
  done
  type_list="${type_list%, }"

  info_box "Done" "Bootstrap complete!\n\nFiles created/updated:\n${file_list}\nCode types: ${type_list}\nTicket system: ${ticket_system}\nRepo type: ${repo_type}\n\nReview the generated files and adjust as needed."
}

main
