# Java Coding Guidelines

These are defaults. If the project's existing code follows different conventions, match those instead.

## Language Features

- Use modern Java idioms: records for data carriers, sealed classes for restricted hierarchies, pattern matching in `switch` and `instanceof` where the project's Java version supports them.
- Prefer immutable data structures. Use `List.of()`, `Map.of()`, `Set.of()` and unmodifiable collections over mutable ones unless mutation is necessary.
- Use `Optional<T>` as a return type instead of returning `null`. Do not use `Optional` for fields or method parameters.
- Use try-with-resources for anything that implements `AutoCloseable`. Never rely on `finally` blocks for resource cleanup when try-with-resources is available.
- Check pom.xml for Java version information. Do not use Java11 features when the project uses Java8.

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
