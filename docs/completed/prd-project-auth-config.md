# PRD: Project Authentication Configuration

## Introduction

Define a standard way for AI agents (Builder, Tester, Screenshot, QA) to authenticate with project applications during testing and verification. Currently, each agent improvises authentication logic, leading to inconsistent implementations and duplicated code. This PRD establishes:

1. A schema extension for `project.json` to declare authentication configuration
2. Reusable toolkit skills for common auth patterns (Supabase OTP, NextAuth, etc.)
3. A `/setup-auth` command that detects auth patterns and guides configuration
4. Standard patterns for test user creation, verification code retrieval, and cleanup

## Goals

- Provide a single source of truth for how to authenticate with a project
- Support multiple authentication methods (passwordless OTP, email/password, OAuth)
- Detect auth patterns from codebase to minimize manual configuration
- Enable both fixed test users and dynamically-created test users
- Support headless auth for faster tests (with one UI test for coverage)
- Define test user cleanup patterns to avoid polluting databases
- Make authentication "just work" for any agent that needs it
- Reduce duplicated Playwright login code across agents and skills

## User Stories

### US-001: Add authentication schema to project.json

**Description:** As a toolkit maintainer, I need to define the authentication schema so projects can declare their auth configuration in a standard format.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Add `authentication` section to `schemas/project.schema.json`
- [ ] Schema supports: `method`, `provider`, `skill`, `testUser`, `verification`, `routes`
- [ ] Schema supports: `reuseSession`, `headless`, `cleanup` (with trigger option)
- [ ] Schema validates `method` enum: `passwordless-otp`, `email-password`, `oauth`, `none`
- [ ] Schema validates `provider` enum: `supabase`, `nextauth`, `clerk`, `auth0`, `custom`
- [ ] Schema validates `cleanup.trigger` enum: `manual`, `auto`, `scheduled`
- [ ] Include JSON Schema descriptions for each field
- [ ] Typecheck passes (if applicable)

---

### US-002: Create auth-supabase-otp skill

**Description:** As an agent needing authentication, I want a reusable skill for Supabase passwordless OTP so I don't have to write login code from scratch.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/auth-supabase-otp/SKILL.md`
- [ ] Skill reads configuration from `project.json` authentication section
- [ ] Provides Playwright code for: navigate to login, enter email, submit, wait for verify page
- [ ] Provides Playwright code for: fetch OTP from Supabase, enter code, submit, wait for authenticated page
- [ ] Supports both fixed test user mode and dynamic user mode
- [ ] Dynamic mode: generates random email, creates user record if needed
- [ ] Includes helper function to get Supabase service client
- [ ] Documents required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

### US-003: Create auth-supabase-password skill

**Description:** As an agent needing authentication, I want a reusable skill for Supabase email/password auth.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/auth-supabase-password/SKILL.md`
- [ ] Skill reads configuration from `project.json` authentication section
- [ ] Provides Playwright code for: navigate to login, enter email, enter password, submit
- [ ] Supports fixed test user with password from env var
- [ ] Supports dynamic user creation with known password
- [ ] Documents required env vars

---

### US-004: Create auth-nextauth-credentials skill

**Description:** As an agent needing authentication, I want a reusable skill for NextAuth credentials provider.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/auth-nextauth-credentials/SKILL.md`
- [ ] Skill reads configuration from `project.json` authentication section
- [ ] Provides Playwright code for NextAuth credentials login flow
- [ ] Documents database/adapter requirements for test user setup

---

### US-005: Create auth-generic skill (fallback)

**Description:** As an agent needing authentication, I want a generic auth skill that works with any custom auth system using project.json config.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/auth-generic/SKILL.md`
- [ ] Reads all config from `project.json` authentication section
- [ ] Provides configurable selectors: email input, password input, submit button, OTP inputs
- [ ] Works for any auth system that follows standard form patterns
- [ ] Documents how to configure custom selectors in project.json

---

### US-006: Create test-user-cleanup skill

**Description:** As a test runner, I want a standard way to clean up test users after E2E runs so test data doesn't pollute the database.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/test-user-cleanup/SKILL.md`
- [ ] Provides patterns for identifying test users (email pattern, created_at threshold, flag column)
- [ ] Supports Supabase cleanup via service role
- [ ] Supports generic SQL cleanup pattern
- [ ] Supports all three trigger modes: manual (script), auto (test teardown), scheduled (cron)
- [ ] Documents safety guards (never delete in production, confirm test email pattern)

---

### US-007: Create auth-headless skill

**Description:** As an E2E test, I want to authenticate via direct API calls and cookie injection so tests run faster without clicking through login UI.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/auth-headless/SKILL.md`
- [ ] Reads `authentication.headless` config from project.json
- [ ] Provides code to authenticate via Supabase API (signInWithOtp + admin confirm)
- [ ] Injects auth cookies/tokens into Playwright browser context
- [ ] Documents how to identify the one UI test that should NOT use headless
- [ ] Includes performance comparison guidance (expected speedup)

---

### US-008: Update screenshot skill to use auth configuration

**Description:** As the screenshot skill, I should read project.json auth config and delegate to the appropriate auth skill instead of having hardcoded login logic.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Screenshot skill checks `project.json` for `authentication.skill`
- [ ] If present, loads and follows that skill for authentication
- [ ] If `authentication.method` is `none`, skips authentication
- [ ] Falls back to existing behavior if no auth config present (backward compatible)
- [ ] Remove hardcoded Supabase OTP logic from screenshot skill

---

### US-009: Update E2E testing agents to use auth configuration

**Description:** As E2E testing agents (e2e-playwright, qa-browser-tester), I should use the standard auth configuration for logging in during tests.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] e2e-playwright agent checks `project.json` for auth config
- [ ] qa-browser-tester agent checks `project.json` for auth config
- [ ] Both delegate to the configured auth skill
- [ ] Tests can request "authenticated context" without knowing auth details

---

### US-010: Document authentication configuration in toolkit README

**Description:** As a project maintainer, I want documentation on how to configure authentication so my agents can log in correctly.

**Documentation:** Yes (update: toolkit README or new auth-config.md)

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Document the `authentication` schema section
- [ ] Provide examples for each supported provider
- [ ] Explain fixed vs dynamic test user modes
- [ ] Explain headless vs UI-based auth modes
- [ ] Document cleanup configuration and trigger options
- [ ] Include troubleshooting section

---

### US-011: Add session reuse support to auth skills

**Description:** As a test runner, I want to optionally save and reuse auth state across tests in the same run so tests execute faster.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Auth skills check `authentication.reuseSession` flag
- [ ] If true, save auth state to `.tmp/auth-state.json` after first login
- [ ] Subsequent tests load state instead of re-authenticating
- [ ] State file is cleared at start of each test run
- [ ] Document interaction with headless mode (can combine both)

---

### US-012: Create setup-auth skill for explicit auth configuration

**Description:** As a project maintainer, I want a `/setup-auth` command that walks me through full authentication configuration with explanations and options.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/setup-auth/SKILL.md`
- [ ] Skill scans codebase for auth clues (`@supabase/supabase-js`, `next-auth`, etc.)
- [ ] Presents detected provider with confirmation: "I found Supabase in your dependencies. Is this your auth provider? (Y/n)"
- [ ] Walks through all configuration options with explanations
- [ ] Writes complete `authentication` block to `project.json`
- [ ] Validates configuration by attempting a test login
- [ ] Skill can be invoked via `/setup-auth` command

---

### US-013: Add inline auth setup flow to Builder

**Description:** As Builder, when I encounter an auth-dependent task but no `authentication` config exists, I should detect auth patterns and prompt the user to configure before proceeding.

**Documentation:** No

**Tools:** No

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder checks for `authentication` in `project.json` before auth-dependent tasks
- [ ] If missing, scan for auth clues in `package.json` dependencies
- [ ] Present findings: "I detected Supabase. Please run `/setup-auth` or configure `authentication` in project.json before I can proceed."
- [ ] Do NOT proceed with auth-dependent tasks until config exists
- [ ] Provide quick-start example config in the message for copy/paste

---

## Functional Requirements

- FR-1: `project.json` MUST support an `authentication` object with standardized fields
- FR-2: Authentication skills MUST read configuration from `project.json`, not hardcode values
- FR-3: Skills MUST support both fixed test user and dynamic test user modes
- FR-4: Dynamic mode MUST generate unique emails (e.g., `test-{uuid}@example.com`)
- FR-5: Verification code retrieval MUST use service role / admin credentials (never exposed to browser)
- FR-6: Cleanup patterns MUST include safety guards against production deletion
- FR-7: Agents MUST require `authentication` config before running auth-dependent tasks (no silent guessing)
- FR-8: Headless auth MUST be opt-in and projects MUST maintain at least one UI-based auth test
- FR-9: Session reuse MUST clear state at start of each test run to avoid stale sessions
- FR-10: Setup skill MUST scan codebase for auth clues before asking questions
- FR-11: Setup skill MUST confirm detected patterns with user before writing config

## Non-Goals

- No support for 2FA/MFA beyond OTP email codes (can be added later)
- No support for SSO/SAML enterprise authentication
- No support for OAuth flows (deferred until a project needs it)
- No fully automatic configuration (detection requires user confirmation)
- No inline auth setup during tasks (must run `/setup-auth` first)

## Default Values

When setup-auth runs, these defaults are used unless the user specifies otherwise:

| Field | Default | Rationale |
|-------|---------|-----------|
| `testUser.mode` | `"fixed"` | Simpler, less cleanup needed |
| `testUser.emailVar` | `"TEST_EMAIL"` | Common convention |
| `testUser.emailDefault` | `"test@example.com"` | Safe placeholder |
| `routes.login` | `"/login"` | Very common |
| `routes.verify` | `"/verify"` | Common for OTP flows |
| `routes.authenticated` | `"/dashboard"` | Common landing page |
| `reuseSession` | `false` | Safer default, fresh auth each time |
| `headless.enabled` | `false` | UI-based is more thorough |
| `cleanup.enabled` | `false` | Opt-in to avoid accidents |
| `cleanup.trigger` | `"manual"` | Safest default |

**No defaults for:** `method`, `provider` — these must be detected or asked.

## Technical Considerations

### Schema Location

Add to `schemas/project.schema.json`:

```json
{
  "authentication": {
    "type": "object",
    "properties": {
      "method": {
        "type": "string",
        "enum": ["passwordless-otp", "email-password", "oauth", "none"],
        "description": "Authentication method used by this project"
      },
      "provider": {
        "type": "string", 
        "enum": ["supabase", "nextauth", "clerk", "auth0", "custom"],
        "description": "Authentication provider/library"
      },
      "skill": {
        "type": "string",
        "description": "Name of the auth skill to use (e.g., 'auth-supabase-otp')"
      },
      "testUser": {
        "type": "object",
        "properties": {
          "mode": {
            "type": "string",
            "enum": ["fixed", "dynamic"],
            "description": "Whether to use a fixed test user or create new ones"
          },
          "emailVar": {
            "type": "string",
            "description": "Environment variable containing test email"
          },
          "emailDefault": {
            "type": "string",
            "description": "Default test email if env var not set"
          },
          "emailPattern": {
            "type": "string",
            "description": "Pattern for dynamic emails (e.g., 'test-{uuid}@example.com')"
          },
          "passwordVar": {
            "type": "string",
            "description": "Environment variable containing test password (for email-password method)"
          }
        }
      },
      "verification": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string",
            "description": "Where to get verification codes (e.g., 'supabase')"
          },
          "table": {
            "type": "string",
            "description": "Database table containing verification codes"
          },
          "column": {
            "type": "string", 
            "description": "Column containing the verification code"
          },
          "lookupBy": {
            "type": "string",
            "description": "Column to look up user by (e.g., 'email')"
          }
        }
      },
      "routes": {
        "type": "object",
        "properties": {
          "login": { "type": "string", "description": "Login page path" },
          "verify": { "type": "string", "description": "Verification page path (for OTP)" },
          "authenticated": { "type": "string", "description": "Page to land on after auth" }
        }
      },
      "cleanup": {
        "type": "object",
        "properties": {
          "enabled": { "type": "boolean" },
          "trigger": {
            "type": "string",
            "enum": ["manual", "auto", "scheduled"],
            "description": "When to run cleanup: manual (script), auto (test teardown), scheduled (cron)"
          },
          "emailPattern": { 
            "type": "string",
            "description": "Regex pattern identifying test users (e.g., '^test-.*@example\\.com$')"
          },
          "maxAgeHours": {
            "type": "number",
            "description": "Delete test users older than this many hours"
          }
        }
      },
      "reuseSession": {
        "type": "boolean",
        "default": false,
        "description": "Save auth state to file and reuse across tests in same run"
      },
      "headless": {
        "type": "object",
        "description": "Headless auth configuration (skip UI, inject session directly)",
        "properties": {
          "enabled": {
            "type": "boolean",
            "default": false,
            "description": "Enable headless auth for faster tests"
          },
          "uiTestPath": {
            "type": "string",
            "description": "Path to the one E2E test that exercises full login UI (e.g., 'e2e/auth.spec.ts')"
          }
        }
      },
      "selectors": {
        "type": "object",
        "description": "Custom CSS selectors for auth forms (for custom/generic provider)",
        "properties": {
          "emailInput": { "type": "string" },
          "passwordInput": { "type": "string" },
          "submitButton": { "type": "string" },
          "otpInputs": { "type": "string" },
          "verifyButton": { "type": "string" }
        }
      },
      "tenant": {
        "type": "object",
        "description": "Multi-tenant configuration",
        "properties": {
          "identifier": { "type": "string", "description": "Test tenant ID or subdomain" },
          "loginUrlPattern": { "type": "string", "description": "URL pattern with {tenant} placeholder" }
        }
      }
    }
  }
}
```

### Example project.json Configurations

**Supabase Passwordless OTP (fixed user):**
```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "skill": "auth-supabase-otp",
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

**Supabase Passwordless OTP (dynamic users with cleanup):**
```json
{
  "authentication": {
    "method": "passwordless-otp",
    "provider": "supabase",
    "skill": "auth-supabase-otp",
    "testUser": {
      "mode": "dynamic",
      "emailPattern": "test-{uuid}@testmail.example.com"
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
    },
    "cleanup": {
      "enabled": true,
      "emailPattern": "^test-.*@testmail\\.example\\.com$",
      "maxAgeHours": 24
    }
  }
}
```

### Skill Directory Structure

```
skills/
├── auth-supabase-otp/
│   └── SKILL.md
├── auth-supabase-password/
│   └── SKILL.md
├── auth-nextauth-credentials/
│   └── SKILL.md
├── auth-generic/
│   └── SKILL.md
├── auth-headless/
│   └── SKILL.md
├── test-user-cleanup/
│   └── SKILL.md
└── setup-auth/
    └── SKILL.md
```

### Auth Provider Detection Patterns

The `setup-auth` skill scans for these patterns to detect the auth provider:

| Provider | Detection Pattern |
|----------|-------------------|
| Supabase | `@supabase/supabase-js` in package.json, or `createClient` imports from supabase |
| NextAuth | `next-auth` in package.json, or `[...nextauth]` route file |
| Clerk | `@clerk/nextjs` in package.json |
| Auth0 | `@auth0/nextjs-auth0` in package.json |

**Method detection** (after provider is confirmed):

| Method | Detection Pattern |
|--------|-------------------|
| Passwordless OTP | `/verify` route exists, OTP input components, `signInWithOtp` calls |
| Email/Password | Password input on login page, `signInWithPassword` calls |
| OAuth | OAuth provider config, social login buttons |

**Confirmation flow:**
```
🔍 Scanning project for authentication patterns...

Detected:
  • Provider: Supabase (@supabase/supabase-js found in package.json)
  • Method: Passwordless OTP (/verify route found, signInWithOtp in auth code)

Is this correct? (Y/n): _
```

## Success Metrics

- Agents can authenticate with zero project-specific code
- New projects can configure auth in under 5 minutes
- Screenshot skill works correctly with auth config in all existing projects
- Test user cleanup runs without deleting real users
- No duplicate login code across agents

## Resolved Questions

1. **Session/cookie persistence?** → **Configurable** — Projects can set `authentication.reuseSession: true` to save auth state and reuse across tests in the same run. Default is `false` (fresh auth each time).

2. **OAuth mock provider?** → **Deferred** — No current projects use OAuth. Will add OAuth skills when needed.

3. **Cleanup trigger?** → **Configurable** — Projects choose via `cleanup.trigger`: `manual` (run script when needed), `auto` (hook into test runner teardown), or `scheduled` (cron/CI job).

4. **Headless auth mode?** → **Hybrid** — One E2E test exercises the full login UI to catch UI bugs. All other tests use headless auth (direct API + cookie injection) for speed. Configurable via `authentication.headless.enabled: true`.

## Open Questions

None — all questions resolved.

## Credential & Service Access Plan

No external credentials required for this PRD — the toolkit itself doesn't need credentials. Individual projects will need their own service role keys as documented in each auth skill.
