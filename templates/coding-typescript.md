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
