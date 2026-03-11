---
name: setup-auth
description: "Interactive authentication configuration for AI agents. Scans codebase for auth providers, walks through configuration options, and writes to project.json. Use when setting up auth config for screenshots, E2E tests, or QA. Triggers on: setup auth, configure authentication, /setup-auth, auth config."
---

# Setup Auth Skill

Interactive configuration wizard for setting up authentication in `project.json`. Enables AI agents (Screenshot, E2E Playwright, QA Browser Tester) to authenticate with your application during testing.

---

## The Job

1. Scan codebase for authentication provider clues
2. Confirm detected provider with user
3. Walk through configuration options with explanations
4. Write complete `authentication` block to `project.json`
5. Validate configuration by attempting a test login

---

## Step 1: Scan for Auth Clues

Scan the project for authentication provider indicators:

```bash
# Check package.json for auth-related dependencies
cat package.json | jq -r '.dependencies // {} | keys[]' 2>/dev/null
cat package.json | jq -r '.devDependencies // {} | keys[]' 2>/dev/null
```

**Detection patterns:**

| Dependency | Provider | Method |
|------------|----------|--------|
| `@supabase/supabase-js` | supabase | Check app for OTP vs password |
| `@supabase/ssr` | supabase | Check app for OTP vs password |
| `next-auth` | nextauth | credentials or oauth |
| `@auth/core` | nextauth | credentials or oauth |
| `@clerk/nextjs` | clerk | oauth (external) |
| `@auth0/auth0-react` | auth0 | oauth (external) |
| `firebase` | custom | varies |
| `passport` | custom | varies |

**Additional checks:**

```bash
# Look for Supabase OTP patterns
grep -r "signInWithOtp" src/ app/ --include="*.ts" --include="*.tsx" 2>/dev/null

# Look for Supabase password patterns
grep -r "signInWithPassword" src/ app/ --include="*.ts" --include="*.tsx" 2>/dev/null

# Look for NextAuth configuration
ls -la app/api/auth/\[...nextauth\]/ 2>/dev/null || ls -la pages/api/auth/\[...nextauth\].ts 2>/dev/null

# Look for login routes
find . -type f -name "*.tsx" -path "*/login/*" -o -name "*.tsx" -path "*/signin/*" 2>/dev/null | head -5
```

---

## Step 2: Present Detection Results

Show the user what was detected:

```
═══════════════════════════════════════════════════════════════════════
                    AUTHENTICATION SETUP
═══════════════════════════════════════════════════════════════════════

I scanned your codebase and detected:

  Provider: Supabase
  Method:   Passwordless OTP (magic link / email code)
  Evidence: 
    - Found @supabase/supabase-js in package.json
    - Found signInWithOtp() calls in src/lib/auth.ts

Is this correct? (Y/n)

> _
═══════════════════════════════════════════════════════════════════════
```

**If no provider detected:**

```
═══════════════════════════════════════════════════════════════════════
                    AUTHENTICATION SETUP
═══════════════════════════════════════════════════════════════════════

I couldn't detect your authentication provider automatically.

What authentication system does this project use?

  1. Supabase with passwordless OTP (magic link / email code)
  2. Supabase with email/password
  3. NextAuth with credentials (email/password)
  4. NextAuth with OAuth (Google, GitHub, etc.) [limited support]
  5. Clerk [limited support]
  6. Auth0 [limited support]
  7. Custom / Other
  8. No authentication (public app)

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 3: Configure Test User

Ask about test user strategy:

```
═══════════════════════════════════════════════════════════════════════
                    TEST USER CONFIGURATION
═══════════════════════════════════════════════════════════════════════

How should AI agents authenticate during testing?

  A. Fixed test user (recommended)
     Use a dedicated test account with known credentials.
     Best for: Most projects, faster tests, predictable state.

  B. Dynamic test users
     Generate unique test-{uuid}@example.com accounts per test run.
     Best for: Testing signup flows, isolation between test runs.
     Requires: Cleanup configuration to avoid test user accumulation.

> _
═══════════════════════════════════════════════════════════════════════
```

### Option A: Fixed Test User

```
═══════════════════════════════════════════════════════════════════════
                    FIXED TEST USER
═══════════════════════════════════════════════════════════════════════

Enter your test user credentials:

  Email: ____________
  (This should be a dedicated test account, not a real user)

  Password: ____________
  (Leave blank for passwordless OTP - we'll retrieve codes automatically)

Where should this test user land after login?

  Authenticated route: /dashboard
  (The page to navigate to after successful authentication)

> _
═══════════════════════════════════════════════════════════════════════
```

### Option B: Dynamic Test Users

```
═══════════════════════════════════════════════════════════════════════
                    DYNAMIC TEST USERS
═══════════════════════════════════════════════════════════════════════

Configure dynamic test user generation:

  Email pattern: test-{uuid}@yourdomain.com
  (Use {uuid} placeholder for unique identifier)

  Example generated email: test-abc123@yourdomain.com

Important: Dynamic users require cleanup configuration to prevent
accumulation. We'll configure cleanup in the next step.

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 4: Configure OTP Retrieval (if applicable)

For passwordless OTP providers:

```
═══════════════════════════════════════════════════════════════════════
                    OTP CODE RETRIEVAL
═══════════════════════════════════════════════════════════════════════

For passwordless login, agents need to retrieve verification codes
from your database. This uses service role credentials (server-side only).

Supabase detected - using default configuration:

  Table:    auth.users (for token_hash lookup)
  -OR-
  Table:    auth.one_time_tokens
  Column:   token_hash
  Lookup:   user_id → auth.users.email

Is this correct? (Y/n/customize)

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 5: Configure Routes

```
═══════════════════════════════════════════════════════════════════════
                    AUTHENTICATION ROUTES
═══════════════════════════════════════════════════════════════════════

Configure your authentication page routes:

  Login page:         /login      [Enter to accept default]
  Verify page (OTP):  /verify     [Enter to accept default]  
  After auth:         /dashboard  [Enter to accept default]

Custom routes? Enter each or press Enter to accept defaults:

  Login page: ____________
  Verify page: ____________
  After auth: ____________

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 6: Configure Performance Options

```
═══════════════════════════════════════════════════════════════════════
                    PERFORMANCE OPTIONS
═══════════════════════════════════════════════════════════════════════

Session Reuse:
  Save authenticated state and reuse across tests in the same run?
  This makes tests faster but shares state between tests.

  Enable session reuse? (y/N): ____________

Headless Auth:
  Skip UI login for most tests, inject session directly?
  One UI test exercises the full login flow, others use API auth.
  This is much faster for large test suites.

  Enable headless auth? (y/N): ____________

  If yes, specify the E2E test that covers login UI:
  UI test path: e2e/auth.spec.ts

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 6b: CLI Auth Configuration (if headless enabled)

If headless auth is enabled, ask about CLI-based token acquisition:

```
═══════════════════════════════════════════════════════════════════════
                    CLI AUTH TOKEN ACQUISITION
═══════════════════════════════════════════════════════════════════════

Does this project have a CLI command for getting test auth tokens?

  A. Yes — I have a CLI that outputs tokens
     (e.g., pnpm cli auth:test-token, custom admin API script)
  B. No — use standard auth method (Supabase admin, NextAuth direct, etc.)

> _
═══════════════════════════════════════════════════════════════════════
```

### If A (CLI available):

```
═══════════════════════════════════════════════════════════════════════
                    CLI AUTH DETAILS
═══════════════════════════════════════════════════════════════════════

Configure the CLI auth command:

  Command: ____________
  (e.g., pnpm cli auth:test-token --email $TEST_EMAIL)
  ($TEST_EMAIL will be expanded to the test user email)

  Output format?
    1. JSON (e.g., {"accessToken": "...", "refreshToken": "..."})
    2. Plain text (single token string)
    3. KEY=VALUE (one per line, e.g., ACCESS_TOKEN=... )

  > _

  Token field path (for JSON): accessToken
  (Dot-path to the access token in the JSON output)

  Refresh token path (for JSON, optional): refreshToken
  (Leave blank if no refresh token)

  Where does the app store the session?
    1. Cookies
    2. localStorage
    3. Both

  > _
═══════════════════════════════════════════════════════════════════════
```

**This populates `authentication.headless` with `method: "cli"`:**

```json
{
  "headless": {
    "enabled": true,
    "method": "cli",
    "command": "pnpm cli auth:test-token --email $TEST_EMAIL",
    "responseFormat": "json",
    "tokenPath": "accessToken",
    "refreshTokenPath": "refreshToken",
    "sessionStorage": "localStorage"
  }
}
```

---

## Step 6c: Auth Acquisition Steps (always ask)

Regardless of headless/CLI configuration, collect acquisition steps for agent understanding and fallback:

```
═══════════════════════════════════════════════════════════════════════
                    AUTH ACQUISITION STEPS
═══════════════════════════════════════════════════════════════════════

Describe how an agent should get an authenticated session for this
project. These steps are used as documentation and as a fallback when
automated auth fails.

  Summary (one line): ____________
  (e.g., "Use CLI to get a test token, inject into localStorage")

  Steps (one per line, press Enter twice to finish):
    1. ____________
    2. ____________
    3. ____________

  If automated auth fails, should the agent try UI-based login? (Y/n)

  Any gotchas or notes about the auth system? (optional): ____________

> _
═══════════════════════════════════════════════════════════════════════
```

**This populates `authentication.acquisition`:**

```json
{
  "acquisition": {
    "description": "Use CLI to get a test token, inject into localStorage",
    "steps": [
      "1. Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local",
      "2. Run: pnpm cli auth:test-token --email $TEST_EMAIL",
      "3. Parse JSON output for accessToken and refreshToken",
      "4. Inject tokens into browser localStorage",
      "5. Navigate to /dashboard — session should be active"
    ],
    "fallbackToUI": true,
    "notes": "The CLI command requires the service role key. Token expires after 1 hour."
  }
}
```

---

## Step 7: Configure Cleanup (if dynamic users)

```
═══════════════════════════════════════════════════════════════════════
                    TEST USER CLEANUP
═══════════════════════════════════════════════════════════════════════

Dynamic test users need cleanup to prevent accumulation.

  Email pattern for test users: ^test-.*@example\.com$
  (Regex pattern to identify test user accounts)

  When should cleanup run?

    A. Manual - run cleanup script when needed
    B. Auto - clean up in test teardown (after each test run)
    C. Scheduled - run via cron job

  > _

  Max age (hours): 24
  (Delete test users older than this)

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 8: Custom Selectors (if custom provider)

For custom/generic providers, collect CSS selectors:

```
═══════════════════════════════════════════════════════════════════════
                    CUSTOM SELECTORS
═══════════════════════════════════════════════════════════════════════

For custom auth providers, I need CSS selectors for your login form.

  Email input:    input[name="email"]
  Password input: input[name="password"]  
  Submit button:  button[type="submit"]

For OTP/verification page:
  OTP inputs:     input[data-otp]
  Verify button:  button[type="submit"]

Enter custom selectors (or Enter to accept defaults):

  Email input:    ____________
  Password input: ____________
  Submit button:  ____________
  OTP inputs:     ____________
  Verify button:  ____________

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Step 9: Generate Configuration

Based on collected answers, generate the `authentication` block:

**Example: Supabase OTP with fixed test user:**

```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "skill": "auth-supabase-otp",
    "testUser": {
      "type": "fixed",
      "email": "test@example.com"
    },
    "otpRetrieval": {
      "source": "supabase",
      "table": "auth.one_time_tokens",
      "column": "token_hash",
      "lookupBy": "user_id"
    },
    "routes": {
      "login": "/login",
      "verify": "/verify",
      "authenticated": "/dashboard"
    },
    "reuseSession": true,
    "headless": {
      "enabled": true,
      "uiTestPath": "e2e/auth.spec.ts"
    }
  }
}
```

**Example: Supabase OTP with CLI headless auth:**

```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "skill": "auth-supabase-otp",
    "testUser": {
      "type": "fixed",
      "email": "test@example.com"
    },
    "routes": {
      "login": "/login",
      "verify": "/verify",
      "authenticated": "/dashboard"
    },
    "reuseSession": true,
    "headless": {
      "enabled": true,
      "method": "cli",
      "command": "pnpm cli auth:test-token --email $TEST_EMAIL",
      "responseFormat": "json",
      "tokenPath": "accessToken",
      "refreshTokenPath": "refreshToken",
      "sessionStorage": "localStorage"
    },
    "acquisition": {
      "description": "Use CLI to generate a test token via Supabase admin API",
      "steps": [
        "1. Ensure SUPABASE_SERVICE_ROLE_KEY is set in .env.local",
        "2. Run: pnpm cli auth:test-token --email $TEST_EMAIL",
        "3. Parse JSON output for accessToken and refreshToken",
        "4. Inject tokens into browser localStorage",
        "5. Navigate to /dashboard — session should be active"
      ],
      "fallbackToUI": true,
      "notes": "CLI requires service role key. Tokens expire after 1 hour."
    }
  }
}
```

**Example: NextAuth credentials with dynamic users:**

```json
{
  "authentication": {
    "method": "email-password",
    "provider": "nextauth",
    "skill": "auth-nextauth-credentials",
    "testUser": {
      "type": "dynamic",
      "emailPattern": "test-{uuid}@example.com"
    },
    "routes": {
      "login": "/auth/signin",
      "authenticated": "/dashboard"
    },
    "reuseSession": false,
    "cleanup": {
      "enabled": true,
      "trigger": "auto",
      "emailPattern": "^test-.*@example\\.com$",
      "maxAgeHours": 24
    }
  }
}
```

---

## Step 10: Confirm and Write

Show the user the final configuration:

```
═══════════════════════════════════════════════════════════════════════
                    CONFIGURATION SUMMARY
═══════════════════════════════════════════════════════════════════════

Here's your authentication configuration:

{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "skill": "auth-supabase-otp",
    "testUser": {
      "type": "fixed",
      "email": "test@example.com"
    },
    ...
  }
}

This will be added to: docs/project.json

Proceed? (Y/n)

> _
═══════════════════════════════════════════════════════════════════════
```

**Write the configuration:**

1. Read current `docs/project.json`
2. Add/replace the `authentication` section
3. Write back to file
4. Confirm: "Authentication configured in docs/project.json"

---

## Step 11: Validate Configuration

Attempt a test login to validate the configuration works:

```
═══════════════════════════════════════════════════════════════════════
                    VALIDATION
═══════════════════════════════════════════════════════════════════════

Testing authentication configuration...

  [1/4] Starting dev server... ✓
  [2/4] Navigating to /login... ✓
  [3/4] Entering test user email... ✓
  [4/4] Retrieving OTP and verifying... ✓

✅ Authentication working! Landed on /dashboard

Your auth configuration is ready. AI agents (Screenshot, E2E, QA) 
can now authenticate with your application.

═══════════════════════════════════════════════════════════════════════
```

**If validation fails:**

```
═══════════════════════════════════════════════════════════════════════
                    VALIDATION FAILED
═══════════════════════════════════════════════════════════════════════

❌ Authentication test failed at step 3:

  Error: Could not find email input with selector 'input[name="email"]'

Options:
  1. Update selectors in configuration
  2. Skip validation (configure manually later)
  3. Abort and remove configuration

> _
═══════════════════════════════════════════════════════════════════════
```

---

## Skill Derivation Rules

When `skill` is not specified, derive from method + provider:

| Method | Provider | Skill |
|--------|----------|-------|
| `passwordless-otp` | `supabase` | `auth-supabase-otp` |
| `email-password` | `supabase` | `auth-supabase-password` |
| `email-password` | `nextauth` | `auth-nextauth-credentials` |
| `oauth` | any | `auth-generic` (limited) |
| any | `custom` | `auth-generic` |

---

## Environment Variables

Remind user about required environment variables:

**Supabase:**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # For OTP retrieval (server-side only)
```

**NextAuth:**
```
NEXTAUTH_SECRET=...
# Plus any provider-specific credentials
```

**Test user password (if email-password):**
```
TEST_USER_PASSWORD=...  # Keep in .env.local, never commit
```

---

## Quick Reference

**Invoke this skill:**
```
/setup-auth
```

**Manual configuration (skip wizard):**
Add directly to `docs/project.json`:

```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "testUser": {
      "type": "fixed",
      "email": "test@example.com"
    },
    "routes": {
      "login": "/login",
      "verify": "/verify", 
      "authenticated": "/dashboard"
    }
  }
}
```

**Related skills:**
- `auth-supabase-otp` — Supabase OTP login implementation
- `auth-supabase-password` — Supabase password login implementation
- `auth-nextauth-credentials` — NextAuth credentials implementation
- `auth-generic` — Generic/custom auth implementation
- `auth-headless` — Headless auth session injection (includes CLI method)
- `auth-config-check` — Validates auth configuration including acquisition block
- `test-user-cleanup` — Test user cleanup implementation
