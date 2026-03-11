# Authentication Configuration

This document explains how to configure authentication for AI agents (Builder, Tester, Screenshot, QA) to log into your application during testing.

## Quick Start

Add an `authentication` section to your `docs/project.json`:

```json
{
  "authentication": {
    "method": "email-password",
    "provider": "supabase",
    "testUser": {
      "mode": "fixed",
      "emailVar": "TEST_EMAIL",
      "passwordVar": "TEST_PASSWORD"
    },
    "routes": {
      "login": "/login",
      "authenticated": "/dashboard"
    }
  }
}
```

Then set environment variables in `.env.local`:

```bash
TEST_EMAIL=test@example.com
TEST_PASSWORD=your-test-password
```

## Configuration Reference

### `method` (required)

The authentication method your app uses:

| Value | Description |
|-------|-------------|
| `passwordless-otp` | Email + one-time code (Supabase magic link, etc.) |
| `email-password` | Traditional email + password login |
| `magic-link` | Email link authentication |
| `oauth` | OAuth providers (Google, GitHub, etc.) — *deferred* |
| `none` | No authentication required |

### `provider` (required)

The authentication provider:

| Value | Description | Skills |
|-------|-------------|--------|
| `supabase` | Supabase Auth | `auth-supabase-otp`, `auth-supabase-password` |
| `nextauth` | NextAuth.js | `auth-nextauth-credentials` |
| `clerk` | Clerk | *planned* |
| `auth0` | Auth0 | *planned* |
| `custom` | Custom auth system | `auth-generic` |

### `testUser` (required)

Test user configuration:

```json
{
  "testUser": {
    "mode": "fixed",
    "emailVar": "TEST_EMAIL",
    "emailDefault": "test@example.com",
    "passwordVar": "TEST_PASSWORD",
    "passwordDefault": null
  }
}
```

| Field | Description |
|-------|-------------|
| `mode` | `"fixed"` (use same user) or `"dynamic"` (create new users) |
| `emailVar` | Environment variable name for test email |
| `emailDefault` | Fallback email if env var not set |
| `emailPattern` | Pattern for dynamic emails: `"test-{uuid}@example.com"` |
| `passwordVar` | Environment variable name for password |
| `passwordDefault` | Fallback password (avoid for security) |

#### Fixed vs Dynamic Mode

**Fixed mode** (`mode: "fixed"`):
- Uses the same test user for all tests
- User must already exist in the database
- Simpler setup, but tests share state

**Dynamic mode** (`mode: "dynamic"`):
- Creates a new user for each test run
- Uses `emailPattern` with `{uuid}` placeholder
- Better test isolation, but requires user creation permissions

### `verification` (for OTP methods)

How to retrieve verification codes:

```json
{
  "verification": {
    "source": "supabase",
    "table": "users",
    "column": "verification_code",
    "lookupBy": "email"
  }
}
```

| Field | Description |
|-------|-------------|
| `source` | `"supabase"`, `"database"`, or `"api"` |
| `table` | Database table containing codes |
| `column` | Column with the verification code |
| `lookupBy` | Column to match (usually `"email"`) |

### `routes` (recommended)

Application routes for authentication:

```json
{
  "routes": {
    "login": "/login",
    "verify": "/verify",
    "authenticated": "/dashboard"
  }
}
```

| Field | Description |
|-------|-------------|
| `login` | Login page URL |
| `verify` | OTP/code verification page (for passwordless) |
| `authenticated` | Page to expect after successful login |

### `selectors` (optional)

Custom CSS selectors if your app uses non-standard form elements:

```json
{
  "selectors": {
    "emailInput": "input#login-email",
    "passwordInput": "input#login-password",
    "submitButton": "button.login-btn",
    "otpInputs": "input.otp-digit",
    "verifyButton": "button.verify-btn"
  }
}
```

Default selectors work for most apps. Only configure if needed.

### `headless` (optional)

Enable headless authentication for faster tests:

```json
{
  "headless": {
    "enabled": true,
    "method": "supabase-admin",
    "sessionStorage": "cookies"
  }
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Enable headless auth (direct API, no UI clicks) |
| `method` | `"supabase-admin"`, `"nextauth-direct"`, or `"custom-api"` |
| `sessionStorage` | `"cookies"`, `"localStorage"`, or `"both"` |

Headless auth is ~10x faster but bypasses the login UI. Keep one test that uses UI auth for coverage.

### `cleanup` (optional)

Test user cleanup configuration:

```json
{
  "cleanup": {
    "enabled": true,
    "trigger": "auto",
    "pattern": "test-*@example.com",
    "maxAgeHours": 24,
    "safetyChecks": {
      "requireTestEmailPattern": true,
      "blockProduction": true
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Enable automatic cleanup |
| `trigger` | `"manual"`, `"auto"` (after tests), or `"scheduled"` (cron) |
| `pattern` | Email pattern to identify test users |
| `maxAgeHours` | Only delete users older than this |
| `safetyChecks` | Safety guards to prevent accidents |

### `reuseSession` (optional)

Save and reuse auth state across tests:

```json
{
  "reuseSession": true
}
```

When enabled:
- First test authenticates and saves state to `.tmp/auth-state.json`
- Subsequent tests load state instead of re-authenticating
- State is cleared at the start of each test run

Combine with headless auth for maximum speed.

## Provider Examples

### Supabase Passwordless OTP

```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "testUser": {
      "mode": "fixed",
      "emailVar": "TEST_EMAIL",
      "emailDefault": "test@example.com"
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

Required environment variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TEST_EMAIL=test@example.com
```

### Supabase Email/Password

```json
{
  "authentication": {
    "method": "email-password",
    "provider": "supabase",
    "testUser": {
      "mode": "fixed",
      "emailVar": "TEST_EMAIL",
      "passwordVar": "TEST_PASSWORD"
    },
    "routes": {
      "login": "/login",
      "authenticated": "/dashboard"
    }
  }
}
```

Required environment variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
TEST_EMAIL=test@example.com
TEST_PASSWORD=your-password
```

### NextAuth Credentials

```json
{
  "authentication": {
    "method": "email-password",
    "provider": "nextauth",
    "testUser": {
      "mode": "fixed",
      "emailVar": "TEST_EMAIL",
      "passwordVar": "TEST_PASSWORD"
    },
    "routes": {
      "login": "/auth/signin",
      "authenticated": "/dashboard"
    }
  }
}
```

Required environment variables:
```bash
TEST_EMAIL=test@example.com
TEST_PASSWORD=your-password
```

### Custom Auth System

```json
{
  "authentication": {
    "method": "email-password",
    "provider": "custom",
    "testUser": {
      "mode": "fixed",
      "emailVar": "TEST_EMAIL",
      "passwordVar": "TEST_PASSWORD"
    },
    "routes": {
      "login": "/login",
      "authenticated": "/app"
    },
    "selectors": {
      "emailInput": "input[data-testid='email']",
      "passwordInput": "input[data-testid='password']",
      "submitButton": "button[data-testid='login-btn']"
    }
  }
}
```

## Headless Authentication

Headless auth uses direct API calls instead of clicking through the UI. This is ~10x faster but bypasses UI testing.

### Recommended Pattern

1. Enable headless for all tests except one
2. Keep one `@ui-auth-test` that exercises the actual login UI
3. All other tests use headless auth

```json
{
  "authentication": {
    "method": "email-password",
    "provider": "supabase",
    "headless": {
      "enabled": true,
      "method": "supabase-admin"
    }
  }
}
```

### Performance Comparison

| Approach | Time per test | 100 tests |
|----------|---------------|-----------|
| UI login every test | ~3-5 seconds | 300-500s |
| Headless auth | ~0.1-0.3 seconds | 10-30s |
| Session reuse | ~0 seconds | ~0s |

## Test User Cleanup

Dynamic test users should be cleaned up to avoid database pollution.

### Manual Cleanup

Run when you want:
```bash
npx tsx scripts/cleanup-test-users.ts
```

### Auto Cleanup

Runs after each test suite:
```json
{
  "cleanup": {
    "trigger": "auto"
  }
}
```

### Scheduled Cleanup

Runs on a schedule (e.g., nightly cron job):
```json
{
  "cleanup": {
    "trigger": "scheduled"
  }
}
```

### Safety Checks

Cleanup includes safety guards:
- Never runs in production (`NODE_ENV=production`)
- Only deletes emails matching the test pattern
- Preserves recently created users (in case tests are still running)

## Setup Command

Run `/setup-auth` to interactively configure authentication:

1. Scans your codebase for auth patterns
2. Detects provider (Supabase, NextAuth, etc.)
3. Walks through configuration options
4. Writes the `authentication` block to `project.json`
5. Validates by attempting a test login

## Troubleshooting

### "No authentication config found"

Run `/setup-auth` or manually add the `authentication` section to `docs/project.json`.

### "Missing env vars"

Ensure `.env.local` contains the required variables for your provider.

### "Failed to get verification code"

For OTP methods:
- Check that the test user exists in the database
- Verify the `verification` config matches your schema
- Ensure the service role key has read access to the table

### "Invalid credentials"

For password methods:
- Verify the test user exists
- Check the password is correct
- Ensure the email is verified (if required by your app)

### "Timeout waiting for authenticated page"

- Check `routes.authenticated` matches your actual redirect URL
- Verify the dev server is running
- Check for JavaScript errors in browser console

### Tests are slow

- Enable headless authentication
- Enable session reuse
- Combine both for maximum speed

## Skills Reference

| Skill | Description |
|-------|-------------|
| `auth-supabase-otp` | Supabase passwordless OTP flow |
| `auth-supabase-password` | Supabase email/password flow |
| `auth-nextauth-credentials` | NextAuth credentials provider |
| `auth-generic` | Generic form-based authentication |
| `auth-headless` | Direct API authentication |
| `test-user-cleanup` | Clean up test users |
| `setup-auth` | Interactive auth configuration |

## Related Agents

| Agent | How it uses auth |
|-------|------------------|
| `screenshot` | Authenticates before capturing protected pages |
| `e2e-playwright` | Uses auth for E2E tests |
| `qa-browser-tester` | Authenticates before page inspection |
| `builder` | Prompts for auth setup if missing |
