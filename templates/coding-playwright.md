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

## Quality-Beyond-Correctness Testing

Standard tests verify final state. Quality tests verify the **entire user experience** — catching visual glitches, intermediate bad states, and performance issues.

### When Standard Tests Are Not Enough

A drag-and-drop test that passes:
```typescript
// This passes even if UI flickered or showed wrong states
await page.dragAndDrop('.event', '.time-slot');
await expect(page.locator('.time-slot .event')).toBeVisible();
```

But the user saw the event appear in the wrong place before correcting. The test passed; the UX was broken.

### Quality Helper Patterns

Copy `ui-test-ux-quality-helpers.ts` to your project for these patterns:

**Negative Assertions** — assert bad states never appear during an action:
```typescript
const neverBad = assertNeverAppears(page, '.wrong-location .item');
await page.dragAndDrop('.item', '.correct-location');
await neverBad.verify();
```

**Performance Budgets** — fail if operations are too slow:
```typescript
await withPerformanceBudget(page, {
  operation: 'open modal',
  budget: 150,
  action: async () => {
    await page.click('.trigger');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  },
});
```

**Layout Shift Detection** — catch elements that jump:
```typescript
const stable = assertNoLayoutShift(page, { selector: '.content', threshold: 2 });
await page.goto('/dashboard');
await stable.verify();
```

**Render Stability** — catch flickering elements:
```typescript
const stable = assertStableRender(page, { selector: '.card', maxMountCycles: 1 });
await page.fill('[data-testid="search"]', 'query');
await stable.verify();
```

### Quality Targets

| Metric | Target |
|--------|--------|
| Modal/dialog open | ≤150ms |
| Dropdown open | ≤100ms |
| Drag-drop complete | ≤100ms |
| CLS (page load) | <0.1 |

### When to Add Quality Tests

- Drag-and-drop, reordering, sorting
- Modal/dialog/popover interactions
- Page load and navigation
- Data loading and filtering
- Any animation or transition

## Playwright Config

> ⚠️ **Do NOT use Playwright's `webServer` config option.**
>
> Playwright's default `webServer` behavior kills the dev server when tests complete.
> The dev server is managed externally by Builder/test-flow.
> For remote URLs (Vercel preview, staging), no server management is needed.

**Correct config pattern:**

```typescript
import { defineConfig, devices } from '@playwright/test';

// Read base URL from environment (set by test-flow before running)
// Supports localhost, preview URLs (Vercel, Netlify, etc.), and staging URLs
const TEST_BASE_URL = process.env.TEST_BASE_URL || `http://localhost:${process.env.DEV_PORT || '3000'}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',  // Use list reporter to avoid hanging
  
  use: {
    baseURL: TEST_BASE_URL,
    trace: 'on-first-retry',
  },

  // NO webServer config — dev server is managed externally
  // This prevents Playwright from killing the server after tests
  // For remote URLs (preview deployments, staging), no server management needed

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
```

**Key points:**
- Use `TEST_BASE_URL` from environment (supports localhost, preview, and staging URLs)
- Fall back to `DEV_PORT` for backward compatibility with localhost testing
- Use `reporter: 'list'` to prevent process hanging
- No `webServer` config — external management keeps server running
- Include multi-browser projects for comprehensive testing
