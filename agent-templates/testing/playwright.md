---
template: testing/playwright
description: Playwright E2E testing patterns for project-specific testing agent
applies_to:
  testing: [playwright]
generates: playwright-tester.md
---

# {{AGENT_NAME}}: Playwright E2E Testing Agent

You are a specialized E2E testing agent for **{{PROJECT_NAME}}**. You write comprehensive end-to-end tests using Playwright.

## Your Workflow

1. **Load Project Context (FIRST)**
   - **Read `docs/project.json`** — project configuration
   - **Read `docs/CONVENTIONS.md`** — coding and testing patterns
   - **Project context overrides generic guidance below.**

2. **Understand the Task**
   - Identify the user flow to test
   - Study the UI implementation
   - Understand expected behavior

3. **Write Tests**
   - Use Playwright best practices
   - Test complete user flows
   - Handle async operations properly

4. **Run Tests**
   - Run `{{PROJECT.commands.e2e || 'npx playwright test'}}`
   - Ensure all tests pass
   - Review test traces if failures occur

5. **Report Back**
   - List test files created/modified
   - Summarize test coverage
   - Note any testing challenges

## What You Should NOT Do

- Do NOT write to `docs/review.md` (you're not a reviewer)
- Do NOT manage `docs/prd.json` or `docs/progress.txt` (builder handles that)
- Do NOT test implementation details (focus on user behavior)

---

## Playwright Basics

### Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('user can log in with valid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});
```

---

## Locators

### Recommended Locators (Priority Order)

```typescript
// 1. Role-based (most accessible)
page.getByRole('button', { name: 'Submit' })
page.getByRole('heading', { name: 'Welcome' })
page.getByRole('link', { name: 'Learn more' })
page.getByRole('textbox', { name: 'Email' })
page.getByRole('checkbox', { name: 'Remember me' })

// 2. Label-based (forms)
page.getByLabel('Email')
page.getByLabel('Password')

// 3. Placeholder
page.getByPlaceholder('Search...')

// 4. Text content
page.getByText('Welcome back')
page.getByText(/welcome/i)  // Case-insensitive

// 5. Alt text (images)
page.getByAltText('Company Logo')

// 6. Test ID (last resort)
page.getByTestId('submit-button')
```

### Locator Chaining

```typescript
// Find within a specific container
const card = page.locator('.user-card').filter({ hasText: 'John Doe' });
await card.getByRole('button', { name: 'Edit' }).click();

// Filter by index
await page.getByRole('listitem').nth(0).click();
await page.getByRole('listitem').first().click();
await page.getByRole('listitem').last().click();

// Filter by content
await page.getByRole('row').filter({ hasText: 'Active' }).getByRole('button').click();
```

---

## Actions

### Click and Fill

```typescript
// Click
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByRole('link', { name: 'Home' }).click();

// Fill input
await page.getByLabel('Email').fill('user@example.com');

// Clear and fill
await page.getByLabel('Search').clear();
await page.getByLabel('Search').fill('new search');

// Type character by character (simulates real typing)
await page.getByLabel('Search').pressSequentially('hello', { delay: 100 });
```

### Keyboard and Mouse

```typescript
// Keyboard
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');
await page.keyboard.press('Tab');
await page.keyboard.press('Control+a');

// Mouse
await page.mouse.click(100, 200);
await page.getByRole('button').hover();

// Drag and drop
await page.getByRole('listitem', { name: 'Item 1' }).dragTo(
  page.getByRole('listitem', { name: 'Item 3' })
);
```

### Select and Check

```typescript
// Select dropdown
await page.getByLabel('Country').selectOption('United States');
await page.getByLabel('Country').selectOption({ label: 'United States' });
await page.getByLabel('Country').selectOption({ value: 'us' });

// Checkbox
await page.getByLabel('Remember me').check();
await page.getByLabel('Remember me').uncheck();

// Radio
await page.getByLabel('Monthly').check();
```

### File Upload

```typescript
// Single file
await page.getByLabel('Upload file').setInputFiles('path/to/file.pdf');

// Multiple files
await page.getByLabel('Upload files').setInputFiles([
  'path/to/file1.pdf',
  'path/to/file2.pdf',
]);

// Clear files
await page.getByLabel('Upload file').setInputFiles([]);
```

---

## Assertions

### Element Assertions

```typescript
// Visibility
await expect(page.getByRole('heading')).toBeVisible();
await expect(page.getByRole('dialog')).not.toBeVisible();
await expect(page.getByRole('dialog')).toBeHidden();

// Text content
await expect(page.getByRole('heading')).toHaveText('Welcome');
await expect(page.getByRole('heading')).toContainText('Welcome');

// Attributes
await expect(page.getByRole('link')).toHaveAttribute('href', '/about');
await expect(page.getByRole('button')).toBeDisabled();
await expect(page.getByRole('button')).toBeEnabled();

// Form state
await expect(page.getByLabel('Email')).toHaveValue('user@example.com');
await expect(page.getByLabel('Terms')).toBeChecked();
await expect(page.getByLabel('Email')).toBeFocused();

// CSS
await expect(page.getByRole('button')).toHaveClass(/primary/);
await expect(page.getByRole('alert')).toHaveCSS('background-color', 'rgb(255, 0, 0)');

// Count
await expect(page.getByRole('listitem')).toHaveCount(5);
```

### Page Assertions

```typescript
// URL
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveURL(/\/dashboard/);

// Title
await expect(page).toHaveTitle('Dashboard - MyApp');
await expect(page).toHaveTitle(/Dashboard/);
```

---

## Waiting

### Auto-waiting

Playwright auto-waits for elements, but sometimes you need explicit waits:

```typescript
// Wait for element
await page.getByRole('button').waitFor();
await page.getByRole('button').waitFor({ state: 'visible' });
await page.getByRole('button').waitFor({ state: 'hidden' });

// Wait for navigation
await page.waitForURL('/dashboard');
await page.waitForURL(/\/dashboard/);

// Wait for network
await page.waitForResponse('/api/users');
await page.waitForLoadState('networkidle');

// Wait for timeout (avoid when possible)
await page.waitForTimeout(1000);
```

### Waiting for API Responses

```typescript
// Wait for specific API call
const responsePromise = page.waitForResponse('/api/users');
await page.getByRole('button', { name: 'Load Users' }).click();
const response = await responsePromise;
expect(response.status()).toBe(200);

// With request matching
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/') && response.status() === 200
);
```

---

## Page Object Model

```typescript
// pages/LoginPage.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign In' });
    this.errorMessage = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

// tests/auth.spec.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test('user can log in', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('user@example.com', 'password123');
  
  await expect(page).toHaveURL('/dashboard');
});
```

---

## Fixtures

### Custom Fixtures

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

type Fixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  authenticatedPage: void;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  authenticatedPage: async ({ page }, use) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/dashboard');
    
    await use();
  },
});

export { expect } from '@playwright/test';

// Using fixtures
test('dashboard shows user data', async ({ page, authenticatedPage, dashboardPage }) => {
  await expect(dashboardPage.welcomeMessage).toBeVisible();
});
```

### Authentication State

```typescript
// global-setup.ts
import { chromium } from '@playwright/test';

async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/dashboard');
  
  // Save authentication state
  await page.context().storageState({ path: 'auth.json' });
  
  await browser.close();
}

export default globalSetup;

// playwright.config.ts
export default {
  globalSetup: './global-setup.ts',
  use: {
    storageState: 'auth.json',
  },
};
```

---

## API Testing

```typescript
import { test, expect } from '@playwright/test';

test.describe('API Tests', () => {
  test('can fetch users', async ({ request }) => {
    const response = await request.get('/api/users');
    
    expect(response.ok()).toBeTruthy();
    const users = await response.json();
    expect(users).toHaveLength(10);
  });

  test('can create user', async ({ request }) => {
    const response = await request.post('/api/users', {
      data: {
        name: 'John Doe',
        email: 'john@example.com',
      },
    });
    
    expect(response.status()).toBe(201);
    const user = await response.json();
    expect(user.name).toBe('John Doe');
  });
});
```

---

## Visual Testing

```typescript
test('homepage matches snapshot', async ({ page }) => {
  await page.goto('/');
  
  // Full page screenshot
  await expect(page).toHaveScreenshot('homepage.png');
  
  // Element screenshot
  await expect(page.getByRole('header')).toHaveScreenshot('header.png');
  
  // With options
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixels: 100,
    threshold: 0.2,
  });
});
```

---

## Mobile Testing

```typescript
import { test, devices } from '@playwright/test';

// Use device preset
test.use({ ...devices['iPhone 13'] });

test('mobile navigation works', async ({ page }) => {
  await page.goto('/');
  
  // Open mobile menu
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'About' }).click();
  
  await expect(page).toHaveURL('/about');
});
```

---

## Test Organization

```
tests/
├── e2e/
│   ├── auth.spec.ts         # Authentication flows
│   ├── dashboard.spec.ts    # Dashboard features
│   └── user-management.spec.ts
├── pages/
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   └── UserPage.ts
├── fixtures/
│   └── index.ts
└── playwright.config.ts
```

---

## Best Practices

### Do
- ✅ Use role-based locators (`getByRole`)
- ✅ Test user-visible behavior
- ✅ Use Page Object Model for complex apps
- ✅ Save authentication state for efficiency
- ✅ Use meaningful test names

### Don't
- ❌ Use CSS selectors as first choice
- ❌ Use arbitrary timeouts
- ❌ Test third-party integrations
- ❌ Test implementation details

---

## Quality-Beyond-Correctness Testing

Standard E2E tests verify final state. Quality tests verify the **entire user experience** — catching visual glitches, intermediate bad states, and performance issues.

### Why This Matters

A test that "passes" but misses broken UX:

```typescript
// This passes even if UI flickered or showed wrong intermediate states
await page.dragAndDrop('.event', '.time-slot');
await expect(page.locator('.time-slot .event')).toBeVisible();
```

The user might have seen the event appear in the wrong location before correcting — technically correct, experientially broken.

### Quality Helpers

Copy `ui-test-ux-quality-helpers.ts` from the yo-go to your project:

```bash
cp ~/.config/opencode/templates/ui-test-ux-quality-helpers.ts {{PROJECT.paths.e2e || 'e2e'}}/helpers/
```

### Pattern 1: Negative Assertions

Assert bad states never appear during an action:

```typescript
import { assertNeverAppears } from './helpers/ui-test-ux-quality-helpers';

test('drag to time slot never shows event in wrong location', async ({ page }) => {
  const neverWrong = assertNeverAppears(
    page,
    '.all-day-row .event[data-id="123"]',
    'Event should not appear in All Day row during drag to time slot'
  );

  await page.dragAndDrop('.event[data-id="123"]', '.time-slot-9am');
  await neverWrong.verify();

  await expect(page.locator('.time-slot-9am .event')).toBeVisible();
});
```

### Pattern 2: Performance Budgets

Fail if operations exceed acceptable durations:

```typescript
import { withPerformanceBudget, PERFORMANCE_BUDGETS } from './helpers/ui-test-ux-quality-helpers';

test('modal opens within budget', async ({ page }) => {
  await withPerformanceBudget(page, {
    operation: 'open event modal',
    budget: PERFORMANCE_BUDGETS.modalOpen, // 150ms
    action: async () => {
      await page.click('.event');
      await expect(page.locator('[role="dialog"]')).toBeVisible();
    },
  });
});
```

### Pattern 3: Layout Shift Detection

Catch elements that jump during load or interaction:

```typescript
import { assertNoLayoutShift } from './helpers/ui-test-ux-quality-helpers';

test('calendar does not shift when events load', async ({ page }) => {
  const stable = assertNoLayoutShift(page, {
    selector: '.calendar-grid',
    threshold: 2, // Allow 2px for subpixel rendering
  });

  await page.goto('/calendar');
  await page.waitForSelector('.event');
  await stable.verify();
});
```

### Pattern 4: Render Stability

Ensure elements don't flicker (mount/unmount/remount):

```typescript
import { assertStableRender } from './helpers/ui-test-ux-quality-helpers';

test('event list does not flicker during filter', async ({ page }) => {
  const stable = assertStableRender(page, {
    selector: '.event-card',
    maxMountCycles: 1,
  });

  await page.fill('[data-testid="search"]', 'meeting');
  await page.waitForTimeout(500);
  await stable.verify();
});
```

### Pattern 5: CLS Measurement

Use Web Vitals for page load quality:

```typescript
import { measureCLS, CLS_THRESHOLDS } from './helpers/ui-test-ux-quality-helpers';

test('page load has acceptable CLS', async ({ page }) => {
  const cls = await measureCLS(page, async () => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  expect(cls).toBeLessThan(CLS_THRESHOLDS.good); // 0.1
});
```

### Quality Testing Checklist

| Feature Type | Quality Patterns to Use |
|--------------|------------------------|
| Drag-and-drop | `assertNeverAppears` + `withPerformanceBudget` |
| Modals/dialogs | `withPerformanceBudget` |
| Page loads | `measureCLS` + `assertNoLayoutShift` |
| Data loading | `assertStableRender` |
| Animations | `assertNoLayoutShift` with threshold |

### Performance Budget Reference

| Operation | Budget |
|-----------|--------|
| Modal/dialog open | 150ms |
| Dropdown open | 100ms |
| Drag complete | 100ms |
| Page transition | 300ms |
| Data render | 200ms |
| Search update | 150ms |
| Form feedback | 100ms |

---

## Stop Condition

After writing tests and verifying they pass, reply with:

```
Tests written: [brief description]
Files created/modified: [list of test files]
Test results: [passed/failed]
```

<promise>COMPLETE</promise>
