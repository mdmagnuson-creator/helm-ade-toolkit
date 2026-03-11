---
id: prd-architecture-aware-verification
title: Architecture-Aware Verification & Auth Acquisition
status: complete
priority: high
createdAt: 2026-03-05T16:00:00Z
supersedes: pending-updates/2026-03-05-builder-post-change-workflow.md
---

# PRD: Architecture-Aware Verification & Auth Acquisition

## Problem Statement

Builder commits code changes without verifying they work in the actual running application. This manifests in two related gaps:

### Gap 1: No Architecture-Aware Rebuild Step

Builder's quality checks pipeline (typecheck → lint → unit tests → critic → UI verification) has **no architecture-aware rebuild step**. For desktop/Electron apps, code changes don't appear until the app is rebuilt and relaunched — but Builder skips this entirely.

**Real incident:** Builder committed a subtitle copy change (`a793c0a`) to Helm ADE (an Electron-only project) without verifying the change inside the running Electron app. Builder attempted browser-based verification (`localhost:4005`) instead of launching Electron and connecting via Playwright-Electron. The user had to screenshot the unchanged UI to prove Builder hadn't verified. The root cause: no agent or skill reads `apps[]` to determine that desktop apps require Electron-based verification, not browser-based.

The schema already has the data to infer what's needed:
- `apps[].type: "desktop"` / `apps[].framework: "electron"`
- `apps[].webContent: "bundled"` / `"remote"` / `"hybrid"`
- `architecture.deployment: "electron-only"`
- `qualityGates.beforeCommit` (exists but unused by Builder)

But no agent or skill reads this data to inject rebuild/relaunch steps.

### Gap 2: No Auth Acquisition for Verification

Even if Builder rebuilds and relaunches, it can't verify authenticated UI without logging in. Many projects don't have `authentication` configured in project.json. Real-world projects often have **project-specific auth acquisition methods** that don't fit the existing auth skills — for example:

- CLI tools that generate test tokens via admin APIs
- Multi-step flows involving database queries followed by OTP entry
- Custom API endpoints that issue session tokens directly

The existing auth skills assume standard patterns (form fill, Supabase table query, NextAuth endpoint). There's no `cli` method for headless auth, and no way to document project-specific acquisition steps for agents to follow.

### Why These Are One PRD

The verification pipeline (rebuild → relaunch → verify) is useless if Playwright can't authenticate. Both gaps must be solved together for verification to actually work on real projects.

## Goals

1. **Builder auto-infers verification steps from app architecture** — desktop apps get rebuild+relaunch before verification, web apps use HMR/dev server
2. **Optional `postChangeWorkflow` override** — projects can customize the verification pipeline for unusual setups
3. **CLI-based headless auth** — structured `headless.method: "cli"` for automated token acquisition
4. **Agent-readable auth acquisition steps** — freeform `acquisition` section for agents to follow when the structured method fails or doesn't apply
5. **Cross-project rollout** — central registry update prompts Builder to actively configure every project: review setup, ask user questions, write auth and verification config

## Non-Goals

- Full `runWhen` condition engine (always/ui-change/backend-change) — over-engineering for now; all steps run on every change
- Process lifecycle management (start/stop long-running processes) — agents already handle this via `start-dev-server` skill
- Replacing existing auth skills — this extends them, doesn't replace
- Implementing postChangeWorkflow for every project type — auto-inference handles most cases; override is for edge cases

---

## Design

### Principle: Auto-Infer with Override

Most projects don't need to configure anything. Builder reads `apps[]` from project.json and generates the correct verification pipeline:

```
┌──────────────────────┐     ┌──────────────────────┐
│  project.json        │     │  Builder reads apps[] │
│  apps[].type         │ ──► │  and auto-generates   │
│  apps[].framework    │     │  verification steps   │
│  apps[].webContent   │     │                       │
└──────────────────────┘     └──────────┬───────────┘
                                        │
                              ┌─────────▼─────────┐
                              │  Has override?     │
                              │  postChangeWorkflow│
                              └────┬──────────┬────┘
                                   │          │
                                  NO         YES
                                   │          │
                              ┌────▼────┐ ┌───▼────┐
                              │  Use    │ │  Use   │
                              │  auto-  │ │ custom │
                              │ inferred│ │ steps  │
                              └─────────┘ └────────┘
```

### Auto-Inference Rules

| App Type | Framework | webContent | Verification Pipeline |
|----------|-----------|------------|----------------------|
| desktop | electron | bundled | typecheck → test → **build** → **relaunch Electron** → verify-with-playwright-electron |
| desktop | electron | remote | typecheck → test → **ensure Electron is running** → verify-with-playwright-electron (Vite HMR handles code changes, but Electron must be launched for Playwright to connect) |
| desktop | electron | hybrid | typecheck → test → **build** → **relaunch Electron** → verify-with-playwright-electron |
| web | any | n/a | typecheck → test → verify-with-playwright (dev server + HMR) |
| mobile | react-native | n/a | typecheck → test → (no automated UI verify yet) |

**Key insights:**

1. **`webContent: "bundled"` triggers a full rebuild.** The Electron app loads files from disk, so code changes require `build` → `relaunch Electron` before they're visible.
2. **`webContent: "remote"` does NOT need a rebuild, but Electron must still be running.** During development, the Electron shell points at a Vite dev server — HMR delivers code changes automatically. However, Playwright-Electron still needs to connect to the Electron process, so Builder must ensure it's launched (not just a browser tab on `localhost`).
3. **The Helm ADE incident was likely a `remote` case.** Builder tried browser-based verification (`localhost:4005`) instead of launching Electron. The fix isn't "rebuild before verify" — it's "verify inside Electron, not a browser." The auto-inference table above handles this: `remote` skips rebuild but still routes to `playwright-electron` (not `playwright-browser`).

### Override: postChangeWorkflow

For projects with unusual needs, `postChangeWorkflow` overrides auto-inference entirely:

```json
{
  "postChangeWorkflow": {
    "description": "Mandatory steps after code changes, before committing",
    "steps": [
      {
        "id": "typecheck",
        "name": "Typecheck",
        "command": "pnpm typecheck",
        "required": true
      },
      {
        "id": "build-desktop",
        "name": "Build desktop app",
        "command": "pnpm --filter desktop build",
        "required": true,
        "notes": "Electron app must be rebuilt for changes to be visible"
      },
      {
        "id": "relaunch-desktop",
        "name": "Relaunch desktop app",
        "command": "pnpm --filter desktop dev",
        "required": true,
        "type": "process",
        "notes": "Restart the Electron process so rebuilt code is loaded"
      },
      {
        "id": "verify-with-playwright",
        "name": "Verify change in running app",
        "required": true,
        "type": "playwright-check",
        "notes": "Use Playwright Electron to confirm change is visible"
      }
    ],
    "enforcement": {
      "beforeCommit": true,
      "skipConditions": [
        "docs-only changes (*.md files only)",
        "project.json or config-only changes",
        "test-only changes (*.test.ts, *.spec.ts, __tests__/)",
        "CI/build config changes (.github/, Dockerfile, docker-compose*)",
        "dependency lockfile-only changes (pnpm-lock.yaml, package-lock.json, yarn.lock)",
        "user explicitly says 'skip verification'"
      ]
    }
  }
}
```

**When `postChangeWorkflow` exists, Builder uses it verbatim.** Auto-inference is skipped.

### Auth Acquisition: Dual Approach

Both structured and freeform auth acquisition are supported:

> **Note:** The example below is illustrative — it shows the *type* of configuration Builder would generate per-project. Specific CLI commands, token paths, and acquisition steps are determined by Builder when it configures each project (via the cross-project rollout update).

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
    "routes": {
      "login": "/login",
      "verify": "/verify",
      "authenticated": "/dashboard"
    },
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
      "description": "How to get an authenticated session for this project",
      "steps": [
        "1. Ensure required env vars are set (e.g., service role keys)",
        "2. Run the CLI auth command specified in headless.command",
        "3. Parse the output (JSON/text/env) for access token",
        "4. Inject token into browser context (localStorage/cookies)",
        "5. Navigate to authenticated route — session should be active"
      ],
      "fallbackToUI": true,
      "notes": "If CLI fails, fall back to UI-based auth flow using the appropriate auth skill."
    }
  }
}
```

**When to use which:**

| Consumer | Uses |
|----------|------|
| Playwright fixtures (CI, automated tests) | `headless.method: "cli"` — fast, no browser |
| Builder verifying a change | `headless.method: "cli"` first, then `acquisition.steps` if CLI fails |
| Agent debugging auth issues | `acquisition.steps` — human-readable procedure |
| `setup-auth` wizard | Populates both during onboarding |
| New team member | `acquisition.description` + `steps` as documentation |

#### Headless CLI Method

New `method: "cli"` for `headless`:

```typescript
async function authenticateHeadlessCLI(
  context: BrowserContext,
  baseUrl: string,
  projectRoot: string
): Promise<HeadlessAuthResult> {
  const config = loadAuthConfig(projectRoot);
  const headless = config.headless!;
  const email = getTestEmail(config);

  // Expand env vars in command
  const command = headless.command
    .replace('$TEST_EMAIL', email)
    .replace('${TEST_EMAIL}', email);

  // Execute CLI command
  const { stdout, stderr, exitCode } = await exec(command, { cwd: projectRoot });

  if (exitCode !== 0) {
    return { success: false, email, error: `CLI failed: ${stderr}` };
  }

  // Parse response
  let tokens: Record<string, string>;
  switch (headless.responseFormat) {
    case 'json':
      tokens = JSON.parse(stdout);
      break;
    case 'text':
      tokens = { accessToken: stdout.trim() };
      break;
    case 'env':
      // Parse KEY=VALUE lines
      tokens = {};
      stdout.split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) tokens[k.trim()] = v.trim();
      });
      break;
  }

  const accessToken = getNestedValue(tokens, headless.tokenPath || 'accessToken');
  const refreshToken = headless.refreshTokenPath
    ? getNestedValue(tokens, headless.refreshTokenPath)
    : undefined;

  // Inject into browser context
  await injectSession(context, baseUrl, config, accessToken, refreshToken);

  return { success: true, email, accessToken };
}
```

#### Acquisition Steps for Agents

The `acquisition.steps` array is read by agents when they need to understand or troubleshoot the auth flow. Unlike `headless`, which is machine-executed, `acquisition` is agent-interpreted:

- Builder reads `acquisition.steps` to understand what's needed before delegating to Playwright
- If `headless.method: "cli"` fails, agents read `acquisition.steps` plus `acquisition.notes` for fallback guidance
- `setup-auth` wizard populates `acquisition` by asking the user "how does auth work for this project?"

---

## Schema Changes

### 1. Add `postChangeWorkflow` (optional override)

Add to `project.schema.json` at the top level:

```json
{
  "postChangeWorkflow": {
    "type": "object",
    "description": "Optional override: Mandatory steps Builder must complete after code changes, before committing. If absent, Builder auto-infers from apps[] configuration.",
    "properties": {
      "description": {
        "type": "string",
        "description": "Human-readable description of this workflow"
      },
      "steps": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "name", "required"],
          "properties": {
            "id": { "type": "string", "description": "Unique step identifier" },
            "name": { "type": "string", "description": "Human-readable step name" },
            "command": { "type": "string", "description": "Shell command to execute" },
            "required": { "type": "boolean", "description": "Whether this step must pass before commit" },
            "type": {
              "type": "string",
              "enum": ["command", "process", "playwright-check"],
              "default": "command",
              "description": "Step type: command (run+check exit), process (start long-running), playwright-check (browser verification)"
            },
            "notes": { "type": "string", "description": "Why this step exists / what it does" }
          }
        }
      },
      "enforcement": {
        "type": "object",
        "properties": {
          "beforeCommit": { "type": "boolean", "default": true },
          "skipConditions": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Human-readable conditions under which workflow can be skipped"
          }
        }
      }
    }
  }
}
```

### 2. Add `webContent` to apps[] (fill gap)

Already exists in schema but missing from Helm ADE's project.json. Prompt desktop projects to add it.

### 3. Add `headless.method: "cli"` and `acquisition`

Extend `authentication.headless`:

```json
{
  "headless": {
    "properties": {
      "method": {
        "type": "string",
        "enum": ["supabase-admin", "nextauth-direct", "custom-api", "cli"],
        "description": "How to acquire auth tokens headlessly"
      },
      "command": {
        "type": "string",
        "description": "CLI command to run (for method: cli). Supports $ENV_VAR expansion."
      },
      "responseFormat": {
        "type": "string",
        "enum": ["json", "text", "env"],
        "default": "json",
        "description": "Format of CLI command output"
      },
      "tokenPath": {
        "type": "string",
        "default": "accessToken",
        "description": "Dot-path to access token in response (for json format)"
      },
      "refreshTokenPath": {
        "type": "string",
        "description": "Dot-path to refresh token in response (optional)"
      },
      "sessionStorage": {
        "type": "string",
        "enum": ["cookies", "localStorage", "both"],
        "default": "cookies",
        "description": "Where to inject the token in browser context"
      }
    }
  }
}
```

Add new `acquisition` block to `authentication`:

```json
{
  "acquisition": {
    "type": "object",
    "description": "Human-readable auth acquisition procedure for agents. Read by agents when headless fails or for initial understanding.",
    "properties": {
      "description": {
        "type": "string",
        "description": "One-line summary of how auth works in this project"
      },
      "steps": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Ordered steps an agent should follow to get authenticated"
      },
      "fallbackToUI": {
        "type": "boolean",
        "default": true,
        "description": "If headless/CLI fails, fall back to UI-based auth flow"
      },
      "notes": {
        "type": "string",
        "description": "Additional context about the auth system (gotchas, requirements, etc.)"
      }
    }
  }
}
```

---

## Agent & Skill Changes

### 1. Builder: Architecture-Aware Verification Gate

Add to `builder.md` after the existing Analysis Gate:

**Verification Pipeline Resolution (MANDATORY before commit)**

```
Before committing, Builder MUST resolve the verification pipeline:

1. Check for postChangeWorkflow override in project.json
   - If present: execute steps in order, block commit on failure
   - If absent: continue to auto-inference

2. Auto-infer from apps[] configuration:
    - Read apps[].type, apps[].framework, apps[].webContent
    - Desktop + bundled/hybrid → inject rebuild + relaunch Electron before Playwright-Electron verify
    - Desktop + remote → skip rebuild (HMR via dev server), but ensure Electron is launched for Playwright-Electron (NOT browser-based verification)
    - Web → skip rebuild (dev server + HMR), use Playwright browser verification
    - No apps[] → fall back to existing quality checks (typecheck/lint/test)

3. Execute the resolved pipeline in order
   - Block commit if any required step fails
   - Fix and re-run from failed step

4. Skip conditions (auto-inferred or from override):
    - docs-only changes (*.md files only)
    - config-only changes (project.json, .env, etc.)
    - test-only changes (*.test.ts, *.spec.ts, __tests__/)
    - CI/build config changes (.github/, Dockerfile, docker-compose*)
    - dependency lockfile-only changes (pnpm-lock.yaml, package-lock.json, yarn.lock)
    - user explicitly says "skip verification"
```

### 2. `adhoc-workflow` Skill: Inject Rebuild Step

Update the quality checks section to include architecture-aware rebuild:

```
After typecheck/lint/unit tests, BEFORE UI verification:

1. Read apps[] from project.json
2. If any app has type: "desktop":
   a. If webContent: "bundled" or "hybrid":
      - Run the app's build command (from commands.build or apps[].commands.build)
      - Relaunch the app (kill existing process, start dev command)
      - Wait for app ready signal
   b. If webContent: "remote":
      - Ensure Electron process is running (launch if not)
      - No rebuild needed (HMR via dev server handles code changes)
   c. In ALL desktop cases: route to Playwright-Electron, NOT browser-based verification
3. Then proceed to UI verification (with correct Playwright variant)
```

### 3. `test-ui-verification` Skill: Add Rebuild to Strategy

Update `determineVerificationStrategy()`:

Current: desktop+bundled → "launch-app"
Updated:
- desktop+bundled/hybrid → "rebuild-then-launch-app" (build first, then launch Electron, then Playwright-Electron)
- desktop+remote → "ensure-electron-running" (skip rebuild, ensure Electron is launched, then Playwright-Electron)
- ALL desktop variants → use `playwright-electron`, never `playwright-browser`

The skill should:
1. Check `webContent` to decide if rebuild is needed
2. If bundled/hybrid: run build command, then launch Electron
3. If remote: ensure Electron is running (launch if not), skip rebuild
4. In all desktop cases: connect Playwright via Electron API, not browser URL

### 4. `test-quality-checks` Skill: Architecture-Aware Pipeline

Update activity execution order to include rebuild step between unit tests and UI verification for desktop apps.

### 5. `auth-headless` Skill: Add CLI Method

Add `cli` case to the `authenticateHeadless()` switch:

```typescript
case 'cli':
  return authenticateHeadlessCLI(context, baseUrl, projectRoot);
```

Include the full implementation from the Design section.

### 6. `auth-config-check` Skill: Check acquisition

Update the config check to also validate `acquisition` when present — ensure `steps` is non-empty and `description` exists.

### 7. `setup-auth` Skill: Populate Both Fields

Update the wizard to ask about CLI-based auth and populate both `headless` and `acquisition`:

```
Does this project have a CLI command for getting test auth tokens?
  A. Yes — I have a CLI that outputs tokens
  B. No — use standard auth flow

If A:
  What command? > pnpm cli auth:test-token --email $TEST_EMAIL
  Output format? > JSON / Plain text / KEY=VALUE
  Token field path? > accessToken
```

---

## Cross-Project Rollout

### Principle: Builder Actively Configures Every Project

The central registry update targets **all projects**, not just desktop/Electron ones. When Builder opens a project and sees this pending update, it:

1. **Reviews the project's current setup** — reads `apps[]`, `authentication`, existing config
2. **Asks the user targeted questions** — based on what's missing or ambiguous for that specific project
3. **Writes the configuration** — fills in `webContent`, `authentication`, `acquisition`, and optionally `postChangeWorkflow`

This is NOT informational. Builder doesn't say "no action needed for web projects." It actively ensures every project has proper auth acquisition configured, because verification is useless without authentication regardless of app type.

### Central Registry Update

Register in `data/update-registry.json`:

```json
{
  "id": "2026-03-05-architecture-aware-verification",
  "description": "Configure auth acquisition and app architecture settings for automated verification",
  "affinityRule": "all-projects",
  "priority": "high",
  "updateType": "schema",
  "interactive": true,
  "createdAt": "2026-03-05",
  "templatePath": "data/update-templates/2026-03-05-architecture-aware-verification.md"
}
```

### Update Template

The update template instructs Builder to review each project and configure it. Builder should:

**For every project:**

1. Review current `authentication` config — if missing or incomplete:
   - Ask: "How does authentication work for this project?"
   - Ask: "Is there a CLI command or API call that can generate test auth tokens?"
   - Ask: "What are the step-by-step instructions for getting an authenticated session?"
   - Populate `authentication.headless` and `authentication.acquisition` based on answers
   - Run `setup-auth` wizard if no auth config exists at all

2. Review `apps[]` configuration — for desktop/Electron apps:
   - Ask: "During development, does the Electron app load bundled files or connect to a dev server (like Vite)?"
   - Set `apps[].webContent` based on answer (`bundled`, `remote`, or `hybrid`)
   - Ask: "Does this project need any custom verification steps beyond what auto-inference provides?"
   - If yes, populate `postChangeWorkflow` override

3. Verify the result — run a quick sanity check:
   - `jq '.authentication.acquisition' docs/project.json` — should exist
   - `jq '.apps[].webContent' docs/project.json` — should exist for desktop apps
   - Report what was configured

---

## Stories

### Story 1: Schema Changes
**Files:** `schemas/project.schema.json`

- Add `postChangeWorkflow` as optional top-level property
- Add `headless.method: "cli"` and related fields to authentication.headless
- Add `authentication.acquisition` block
- Validate with existing schema tests

### Story 2: Builder Verification Pipeline
**Files:** `agents/builder.md`

- Add "Verification Pipeline Resolution" section after Analysis Gate
- Add auto-inference logic reading `apps[]` — handle bundled (rebuild+relaunch), remote (ensure Electron running), and hybrid (rebuild+relaunch)
- Critical: desktop apps ALWAYS use Playwright-Electron, never browser-based verification
- Add `postChangeWorkflow` override detection
- Add expanded skip conditions (docs, config, tests, CI, lockfiles, user override)
- Reference existing quality gate skills

### Story 3: Skill Updates — Verification
**Files:** `skills/adhoc-workflow/SKILL.md`, `skills/test-ui-verification/SKILL.md`, `skills/test-quality-checks/SKILL.md`

- Inject architecture-aware rebuild step into quality checks pipeline
- Update `determineVerificationStrategy()` to handle bundled (rebuild+launch), remote (ensure running), hybrid (rebuild+launch)
- Ensure ALL desktop verification routes through Playwright-Electron, never Playwright-browser
- Update activity execution order to include rebuild/ensure-running step between unit tests and UI verification

### Story 4: Skill Updates — Auth
**Files:** `skills/auth-headless/SKILL.md`, `skills/auth-config-check/SKILL.md`, `skills/setup-auth/SKILL.md`

- Add CLI method to auth-headless
- Update auth-config-check to validate acquisition
- Update setup-auth wizard to ask about CLI auth and populate acquisition

### Story 5: Central Registry + Update Template
**Files:** `data/update-registry.json`, `data/update-templates/2026-03-05-architecture-aware-verification.md`

- Create update template instructing Builder to actively configure each project
- Template must include questions for Builder to ask users (auth method, CLI availability, webContent, custom workflow needs)
- Register in update-registry.json with `affinityRule: "all-projects"` and `interactive: true`
- Builder writes config based on user answers — this is not informational

---

## Success Criteria

1. **Builder verifies Electron app changes inside Electron** — for bundled apps, must rebuild+relaunch; for remote apps, must ensure Electron is running (not use browser-based verification)
2. **Playwright can authenticate via CLI** — `headless.method: "cli"` works end-to-end for Helm ADE
3. **Agents can read acquisition steps** — when CLI fails, agents know the fallback procedure
4. **Web projects unaffected** — auto-inference correctly skips rebuild for web apps with HMR
5. **Existing auth skills still work** — CLI method is additive, not a replacement
6. **Cross-project update actively configures** — Builder reviews each project, asks user about auth and architecture, writes config (not just informational)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Build step is slow (30s+) for Electron | Builder feels slower | Skip for docs-only/config-only changes; only rebuild when code changes |
| CLI command doesn't exist yet in some projects | Auth fails | `acquisition.fallbackToUI: true` falls back to UI auth; agents read steps for manual guidance |
| `postChangeWorkflow` override conflicts with auto-inference | Confusing behavior | Override wins completely — no mixing. Document clearly. |
| Agent interprets acquisition steps wrong | Auth fails | Steps should be specific and testable. Include `notes` for gotchas. |

---

## Supersedes

This PRD supersedes the Builder pending update at:
`~/.config/opencode/pending-updates/2026-03-05-builder-post-change-workflow.md`

The pending update's `postChangeWorkflow` proposal is incorporated as the optional override mechanism (Story 1), while the primary fix is auto-inference from app architecture (Story 2). The auth acquisition gap (Stories 4-5) is additional scope not covered by the original pending update.
