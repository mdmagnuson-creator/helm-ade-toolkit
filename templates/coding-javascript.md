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
