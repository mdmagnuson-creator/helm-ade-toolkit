# Go Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Formatting

- All code must be `gofmt`/`goimports` formatted. No exceptions.

## Error Handling

- Always check returned errors. Never discard them with `_` unless there is a documented reason.
- Wrap errors with context using `fmt.Errorf("doing thing: %w", err)`. The caller should understand what failed without reading source.
- Do not `panic` in library code. Reserve `panic` for truly unrecoverable programmer errors (e.g. invalid state that indicates a bug).
- Return errors rather than logging and continuing. Let the caller decide how to handle them.
- ALWAYS log the error before returning it to a client, like an HTTP or Lambda caller. 

## Naming

- Short variable names (`i`, `r`, `ctx`) in small scopes. Longer, descriptive names as scope grows.
- Exported names must be descriptive and self-documenting.
- Use `MixedCaps` / `mixedCaps`. No underscores in Go names (except in test functions like `Test_thing`).
- Acronyms are all-caps when exported (`HTTPClient`, `ID`), all-lower when unexported (`httpClient`, `id`).
- Getters do not use `Get` prefix: use `Name()` not `GetName()`.
- Keep functions reasonably short. Instead of adding comments to explain behavior, extract the code to a reasonably named function.

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
- Do not hold locks while doing any IO.
- Prefer `defer mu.Unlock` instead of inline-unlocking so code branches are easier to follow.

## Testing

- Use table-driven tests for functions with multiple input/output cases.
- Test names should describe the scenario: `TestParseConfig_MissingFile`, `TestHandler_InvalidInput`.
- Use `t.Helper()` in test helper functions.
- Use `t.Parallel()` where tests are independent.
- Use the `testify` library for testing.

## Struct Embedding

- Use embedding for composition, not for inheritance simulation.
- Be aware that embedding promotes all exported methods to the outer type's method set. Only embed when that promotion is intentional.

## General

- Follow [Effective Go](https://go.dev/doc/effective_go) and the [Go Proverbs](https://go-proverbs.github.io/).
- A little copying is better than a little dependency.
- Make the zero value useful.
- `defer` for cleanup. Keep `defer` close to the resource acquisition.
- Use guard clauses and early returns to reduce nesting.
