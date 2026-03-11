---
name: screenshot
description: "Capture authenticated screenshots of web pages for visual verification. Use when you need to see rendered UI, verify dark mode styling, or check visual changes. Triggers on: take screenshot, capture screenshot, show me the page, visual check, verify styling."
---

# Screenshot Capture Skill

Capture screenshots of web application pages for visual verification.

---

## The Job

1. Start the dev server if not running
2. Check `project.json` for authentication configuration
3. Authenticate using the appropriate auth skill (if needed)
4. Navigate to requested page(s)
5. Capture screenshots in BOTH light and dark modes (always capture both)
6. **Actually view the screenshots** using the Read tool to verify the issue
7. Report findings based on visual inspection

---

## CRITICAL: Visual Verification Workflow

When reviewing contrast, color, or visibility issues:

1. **ALWAYS capture screenshots BEFORE analyzing code** - Visual issues are best caught visually
2. **ALWAYS capture BOTH light AND dark modes** - Issues often affect modes differently
3. **ALWAYS use the Read tool to view captured screenshots** - Don't just capture, actually look
4. **Check globals.css for CSS resets** - Rules like `a { color: inherit }` override Tailwind utilities

---

## Authentication Flow

### Step 1: Check project.json for auth config

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface AuthConfig {
  method: string;
  provider: string;
  skill?: string;
  testUser?: {
    mode: 'fixed' | 'dynamic';
    emailVar?: string;
    emailDefault?: string;
  };
  routes?: {
    login: string;
    authenticated: string;
  };
  headless?: {
    enabled: boolean;
    method: string;
  };
}

function getAuthConfig(projectRoot: string): AuthConfig | null {
  const projectJsonPath = path.join(projectRoot, 'docs', 'project.json');
  
  if (!fs.existsSync(projectJsonPath)) {
    console.log('No project.json found, skipping authentication');
    return null;
  }
  
  const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
  
  if (!projectJson.authentication) {
    console.log('No authentication config in project.json');
    return null;
  }
  
  if (projectJson.authentication.method === 'none') {
    console.log('Authentication method is "none", skipping');
    return null;
  }
  
  return projectJson.authentication;
}
```

### Step 2: Select authentication skill based on config

```typescript
function selectAuthSkill(config: AuthConfig): string {
  // If explicitly specified, use that
  if (config.skill) {
    return config.skill;
  }
  
  // Otherwise, select based on provider + method
  const { provider, method } = config;
  
  if (provider === 'supabase') {
    if (method === 'passwordless-otp') return 'auth-supabase-otp';
    if (method === 'email-password') return 'auth-supabase-password';
  }
  
  if (provider === 'nextauth') {
    if (method === 'email-password') return 'auth-nextauth-credentials';
  }
  
  // Fallback to generic
  return 'auth-generic';
}
```

### Step 3: Authenticate using selected skill

The screenshot script should delegate to the appropriate auth skill. For headless mode (faster):

```typescript
import { BrowserContext, Page } from 'playwright';

async function authenticate(
  context: BrowserContext,
  page: Page,
  baseUrl: string,
  projectRoot: string
): Promise<void> {
  const config = getAuthConfig(projectRoot);
  
  if (!config) {
    console.log('No auth required');
    return;
  }
  
  // Use headless auth if enabled (faster)
  if (config.headless?.enabled) {
    console.log('Using headless authentication');
    await authenticateHeadless(context, baseUrl, projectRoot, config);
    return;
  }
  
  // Otherwise use UI-based auth
  console.log(`Using UI authentication with ${selectAuthSkill(config)}`);
  await authenticateViaUI(page, baseUrl, projectRoot, config);
}
```

---

## Public Pages (No Auth Required)

For public pages like the homepage, marketing pages, or login pages, use this simpler script:

### Script Template: `public-screenshot.ts`

```typescript
import { chromium } from 'playwright';
import * as fs from 'fs';

const BASE_URL = 'http://localhost:5001';
const OUTPUT_DIR = '.tmp/screenshots';  // Use project-local .tmp/ (never /tmp/)

// Pages to capture (customize per request)
const PAGES_TO_CAPTURE = [
  { path: '/', name: 'homepage' },
  // Add more pages as needed
];

// Max screenshot height (Claude vision API limit is 8000px, use 4000 for safety)
const MAX_SCREENSHOT_HEIGHT = 4000;

async function capturePublicPages() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  try {
    for (const pageConfig of PAGES_TO_CAPTURE) {
      // Light mode
      await page.goto(`${BASE_URL}${pageConfig.path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      
      // Constrain height to avoid Claude vision API rejection
      const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
      const captureHeight = Math.min(bodyHeight, MAX_SCREENSHOT_HEIGHT);
      
      await page.screenshot({ 
        path: `${OUTPUT_DIR}/${pageConfig.name}-light.png`, 
        clip: { x: 0, y: 0, width: 1920, height: captureHeight }
      });
      console.log(`Captured: ${pageConfig.name}-light.png (${captureHeight}px)`);
      
      // Dark mode
      await page.evaluate(() => {
        document.documentElement.classList.add('dark');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ 
        path: `${OUTPUT_DIR}/${pageConfig.name}-dark.png`, 
        clip: { x: 0, y: 0, width: 1920, height: captureHeight }
      });
      console.log(`Captured: ${pageConfig.name}-dark.png (${captureHeight}px)`);
      
      // Reset for next page
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark');
      });
    }
    
    console.log(`\nScreenshots saved to ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

capturePublicPages().catch(console.error);
```

---

## Authenticated Pages

For pages that require login (dashboard, settings, etc.), use the config-driven authentication.

### Prerequisites

This skill requires:

1. **Playwright installed** in the project (`npx playwright --version`)
2. **Authentication configured** in `docs/project.json` (or pages must be public)
3. **Environment variables** set in `.env.local` as documented in the auth skill
4. **Dev server** running or startable via `npm run dev`

### Full Screenshot Script with Auth Config

```typescript
import { chromium, BrowserContext, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const PROJECT_ROOT = process.cwd();
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5001';
const OUTPUT_DIR = '.tmp/screenshots';

// Max screenshot dimension (Claude vision limit is 8000px)
const MAX_SCREENSHOT_HEIGHT = 4000;

// Pages to capture (customize per request)
const PAGES_TO_CAPTURE = [
  { path: '/dashboard', name: 'dashboard' },
  // Add more pages as needed
];

// Theme modes to capture
const THEMES = ['light', 'dark'];

// ============================================================
// Auth Configuration Loading
// ============================================================

interface AuthConfig {
  method: string;
  provider: string;
  skill?: string;
  testUser?: {
    mode: 'fixed' | 'dynamic';
    emailVar?: string;
    emailDefault?: string;
    passwordVar?: string;
  };
  verification?: {
    source: string;
    table: string;
    column: string;
    lookupBy: string;
  };
  routes?: {
    login: string;
    verify?: string;
    authenticated: string;
  };
  selectors?: Record<string, string>;
  headless?: {
    enabled: boolean;
    method: string;
  };
}

function loadEnv(): void {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    });
  }
}

function getAuthConfig(): AuthConfig | null {
  const projectJsonPath = path.join(PROJECT_ROOT, 'docs', 'project.json');
  
  if (!fs.existsSync(projectJsonPath)) {
    return null;
  }
  
  const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
  
  if (!projectJson.authentication || projectJson.authentication.method === 'none') {
    return null;
  }
  
  return projectJson.authentication;
}

function getTestEmail(config: AuthConfig): string {
  if (config.testUser?.mode === 'dynamic') {
    const uuid = crypto.randomUUID().slice(0, 8);
    const pattern = (config.testUser as any).emailPattern || 'test-{uuid}@example.com';
    return pattern.replace('{uuid}', uuid);
  }
  
  const envVar = config.testUser?.emailVar || 'TEST_EMAIL';
  return process.env[envVar] || config.testUser?.emailDefault || 'test@example.com';
}

function getTestPassword(config: AuthConfig): string {
  const envVar = config.testUser?.passwordVar || 'TEST_PASSWORD';
  return process.env[envVar] || (config.testUser as any)?.passwordDefault || '';
}

// ============================================================
// Supabase Helpers
// ============================================================

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function getVerificationCode(email: string, config: AuthConfig): Promise<string> {
  if (!config.verification) {
    throw new Error('No verification config for OTP');
  }
  
  const supabase = getSupabaseClient();
  const { table, column, lookupBy } = config.verification;
  
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .eq(lookupBy, email)
    .single();
  
  if (error || !data?.[column]) {
    throw new Error(`Failed to get verification code: ${error?.message || 'No code found'}`);
  }
  
  return data[column];
}

// ============================================================
// Authentication Methods
// ============================================================

async function authenticateSupabaseOTP(page: Page, config: AuthConfig): Promise<void> {
  const email = getTestEmail(config);
  const routes = config.routes || { login: '/login', verify: '/verify', authenticated: '/dashboard' };
  const selectors = config.selectors || {};
  
  // Go to login
  await page.goto(`${BASE_URL}${routes.login}`);
  await page.waitForSelector(selectors.emailInput || 'input[type="email"]');
  
  // Enter email
  await page.fill(selectors.emailInput || 'input[type="email"]', email);
  await page.click(selectors.submitButton || 'button:has-text("Continue"), button[type="submit"]');
  
  // Wait for verify page
  await page.waitForURL(new RegExp(routes.verify || '/verify'));
  await page.waitForTimeout(1000);
  
  // Fetch code from database
  const code = await getVerificationCode(email, config);
  
  // Enter code
  const otpSelector = selectors.otpInputs || 'input[maxlength="1"]';
  const otpInputs = page.locator(otpSelector);
  const inputCount = await otpInputs.count();
  
  if (inputCount >= 6) {
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(code[i]);
    }
  } else {
    await otpInputs.first().fill(code);
  }
  
  // Submit
  await page.click(selectors.verifyButton || 'button:has-text("Verify"), button[type="submit"]');
  await page.waitForURL(new RegExp(routes.authenticated));
  console.log('OTP authentication successful');
}

async function authenticatePassword(page: Page, config: AuthConfig): Promise<void> {
  const email = getTestEmail(config);
  const password = getTestPassword(config);
  const routes = config.routes || { login: '/login', authenticated: '/dashboard' };
  const selectors = config.selectors || {};
  
  // Go to login
  await page.goto(`${BASE_URL}${routes.login}`);
  await page.waitForSelector(selectors.emailInput || 'input[type="email"]');
  
  // Enter credentials
  await page.fill(selectors.emailInput || 'input[type="email"], input[name="email"]', email);
  await page.fill(selectors.passwordInput || 'input[type="password"]', password);
  await page.click(selectors.submitButton || 'button[type="submit"]');
  
  // Wait for authenticated page
  await page.waitForURL(new RegExp(routes.authenticated));
  console.log('Password authentication successful');
}

async function authenticate(page: Page, config: AuthConfig): Promise<void> {
  const { provider, method } = config;
  
  if (provider === 'supabase' && method === 'passwordless-otp') {
    await authenticateSupabaseOTP(page, config);
  } else if (method === 'email-password') {
    await authenticatePassword(page, config);
  } else {
    // Generic fallback - try password auth
    await authenticatePassword(page, config);
  }
}

// ============================================================
// Theme Management
// ============================================================

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, theme);
  
  await page.reload();
  await page.waitForLoadState('networkidle');
}

// ============================================================
// Main Screenshot Capture
// ============================================================

async function captureScreenshots(): Promise<void> {
  loadEnv();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  try {
    // Check for auth config
    const authConfig = getAuthConfig();
    
    if (authConfig) {
      console.log(`Auth config found: ${authConfig.provider}/${authConfig.method}`);
      await authenticate(page, authConfig);
    } else {
      console.log('No auth config found, capturing without authentication');
    }
    
    // Capture each page in each theme
    for (const theme of THEMES) {
      await setTheme(page, theme as 'light' | 'dark');
      
      for (const pageConfig of PAGES_TO_CAPTURE) {
        await page.goto(`${BASE_URL}${pageConfig.path}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(500);
        
        const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
        const captureHeight = Math.min(bodyHeight, MAX_SCREENSHOT_HEIGHT);
        
        const filename = `${pageConfig.name}-${theme}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        await page.screenshot({ 
          path: filepath, 
          clip: { x: 0, y: 0, width: 1920, height: captureHeight }
        });
        console.log(`Captured: ${filepath} (${captureHeight}px)`);
      }
    }
    
    console.log(`\nAll screenshots saved to ${OUTPUT_DIR}`);
  } finally {
    await browser.close();
  }
}

captureScreenshots().catch(console.error);
```

---

## Usage

### Step 1: Ensure auth is configured

Check that `docs/project.json` has authentication configured:

```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "testUser": {
      "mode": "fixed",
      "emailVar": "TEST_EMAIL"
    },
    "verification": {
      "source": "supabase",
      "table": "users",
      "column": "verification_code",
      "lookupBy": "email"
    },
    "routes": {
      "login": "/login",
      "verify": "/verify",
      "authenticated": "/dashboard"
    }
  }
}
```

If no auth config exists, run `/setup-auth` or capture public pages only.

### Step 2: Create and run the script

```bash
# In the web app directory
cat > e2e/screenshot-capture.ts << 'EOF'
// ... paste script content ...
EOF

npx tsx e2e/screenshot-capture.ts

# Clean up
rm e2e/screenshot-capture.ts
```

### Step 3: Review screenshots

Screenshots are saved to `.tmp/screenshots/` (project-local):
- `dashboard-light.png`
- `dashboard-dark.png`
- etc.

Use the Read tool to view them.

---

## Backward Compatibility

If `project.json` does not have an `authentication` section:

1. Check for legacy `TEST_EMAIL` env var
2. Try legacy Supabase OTP flow if Supabase env vars are present
3. Otherwise, capture without authentication (public pages only)

---

## Customization

### Capture Specific Pages

Modify `PAGES_TO_CAPTURE` array:

```typescript
const PAGES_TO_CAPTURE = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/dashboard/calendar', name: 'calendar' },
  { path: '/settings', name: 'settings' },
];
```

### Capture Specific States

Add interaction steps before capture:

```typescript
await page.click('button:has-text("Create Event")');
await page.waitForSelector('[role="dialog"]');
await page.screenshot({ path: '.tmp/screenshots/create-event-modal.png' });
```

### Mobile Viewport

```typescript
const context = await browser.newContext({
  viewport: { width: 375, height: 812 }, // iPhone X
});
```

---

## Troubleshooting

### "No authentication config found"

Either:
- Run `/setup-auth` to configure authentication
- Or capture only public pages

### "Missing Supabase env vars"

Ensure `.env.local` contains:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### "Failed to get verification code"

- Check that the test user exists in the database
- Verify the `verification` config matches your schema
- Ensure service role key has permission to read the table

### Dev server not running

Start it first: `npm run dev`

---

## Output

After running, report screenshot paths:

```
Screenshots captured:
- .tmp/screenshots/dashboard-light.png
- .tmp/screenshots/dashboard-dark.png
```

The user or aesthetic-critic agent can then view these images to verify styling.
