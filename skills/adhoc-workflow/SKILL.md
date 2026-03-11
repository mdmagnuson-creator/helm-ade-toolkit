---
name: adhoc-workflow
description: "Ad-hoc mode workflow for Builder. Use when handling direct requests without a PRD, quick fixes, or one-off tasks. Triggers on: ad-hoc mode, quick fix, direct request, one-off task."
---

# Ad-hoc Workflow

> Load this skill when: handling direct requests without a PRD, ad-hoc mode, quick fixes, one-off tasks.

## Overview

Ad-hoc mode now includes a **mandatory Analysis Phase** that generates **Task Specs** — planning documents that mirror the PRD lifecycle while maintaining strict separation from Planner's domain.

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  PHASE 0: ANALYSIS  │ ──► │  PHASE 1: EXECUTE   │ ──► │   PHASE 2: SHIP     │
│                     │     │                     │     │                     │
│ Analyze request,    │     │ Implement stories,  │     │ Commit, merge,      │
│ generate Task Spec, │     │ auto quality        │     │ push to main        │
│ confirm with user   │     │ checks per task     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
        │                                                       ▲
        │                    [N] Next story ────────────────────┘
        │                    [C] Commit ─────────────────────────┘
        │
        └── [P] Promote to PRD (handoff to Planner)
```

## Context Loading (CRITICAL — Do This First)

> ⚠️ **Ad-hoc tasks fail when project context is missing or stale.**
>
> Before starting ANY ad-hoc work, verify these files exist and read them:
> 1. `docs/project.json` — stack, commands, capabilities
> 2. `docs/CONVENTIONS.md` — coding standards
>
> **Failure behavior:** If you cannot read these files, STOP and ask the user to verify the project path. Do not proceed with assumptions.
>
> Keep this context in memory and pass it to ALL sub-agents via context blocks.

**On entering ad-hoc mode:**

1. Read `docs/project.json` and note:
   - `stack` — framework/language
   - `commands` — test, lint, build commands
   - `styling` — CSS framework, dark mode
   - `testing` — test framework, patterns
   - `agents.prdRecommendationThreshold` — when to recommend PRD (default: `medium`)
   - `agents.analysisTimeoutMs` — analysis time limit (default: 10000)
   - `agents.taskSpecEnabled` — whether Task Specs are enabled (default: true)

2. Read `docs/CONVENTIONS.md` and prepare a 2-5 sentence summary of key patterns

3. Store this context for the session — you'll pass it to @developer, @tester, @critic

---

## User Summary Detection

> ⛔ **CRITICAL: User summaries accelerate analysis — they do NOT skip verification.**
>
> When a user provides context about what they changed or what the fix does, this is helpful input for analysis. It is NOT a substitute for:
> - Running tests
> - Browser verification (for UI/CORS/security changes)
> - Quality checks
>
> **Failure behavior:** If you treat a user summary as verification evidence, you are skipping mandatory checks.

### What User Summaries Are

User summaries are helpful context that can:

| Benefit | Example |
|---------|---------|
| Accelerate file discovery | "I changed the CORS config in `src/middleware/cors.ts`" |
| Clarify intent | "This fixes the 403 error on cross-origin requests" |
| Identify scope | "It's a one-line change to add the missing header" |
| Suggest verification approach | "You can test it by hitting the API from a different origin" |

### What User Summaries Are NOT

User summaries are NOT verification evidence. They cannot:

| NOT This | Why |
|----------|-----|
| Replace browser testing | User may not have tested all scenarios |
| Confirm CORS works | CORS is browser-enforced — user may have tested with curl |
| Prove security is correct | Security requires systematic verification |
| Skip E2E tests | User summary ≠ automated test passing |

### Correct Response to User Summaries

When user provides a summary like "I fixed the CORS issue by adding the header":

```
✅ CORRECT: 
"Thanks for the context! I'll use this to focus my analysis on the CORS 
middleware. Let me run browser verification to confirm the fix works 
across different origins."

❌ WRONG:
"Great, since you've confirmed the fix works, I'll just commit it."
```

### Detection Patterns

Watch for these patterns that indicate user-provided summaries:

| Pattern | Example | Your Response |
|---------|---------|---------------|
| "I fixed..." | "I fixed the CORS issue" | Acknowledge, then verify |
| "The change is..." | "The change is adding X-Custom-Header" | Acknowledge, then verify |
| "It works now" | "I tested it and it works" | Ask HOW they tested, then verify with Playwright |
| "Just need to commit" | "Can you just commit this?" | Verify first, then commit |

### CORS-Specific Warning

> ⚠️ **CORS is BROWSER-ENFORCED. curl/wget bypass CORS entirely.**
>
> If user says "I tested with curl and it works" — this is NOT CORS verification.
> CORS headers are only enforced by browsers. You MUST use Playwright to verify CORS fixes.

---

## Task Specs vs PRDs

Task Specs follow the **same lifecycle as PRDs** but in a parallel folder structure:

| Aspect | Task Spec (Builder) | PRD (Planner) |
|--------|---------------------|---------------|
| **Created by** | Builder | Planner |
| **Drafts location** | `docs/tasks/drafts/` | `docs/drafts/` |
| **Ready location** | `docs/tasks/` | `docs/prds/` |
| **Completed location** | `docs/tasks/completed/` | `docs/completed/` |
| **Abandoned location** | `docs/tasks/abandoned/` | `docs/abandoned/` |
| **Registry** | `docs/task-registry.json` | `docs/prd-registry.json` |
| **Story prefix** | `TSK-001`, `TSK-002`, etc. | `US-001`, `US-002`, etc. |
| **User involvement** | Confirm understanding | Multi-round refinement |

**Strict separation:**

| Agent | Owns | Never touches |
|-------|------|---------------|
| Builder | `docs/tasks/`, `docs/task-registry.json` | `docs/prds/`, `docs/drafts/`, `docs/prd-registry.json` |
| Planner | `docs/prds/`, `docs/drafts/`, `docs/prd-registry.json` | `docs/tasks/`, `docs/task-registry.json` |

**Trigger:** Before any write to `docs/` subdirectories.

**Failure behavior:** If Builder is about to write to a Planner-owned path, STOP and redirect to `@planner`. If Planner is about to write to a Builder-owned path, STOP and redirect to `@builder`.

**Exception:** Builder MAY inject `TSK-###` stories into an active PRD at user request (this modifies a PRD file, which is allowed only for story injection).

---

## Phase 0: Analysis & Task Spec Generation

> ⛔ **MANDATORY: Every ad-hoc request goes through analysis.**
>
> **Trigger:** User provides an ad-hoc task request.
>
> **Evidence:** Analysis output block with alternatives/consequences MUST appear in response.
>
> **Failure behavior:** If proceeding to implementation without showing analysis output, STOP and run analysis first.

### Step 0.0: Initialize Analysis Gate (CRITICAL — First Step)

> ⛔ **This initialization is MANDATORY and must happen BEFORE any analysis.**
>
> This ensures the analysis gate is enforced even after context compaction.

**Immediately on entering ad-hoc mode, initialize the session:**

1. Create session directory: `docs/sessions/{timestamp}-adhoc/`
2. Write `session.json`:

```json
{
  "id": "{timestamp}-adhoc",
  "mode": "adhoc",
  "source": { "taskId": null },
  "analysisCompleted": false,
  "probeStatus": null,
  "chunks": [],
  "currentChunk": null,
  "implementationDecisions": [],
  "startedAt": "2026-03-03T10:30:00Z",
  "status": "active",
  "currentAction": null
}
```

> Per-chunk verification isolation: each chunk has its own `verification` object in `chunk.json`. No top-level verification state to reset.
> (e.g., `type: "advisory"` or `type: "skip"`) and skip real verification for the new task.

**Why this matters:**
- The `analysisCompleted: false` flag serves as a technical checkpoint
- Even if behavioral guardrails are "forgotten" after context compaction, this flag persists
- The flag is checked before EVERY @developer delegation (see builder.md)
- The flag is ONLY set to `true` after user responds with `[G] Go ahead`
- The verification state reset prevents stale contracts from causing verification skips

**Compaction resilience:**
- On session resume after compaction, Builder reads this flag
- If `analysisCompleted === false`, Builder knows analysis approval is pending
- If `analysisCompleted === true`, Builder can verify approval was received

When user gives a task in ad-hoc mode:

### Step 0.0a: Pre-Analysis Screenshot (MANDATORY)

> ⛔ **CRITICAL: ALWAYS capture a screenshot BEFORE analyzing the request.**
>
> This is NOT optional. Code analysis alone misses CSS inheritance, runtime state, and visual bugs.
> The screenshot reveals what the user actually sees, preventing "I'll fix the blue button" when the button is actually gray.

**Why this matters:**
- Visual issues are best caught visually — code analysis alone is insufficient
- Prevents misunderstandings between Builder and user about current state
- Catches CSS overrides, runtime state, and inheritance that code analysis misses

**Workflow:**

```
┌─────────────────────────────────────────────────────────────┐
│ Ad-Hoc Request Received                                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Determine app type from project.json                     │
│ 2. Ensure app is running (auto-start if needed)             │
│ 3. Take screenshot of current state                         │
│ 4. Then proceed to code analysis (Step 0.1)                 │
│ 5. Present BOTH screenshot AND code findings to user        │
└─────────────────────────────────────────────────────────────┘
```

**Step 0.0a.1: Determine App Type**

Read `project.json` to determine the app architecture:

```bash
# Check for desktop app configuration
jq -r '.apps[] | select(.type == "desktop") | {framework, webContent, remoteUrl}' docs/project.json 2>/dev/null
```

| App Type | webContent | Action |
|----------|------------|--------|
| Web app | *(none)* | Start dev server if not running, screenshot localhost |
| Desktop | `bundled` | Launch app if not running, screenshot app window |
| Desktop | `remote` | Screenshot the deployed `remoteUrl` directly (no local app needed) |
| Desktop | `hybrid` | Start dev server for local content, screenshot |

**Step 0.0a.2: Ensure App is Running**

| App Type | If Not Running |
|----------|----------------|
| Web app | Load `start-dev-server` skill, start dev server |
| Desktop (bundled) | Load `start-dev-server` skill with `mode: desktop` |
| Desktop (remote) | No startup needed — screenshot deployed URL directly |

**Step 0.0a.3: Capture Screenshot**

Load the `screenshot` skill and capture the current state:

```
Capturing current state...
```

- Use `screenshot` skill with the appropriate URL:
  - Web app: `http://localhost:{devPort}`
  - Desktop (bundled): Capture running app window
  - Desktop (remote): `{apps[].remoteUrl}`
- Capture BOTH light and dark modes if applicable
- Store screenshots in `.tmp/screenshots/pre-analysis/`

**Step 0.0a.4: Attach to Analysis**

The screenshot will be attached to the analysis dashboard (Step 0.2). Do NOT show the screenshot separately — it's part of the analysis presentation.

### Step 0.1: Time-Boxed Analysis (10 seconds)

Run analysis with visible progress indicator:

```
═══════════════════════════════════════════════════════════════════════
                         ANALYZING REQUEST
═══════════════════════════════════════════════════════════════════════

"Add loading spinner to submit button"

⏳ Scanning imports...
⏳ Identifying affected files...
⏳ Checking for downstream impacts...
⏳ Estimating scope...

═══════════════════════════════════════════════════════════════════════
```

**Analysis methods (run in parallel, 10-second timeout):**

1. **AST/Import Analysis** — Find files importing affected components
2. **Semantic Understanding** — Identify related functionality
3. **Checklist Review** — Check for:
   - Database schema changes needed
   - API contract changes
   - Breaking changes to exports
   - Migration requirements
   - Test impact

If analysis times out, show what was found with note: "⚠️ Analysis may be incomplete (timed out)"

### Step 0.1a: Task Type Classification (MANDATORY)

> ⛔ **CRITICAL: Classify the task type BEFORE proceeding to probe or dashboard.**
>
> Some tasks require no source code changes — only CLI/ops commands (deploy, secrets, infrastructure).
> These "ops-only" tasks can still have **runtime impact** that requires browser verification.
>
> **Trigger:** After Step 0.1 analysis completes.
> **Evidence:** `taskType` written to `session.json` → `taskType`.
> **Failure behavior:** If task type is not classified, default to `source-change` (safest path).

**Classification rules:**

Based on the analysis, determine the task type:

| Task Type | When | Verification Pipeline |
|-----------|------|----------------------|
| `source-change` | Implementation requires modifying source files (`.ts`, `.tsx`, `.go`, etc.) | Standard: typecheck → test → build → Playwright |
| `ops-with-runtime-impact` | Fix requires only CLI/ops commands (deploy, secrets, infra) AND the original issue is **browser-visible** (CORS, auth, API errors, UI behavior) | Reduced: skip typecheck/build, but **run Playwright** against affected behavior |
| `ops-only` | Fix requires only CLI/ops commands AND has **no browser-visible impact** (CI config, log rotation, secret rotation for non-app services) | None: mark complete after ops commands succeed |

> ⛔ **`ops-only` GUARD: If the implementation modifies ANY source file, the task is NOT `ops-only`.**
>
> `ops-only` is reserved for tasks where the ONLY actions are CLI commands (deploy, secret rotation, config changes via CLI).
> If you modify `.ts`, `.tsx`, `.js`, `.go`, `.py`, `.rs`, `.java`, or any other source/config file in the project repo, the task is `source-change` — even if the change is to "infrastructure" code like IPC handlers, main process files, build config, or native API wrappers.
>
> **Common misclassification attempts:**
> - ❌ "This is an IPC handler change, it's infrastructure" → It's a source file → `source-change`
> - ❌ "This is a main process change, not web content" → It's a source file → `source-change`
> - ❌ "This is a build/config change" → If it modifies a source file → `source-change`
> - ✅ `ops-only` examples: `supabase secrets set`, `vercel env add`, `gh secret set`, restarting a service

**How to determine runtime impact:**

Ask: "Was the user's original issue visible in the browser or app UI?"

| Original Issue | Runtime Impact? | Example |
|---------------|-----------------|---------|
| CORS error | Yes | Edge function returns 403 on preflight |
| Auth failure | Yes | OAuth flow fails, login broken |
| API 500 error | Yes | Backend returns error user can see |
| Feature not working | Yes | Deployed function missing, feature 404s |
| CI pipeline failing | No | GitHub Actions red, no user impact |
| Secret rotation (internal) | No | Rotating API keys for monitoring service |
| Log config change | No | Changing log levels, no user impact |

**Write classification to `session.json`:**

```json
{
  "taskType": "ops-with-runtime-impact",
  "runtimeImpact": "GitHub OAuth flow fails — edge function not deployed",
  "opsCommands": ["supabase secrets set", "supabase functions deploy"],
  "verificationTarget": "Authenticate, open org creation wizard, click Connect GitHub — verify OAuth URL returned"
}
```

### Step 0.1b: Playwright Analysis Confirmation (MANDATORY)

> **`testVerifySettings` gate:** Before running the probe, check `project.json` → `testVerifySettings.adHocUIVerify_Analysis` (default: `true` if absent).
> If `false` → skip the entire probe with: `⏭️ Skipping Playwright analysis probe: testVerifySettings.adHocUIVerify_Analysis is false`
> Proceed directly to Step 0.2 (dashboard).

> ⛔ **CRITICAL: Code analysis MUST be confirmed via Playwright probe before showing the dashboard.**
>
> Code-only analysis can miss runtime state, CSS inheritance, dynamic rendering, and route guards.
> Playwright confirmation catches discrepancies between what the code *says* and what *actually* renders.
>
> **Trigger:** After Step 0.1 code analysis completes, before Step 0.2 dashboard.
>
> **Evidence:** Probe results MUST appear in the ANALYSIS COMPLETE dashboard.
>
> **Failure behavior:** If proceeding to Step 0.2 without running the probe, STOP and run the probe first.

> ⛔ **NO-BYPASS RULE: The probe is mandatory. There are no skip conditions. There is no config opt-out. The probe always runs.**
>
> The following are NOT valid reasons to skip the probe:
>
> | Invalid Rationalization | Why It's Wrong | Mandatory Resolution |
> |------------------------|----------------|----------------------|
> | "This is an Electron/desktop app" | Electron apps have web content — probe the web UI | Start the app, probe web content |
> | "The analysis is clear from the code" | Code analysis misses runtime state, CSS, route guards | Run the probe — it catches what code analysis misses |
> | "This is a UX flow restructuring, not element verification" | UX changes affect visible elements — probe them | Generate assertions for the affected UX elements |
> | "The user described the issue clearly" | User descriptions are input, not verification | Run the probe — user descriptions don't replace automated verification |
> | "I already took a screenshot" | Screenshots show current state; probes verify specific assertions | Run the probe — screenshots ≠ assertion verification |
> | "This is a backend/config change" | If the change has any runtime UI impact, probe the affected pages | Generate assertions for affected pages — don't preemptively decide there are none |
> | "Dev server is unreachable" | Start it using `start-dev-server` skill. If the app is not installed, install it. | Start the dev server or install the app — there is always a way |
> | "No page assertions generated" | If analysis cannot produce assertions, the analysis is incomplete | Re-analyze and generate assertions |
> | "Auth is not configured / auth failed" | Exhaust autonomous auth approaches, then ask the user for help | Follow the Auth Resolution Escalation protocol below |
> | "This change cannot be verified via Playwright" | Every source code change has observable effects. If you can't generate assertions, your analysis is incomplete — not the probe | Re-analyze: identify what the change affects in the rendered UI, then generate assertions for those effects |
> | "This is a main process / IPC / native API change" | Main process changes affect what the renderer shows. IPC handlers serve data to web content. Native API calls gate UI behavior | Identify the web-visible effects of the main process change (data displayed, UI state, navigation, error handling), then probe those |
> | "Code analysis is definitive / the fix is confirmed from source" | Code analysis is *input* to the probe, not a *replacement* for it. Runtime behavior diverges from source in ways code analysis cannot detect | Run the probe — "definitive" code analysis is exactly what the probe is designed to validate |
> | "The critical path cannot be verified in a browser" | If the app has ANY web content, there are browser-observable effects of every code change. If truly no web content exists, it's not a web app and shouldn't be in the Playwright pipeline | Identify the web-side effects and probe them. If there genuinely are none, get explicit user confirmation via `[S]` |
>
> **The ONLY way a probe can be skipped is if the user explicitly accepts a skip after Builder has exhausted all options and asked for assistance.** This sets `probeStatus: "user-skipped"` — Builder cannot set this status autonomously.
>
> **If you catch yourself about to skip the probe for any reason — STOP.** Run the probe.

**After Step 0.1 code analysis and Step 0.0a screenshot, run the Playwright probe:**

1. **Generate probe assertions** from code analysis findings:

   For each key conclusion in the analysis, create a probe assertion:

   | Analysis Conclusion | Probe Assertion |
   |---------------------|-----------------|
   | "Button exists at /checkout" | `page: "/checkout", selector: "button[type='submit']", expect: "visible"` |
   | "No spinner currently shown" | `page: "/checkout", selector: ".spinner", expect: "absent"` |
   | "Form has 3 fields" | `page: "/checkout", selector: "input, select, textarea", expect: "exists"` |
   | "Component renders at /dashboard" | `page: "/dashboard", selector: "[data-testid='component']", expect: "visible"` |

   **Assertion generation rules:**
   - Generate 2-5 assertions per affected page (keep it focused)
   - Prioritize assertions about elements the implementation will modify
   - Include at least one "existence" check for the primary target element
   - Include at least one "absence" check for the feature being added (confirms it doesn't exist yet)
   - **CRITICAL: Assertions MUST target the actual pages being changed** — not just whatever public pages are accessible

   > ⛔ **PAGE TARGETING RULE: Probe the pages you plan to modify.**
   >
   > If the analysis identifies changes to `/dashboard`, `/settings`, and `/onboarding`:
   > - ✅ Generate assertions for `/dashboard`, `/settings`, `/onboarding`
   > - ❌ Do NOT generate assertions only for `/login` because it's the only public page
   >
   > If the target pages require authentication:
   > 1. Follow the **Auth Resolution Escalation** protocol below to authenticate
   > 2. Authenticate in the probe's Playwright context BEFORE navigating to protected pages
   > 3. Generate assertions for the actual protected pages being modified
   >
   > **Never declare `probeStatus: "partially-confirmed"` when you only probed public pages**
   > **but the actual changes target authenticated pages.** That's not "partially confirmed" —
   > **that's "not probed at all."**

2. **Determine probe transport (MANDATORY — read `project.json` BEFORE building spec):**

   Read `project.json` → `architecture.deployment` and `apps` to determine the correct transport:

   | `architecture.deployment` | Transport | Spec Format |
   |---------------------------|-----------|-------------|
   | `web`, `web-*`, `serverless` | `browser` | Browser Probe Spec (below) |
   | `electron-only`, `desktop`, `tauri` | `electron` | Electron Probe Spec (below) |
   | `hybrid` (web + desktop) | Both | One probe per transport |

   > ⛔ **CRITICAL: Never use `baseUrl: "http://localhost:{devPort}"` for desktop/Electron apps.**
   > Desktop apps have NO browser-accessible web server. Using browser transport against localhost
   > will probe the wrong thing (or nothing at all) and produce false results.
   > If `architecture.deployment` is `electron-only`, you MUST use `transport: electron`.
   >
   > **Failure behavior:** If the generated probe spec contains `baseUrl` for a project with
   > `architecture.deployment` of `electron-only`/`desktop`/`tauri`, STOP — discard the spec
   > and regenerate using `transport: electron` with paths from `project.json` → `apps.desktop.testing`.

3. **Build probe spec and invoke `@ui-tester-playwright` with `mode: "analysis-probe"`:**

   **Browser Probe Spec** (web apps only):

   ```yaml
   <probe-spec>
     mode: analysis-probe
     transport: browser
     baseUrl: "http://localhost:{devPort}"
     timeout: 5000
     assertions:
       - page: "/checkout"
         description: "Submit button exists"
         checks:
           - selector: "button[type='submit']"
             expect: "visible"
           - selector: ".spinner"
             expect: "absent"
             description: "No loading indicator yet"
   </probe-spec>
   ```

   **Electron Probe Spec** (desktop apps — use when `architecture.deployment` is `electron-only`):

   > All paths and launch config come from `project.json` → `apps.desktop.testing`.
   > Never hardcode paths — always read `executablePath`, `launchTarget`, and `devLaunchArgs` from project settings.

   ```yaml
   <probe-spec>
     mode: analysis-probe
     transport: electron
     launchTarget: # from project.json → apps.desktop.testing.launchTarget
     executablePath: # from project.json → apps.desktop.testing.executablePath[platform]
     timeout: 10000
     zombieCleanup: true
     assertions:
       - window: "main"
         description: "Submit button exists in main window"
         checks:
           - selector: "button[type='submit']"
             expect: "visible"
           - selector: ".spinner"
             expect: "absent"
             description: "No loading indicator yet"
     electronChecks:
       - type: "ipc-response"
         channel: # relevant IPC channel for the change being analyzed
         expect: "defined"
   </probe-spec>
   ```

   > 📚 **SKILL: ui-test-electron** — Load for full Playwright Electron patterns (zombie cleanup, launch, IPC evaluation, auth helpers).

   See `test-ui-verification` skill → "Analysis Probe Mode" for full probe specification format, assertion types, and execution flow (including Architecture-Aware Probe Dispatch and Electron Probe Flow).

4. **Process probe results:**

   | Probe Status | Action |
   |-------------|--------|
   | `confirmed` | Proceed to Step 0.2 with `✅ Playwright-confirmed` badge |
   | `partially-confirmed` | Update analysis with corrections from discrepancies, note in dashboard |
   | `contradicted` | **Re-probe loop:** Revise code analysis using probe data → generate new assertions → re-run probe (max 2 retries, see below) |
   | `user-skipped` | Proceed to Step 0.2 with `⚠️ User accepted skip` badge — user explicitly chose to skip probe on authenticated pages |

5. **On contradiction — mandatory re-probe loop:**

   When probe results contradict the code analysis, Builder MUST revise the analysis AND re-probe to confirm the revision is correct — not just revise and proceed.

   **Re-probe loop (max 2 attempts):**

   ```
   contradicted → revise analysis → generate new assertions → re-run probe
                   ↑                                              ↓
                   └──── still contradicted (attempt < 2) ────────┘
   ```

   **Loop limit:** Maximum 2 re-probe attempts. If still `contradicted` after 2 retries:
   - Lower confidence to LOW
   - Force clarifying questions (which restarts analysis)
   - `contradicted` is a **transient state** — it can never be the final `probeStatus` at the gate

   Each re-probe iteration is logged in the progress indicator:

   ```
   ═══════════════════════════════════════════════════════════════════════
                        ⚠️ ANALYSIS CONTRADICTED
   ═══════════════════════════════════════════════════════════════════════

   Playwright probe found discrepancies with code analysis:

     ❌ Expected button[type='submit'] visible at /checkout
        Actual: not found (page renders a link instead)

     ❌ Expected .form-container visible at /checkout
        Actual: hidden (display: none, gated by feature flag)

   ⏳ Revising analysis with probe data...
   ⏳ Re-probing after analysis revision (attempt 1/2)...
   ✅ Re-probe confirmed: 3/3 assertions match
   ═══════════════════════════════════════════════════════════════════════
   ```

   After successful re-probe resolution:
   - The revised analysis replaces the original in the dashboard
   - Discrepancies are listed in a new `🔍 PROBE RESULTS` section
   - `probeStatus` is updated to `confirmed` or `partially-confirmed`

   After exhausting retries (still contradicted):
   - Confidence is set to LOW, forcing clarifying questions
   - The contradictions are shown to the user with the clarifying questions
   - Answering questions restarts analysis from Step 0.1 (which re-runs the probe)

6. **Progress indicator:**

   Show probe progress inline with the analysis progress:

   ```
   ═══════════════════════════════════════════════════════════════════════
                            ANALYZING REQUEST
   ═══════════════════════════════════════════════════════════════════════

   "Add loading spinner to submit button"

   ⏳ Scanning imports...
   ⏳ Identifying affected files...
   ⏳ Checking for downstream impacts...
   ⏳ Estimating scope...
   ✅ Code analysis complete
   ⏳ Running Playwright probe (confirming analysis)...
   ✅ Probe confirmed: 3/3 assertions match

   ═══════════════════════════════════════════════════════════════════════
   ```

#### Auth Resolution Escalation (for probing authenticated pages)

When the probe targets pages that require authentication, resolve auth **before** invoking `@ui-tester-playwright`:

1. **Check `project.json` → `authentication`:**
   ```bash
   jq '.authentication' docs/project.json
   ```

2. **If auth is configured** → Load the matching auth skill silently:

   | Provider + Method | Load Skill |
   |-------------------|------------|
   | `supabase` + `passwordless-otp` | `auth-supabase-otp` |
   | `supabase` + `email-password` | `auth-supabase-password` |
   | `nextauth` + `email-password` | `auth-nextauth-credentials` |
   | `headless.enabled: true` | `auth-headless` (fastest) |
   | Any other / `custom` | `auth-generic` |

   Execute the auth skill's login flow. Pass the authenticated session/cookies to the probe context.

3. **If auth is NOT configured** → Load `setup-auth` skill and run it:
   - `setup-auth` scans the project for auth patterns (package.json deps, code patterns)
   - It derives the provider and method automatically
   - It checks for existing env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
   - It writes the `authentication` config to `project.json`
   - Then loop back to step 2 with the new config

4. **If `setup-auth` fails** → **Ask the user for help:**
   - "What auth provider does this project use?"
   - "Can you provide test credentials?"
   - "Are there env vars I should check?"

5. **If user provides info** → Try again with user-provided guidance (loop back to step 2)

6. **If user cannot help or says "skip"** → Present skip acceptance prompt:

   ```
   ⚠️ AUTH RESOLUTION FAILED — cannot authenticate for probe

   Attempted:
     1. project.json auth config → [result]
     2. setup-auth auto-detection → [result]
     3. Asked user for help → [result]

   Protected pages NOT probed: /dashboard, /settings

   [S] Skip probe on authenticated pages (proceed with public pages only)
   [H] Help me configure auth (provide credentials/guidance)
   [C] Cancel this request
   ```

   - Only `[S]` from the user sets `probeStatus: "user-skipped"` — Builder cannot set this status autonomously
   - `[H]` loops back to step 4 with additional user guidance
   - `[C]` cancels the entire request

**What to NEVER do:**
- ❌ Ask the user for credentials BEFORE trying autonomous approaches first (steps 1-3)
- ❌ Suggest the user run `/setup-auth` — Builder should run it itself
- ❌ Fall back to probing only public pages without attempting all auth approaches first
- ❌ Set `probeStatus: "user-skipped"` without the user explicitly choosing `[S]`
- ❌ Silently degrade to public-only probing (the old `degraded-no-auth` behavior)

### Step 0.1c: Implementation Decision Detection (NEW)

> **Purpose:** Surface implicit design/implementation decisions that the user should weigh in on before Builder proceeds. These aren't clarifications about *what* to build (that's Step 0.3) — they're decisions about *how* to build it well.
>
> **Trigger:** After Step 0.1b (Playwright probe) completes, before Step 0.2 (dashboard).
>
> **Uses:** Full analysis context — affected files, scope, request type, probe results, task type classification.
>
> **Output:** If decisions detected → show questions (see US-002 below). If none → silently skip.

#### When to Skip (No Questions)

Skip decision detection entirely — proceed directly to Step 0.1d — when the request is clearly trivial:

| Skip Criterion | Examples |
|----------------|----------|
| Bug fix with clear root cause | "Fix the 404 on /settings", "Fix the null pointer in getUserById" |
| Typo / copy correction | "Fix the typo in the header", "Change 'Submitt' to 'Submit'" |
| Version bump / dependency update | "Update React to 18.3", "Bump Node to 20" |
| Config-only change | "Change the timeout to 30s", "Update the API URL in .env" |
| Ops-only task (taskType = `ops-only` or `ops-with-runtime-impact`) | "Deploy the edge functions", "Rotate the API keys" |
| Single-file, single-behavior change with no variants | "Make the header sticky", "Hide the sidebar on mobile" |

**Skip detection is autonomous** — Builder infers whether meaningful implementation decisions exist based on the request and analysis. There is no hardcoded list of "decision-rich" patterns.

**When skipped:** No user-visible output. Flow proceeds directly from 0.1b to 0.1d. Record `implementationDecisions: null` in `session.json`.

#### When to Detect Decisions

Run decision detection when the request involves:

- **Multiple reasonable implementation variants** — more than one experienced developer would reasonably choose a different approach
- **UX behavior choices** — navigation, state persistence, validation timing, success/error handling, progressive disclosure
- **Data lifecycle decisions** — soft delete vs hard delete, sync vs async, cache invalidation strategy, retry policy
- **Component composition** — modal vs page, wizard vs form, inline vs overlay, tabs vs accordion
- **Error handling strategy** — toast vs inline, retry vs fail, graceful degradation approach

**Detection is autonomous.** Builder infers decisions from the analysis context:
- Request complexity and affected file count
- Whether the request implies multi-step user flows
- Whether reasonable developers would implement it differently
- Whether the code analysis reveals multiple valid patterns in the existing codebase

**Detection MUST NOT use a hardcoded pattern catalog.** Builder reasons about decisions generically — the same way an experienced developer would think "before I build this, let me check what the user wants for X."

#### Decision Detection Process

1. **Review the analysis context:**
   - Request text, affected files, scope estimate
   - Probe results (existing UI patterns, component library)
   - Task type classification

2. **Identify implicit decisions** — things the request doesn't specify but that will significantly affect implementation quality. Focus on decisions where:
   - The wrong choice causes rework (e.g., no state persistence → user wanted persistence → redo)
   - Reasonable people would choose differently (e.g., per-step vs final-step validation)
   - The user likely has an opinion but didn't think to state it

3. **Filter out pre-resolved decisions** — if the user already specified a choice in their request text, do NOT surface it as a question. Builder detects pre-resolved decisions by checking the request text against each potential decision.

4. **Include relevant `planning.considerations`** from `project.json`:

   ```bash
   jq '.planning.considerations' docs/project.json
   ```

   For each consideration:
   - Check its `appliesWhen` tags against request characteristics (e.g., `["data-access", "crud"]` matches a request to create a new record type)
   - If the consideration is relevant, include its `scopeQuestions` as additional decision questions
   - Tag consideration-sourced questions with `source: "consideration:{id}"` (e.g., `source: "consideration:permissions"`) for traceability
   - If `acceptanceCriteriaHints` exist on the consideration, store them — they'll be used in US-005 to generate acceptance criteria

   Example `planning.considerations` in project.json:
   ```json
   {
     "planning": {
       "considerations": [
         {
           "id": "permissions",
           "appliesWhen": ["data-access", "crud", "admin"],
           "scopeQuestions": [
             "Which roles can perform this action?",
             "What happens on unauthorized access?"
           ],
           "acceptanceCriteriaHints": [
             "Role-based access control is enforced for {action}",
             "Unauthorized users see a 403 error with clear message"
           ]
         }
       ]
     }
   }
   ```

   **Rules for consideration questions:**
   - Consideration-sourced questions count toward the **5-question maximum**
   - Request-specific (inferred) questions take priority over consideration-sourced questions
   - If no `planning.considerations` exist in project.json, proceed normally with only inferred questions

5. **Prioritize by implementation impact** — rank decisions by how much rework a wrong choice would cause. Keep only the highest-impact decisions (maximum 5). Request-specific questions are ranked first; consideration-sourced questions fill remaining slots.

5. **Store detection results** in `session.json`:

```json
{
  "implementationDecisions": {
    "detected": true,
    "decisions": [
      {
        "id": "state-persistence",
        "question": "Should wizard state persist so users can leave and resume later?",
        "options": [
          {"code": "A", "label": "Yes — save progress to localStorage/DB", "description": "Users can close the browser and resume later"},
          {"code": "B", "label": "No — reset on page leave", "description": "Simpler implementation, wizard restarts if user navigates away"}
        ],
        "userChoice": null,
        "source": "inferred"
        }
      ]
    }
  }
}
```

If no decisions detected (or all were skipped), record in `session.json`:

```json
{
  "implementationDecisions": null
}
```

> **Proceed to Step 0.1c-questions** (below) if decisions were detected. Otherwise, proceed to Step 0.1d.

#### Step 0.1c-questions: Design Decision Questions UI

When decisions are detected, show them in a single-round question prompt:

```
═══════════════════════════════════════════════════════════════════════
                     IMPLEMENTATION DECISIONS
═══════════════════════════════════════════════════════════════════════

I understand what you want — but a few design choices will affect
how I build it. Quick answers help me get it right the first time.

1. Should wizard state persist so users can leave and resume later?
   A. Yes — save progress to localStorage/DB
   B. No — reset on page leave

2. Validate inputs per step or at the final step?
   A. Per-step — each step validates before allowing Next
   B. Final step — validate everything at submission

3. Can users navigate backward through completed steps?
   A. Yes — free navigation between steps
   B. No — forward-only progression

4. What happens after successful submission?
   A. Redirect to the new project page
   B. Show success toast and close modal
   C. Show confirmation step, then close

Reply with codes (e.g., "1A, 2A, 3A, 4B") or describe your preference.
Type "you decide" to let me choose based on best practices.

> _
═══════════════════════════════════════════════════════════════════════
```

**Question rules:**
- Maximum **5 questions** per request (prioritize highest-impact decisions)
- Each question has **2-4 concrete options** with brief explanations
- Questions are **specific and actionable** — not vague ("How should it work?")
- User can reply with **letter codes** for speed (e.g., "1A, 2B, 3A")
- User can reply **"you decide"** (or similar) — Builder proceeds with best judgment
- **Single round only** — no follow-up questions after user answers
- Decisions the user **already specified** in their request are **omitted entirely** (not shown)

**After user responds:**

1. **Parse answers** — letter codes or freeform descriptions
2. **Store choices** in `session.json` → `implementationDecisions.decisions[].userChoice`
3. **If "you decide"** — Builder selects best-practice defaults and records its choices with brief rationale
4. **Proceed to Step 0.1d** with decisions resolved

### Step 0.1d: Playwright Analysis Validation (NEW)

> **Purpose:** Visually confirm that the code analysis matches the actual UI state before showing the dashboard. This catches stale analysis, wrong page assumptions, or misidentified components.
>
> **Trigger:** After Step 0.1c (implementation decisions) completes, before Step 0.2 (dashboard).
>
> **Applies to:** Every request — all projects get full Playwright verification.

This step uses the same Playwright probe mechanism as Step 0.1b but with a different focus:

- **Step 0.1b** probes to confirm the analysis findings (element existence, absence, state)
- **Step 0.1d** validates the overall analysis makes sense visually — the right page, the right components, the right context

**Process:**

1. **Open the primary affected page(s)** in Playwright
2. **Capture the current visual state** — compare against the analysis conclusions
3. **Validate alignment** — do the affected components, scope, and suggested changes align with what's actually rendered?

| Validation Result | Action |
|-------------------|--------|
| Analysis aligns with visual state | Proceed to Step 0.2 — record `visualValidation: "confirmed"` |
| Minor discrepancies | Adjust analysis, note discrepancies in dashboard, proceed to Step 0.2 |
| Major contradiction | Re-analyze from updated visual context, lower confidence if needed |

4. **If dev server is not running:** Load `start-dev-server` skill and start it before probing
5. **Results feed into dashboard:** The PROBE RESULTS section in Step 0.2 reflects both 0.1b and 0.1d findings

> **Note:** If Step 0.1b already provided comprehensive visual confirmation, Step 0.1d may simply validate that no additional pages need checking. The step exists to ensure that the *complete* analysis (including any adjustments from design decisions in 0.1c) is visually grounded.

### Step 0.2: Show Analysis Dashboard

Display results with progressive disclosure. **The pre-analysis screenshot from Step 0.0a MUST be attached.**

```
═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📸 CURRENT STATE: [screenshot attached]
   (screenshot from .tmp/screenshots/pre-analysis/)

📋 REQUEST: "Add loading spinner to submit button"

📊 UNDERSTANDING                          Confidence: HIGH ✅ Playwright-confirmed
───────────────────────────────────────────────────────────────────────
Based on visual + code + Playwright probe analysis:
- The submit button is currently a blue primary button (visible in screenshot)
- No loading indicator exists — button stays static during submission
- Existing Spinner component available in design system

Proposed:
- Show spinner icon during form submission
- Disable button while loading to prevent double-submit
- Use existing Spinner component from design system

🔍 PROBE RESULTS                                              3/3 ✅
───────────────────────────────────────────────────────────────────────
  ✅ /checkout → button[type='submit'] visible (confirmed)
  ✅ /checkout → .spinner absent (confirmed: no spinner yet)
  ✅ /checkout → button[type='submit'] enabled (confirmed)

⚙️ IMPLEMENTATION DECISIONS                                    3 resolved
───────────────────────────────────────────────────────────────────────
  1. State persistence: No — reset on page leave (simpler, user chose 1B)
  2. Validation timing: Per-step (user chose 2A)
  3. Success behavior: Show toast and close modal (user chose 4B)

🎯 SCOPE: Small (2 files, no breaking changes)

📁 AFFECTED FILES
───────────────────────────────────────────────────────────────────────
• src/components/SubmitButton.tsx (modify)
• src/components/SubmitButton.test.tsx (add/modify tests)

⚠️ CONSEQUENCES: None identified

✅ RECOMMENDED APPROACH
───────────────────────────────────────────────────────────────────────
Use Spinner component (consistent with design system, accessible)

🔀 ALTERNATIVES                                              [D] Details
───────────────────────────────────────────────────────────────────────
1. CSS-only animation (simpler but inconsistent with design system)
2. Full-page overlay (overkill for single button)

📝 STORY PREVIEW
───────────────────────────────────────────────────────────────────────
TSK-001: Add loading state to SubmitButton
TSK-002: Show Spinner when loading  
TSK-003: Disable button during submission
TSK-004: Add unit tests

🔧 VERIFICATION PLAN
───────────────────────────────────────────────────────────────────────
  Task type: source-change
  Source changes: Yes (2 files)
  Pipeline: typecheck → lint → unit tests → rebuild → Playwright verify
  Playwright scope: /checkout (submit button loading states)

═══════════════════════════════════════════════════════════════════════

[G] Go ahead — create Task Spec and start
[F] Show implementation flow chart
[E] Edit/Clarify — refine understanding  
[P] Promote to PRD — hand off to Planner
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

> ⚠️ **The screenshot is NOT optional.** If screenshot capture failed:
> - Show error reason (e.g., "Dev server not running", "Remote URL unreachable")
> - Offer options: `[R] Retry screenshot`, `[S] Skip screenshot (not recommended)`, `[C] Cancel`
> - If user chooses `[S]`, proceed but note "⚠️ Analysis based on code only — visual state not verified"

> ⚠️ **The Playwright probe is mandatory.** If the probe has not run, do not show the dashboard — go back and run the probe.
> The probe always runs. There are no skip conditions. There is no config opt-out.
> Exception: if `probeStatus` is `user-skipped`, the dashboard may be shown (user already explicitly accepted the skip).

**Probe results display in dashboard:**

| Probe Status | Dashboard Badge | Probe Section |
|-------------|-----------------|---------------|
| `confirmed` | `Confidence: HIGH ✅ Playwright-confirmed` | `🔍 PROBE RESULTS  N/N ✅` |
| `partially-confirmed` | `Confidence: HIGH ⚠️ Playwright: N/M confirmed` | `🔍 PROBE RESULTS  N/M ⚠️` with discrepancies listed |
| `contradicted` | `Confidence: MEDIUM 🔴 Playwright contradicted` | `🔍 PROBE RESULTS  N/M 🔴` with contradictions expanded |
| `user-skipped` | `Confidence: [original] ⚠️ User accepted skip` | `🔍 PROBE: ⚠️ User accepted skip (auth pages unverified)` |

**Dashboard rules:**
- **Confidence:** HIGH (clear request) / MEDIUM (some ambiguity) / LOW (needs clarification)
- **Scope:** Small (<5 files, no breaking changes) / Medium (5-15 files, minor impacts) / Large (15+ files, breaking changes)
- **Consequences:** Collapsed if none; expanded if any exist
- **Implementation Decisions:** Shown between PROBE RESULTS and SCOPE when decisions were resolved in Step 0.1c. Omitted entirely when no decisions were detected (Step 0.1c was skipped). Each decision shows the question summary, the user's choice, and brief rationale. If user chose "you decide", show Builder's choice with "(Builder's recommendation)" label.
- **Recommended Approach:** Always shown as its own `✅ RECOMMENDED APPROACH` section; never listed inside Alternatives
- **Alternatives:** Shown as `🔀 ALTERNATIVES` section with non-recommended options only; collapsed if no alternatives exist

**Dashboard options by confidence level:**

| Confidence | Available Options |
|------------|-------------------|
| HIGH | `[G]` Go ahead, `[F]` Flow chart, `[E]` Edit/Clarify, `[P]` Promote, `[C]` Cancel |
| MEDIUM | `[Q]` Answer questions (mandatory), `[F]` Flow chart, `[J]` Just do it, `[P]` Promote, `[C]` Cancel |
| LOW | `[Q]` Answer questions (mandatory), `[F]` Flow chart, `[J]` Just do it, `[P]` Promote, `[C]` Cancel |

> ⛔ **CRITICAL: [G] is NOT shown for MEDIUM/LOW confidence.**
>
> The user MUST either answer clarifying questions `[Q]` or explicitly choose `[J]` to proceed with best interpretation.
> After either action, show an UPDATED dashboard with `[G]` available.

**MEDIUM/LOW dashboard example:**

```
═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Fix the caching issue"

📊 UNDERSTANDING                                    Confidence: MEDIUM
───────────────────────────────────────────────────────────────────────
There appears to be a caching issue but I need clarification:
- Could be browser cache, API cache, or database query cache
- Multiple components involve caching

🎯 SCOPE: Unknown (depends on root cause)

...

═══════════════════════════════════════════════════════════════════════

[Q] Answer clarifying questions — I'll ask about the specific issue
[F] Show implementation flow chart
[J] Just do it — proceed with my best interpretation
[P] Promote to PRD — hand off to Planner
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

**Ops-only with runtime impact dashboard example:**

```
═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Fix Failed to generate GitHub OAuth URL error"

📊 UNDERSTANDING                          Confidence: HIGH ✅ Playwright-confirmed
───────────────────────────────────────────────────────────────────────
The GitHub OAuth flow fails because Supabase Edge Functions are not
deployed to the remote project. The functions exist locally but were
never deployed after the last migration.

🔍 PROBE RESULTS                                              1/1 ✅
───────────────────────────────────────────────────────────────────────
  ✅ /org/create → "Connect GitHub" button visible (confirmed)

🎯 SCOPE: Small (ops-only — deploy functions + set secrets)

📁 OPS COMMANDS (no source changes)
───────────────────────────────────────────────────────────────────────
• supabase secrets set --env-file .env.production
• supabase functions deploy (10 functions)

🔧 VERIFICATION PLAN
───────────────────────────────────────────────────────────────────────
  Task type: ops-with-runtime-impact
  Source changes: None (ops-only)
  Runtime impact: Yes — GitHub OAuth flow fails without deployed edge functions
  Pipeline: ops commands → Playwright verify affected behavior
  Playwright scope: Authenticate → org creation wizard → Connect GitHub
    → Verify edge function returns valid OAuth URL

═══════════════════════════════════════════════════════════════════════

[G] Go ahead — execute ops commands and verify
[F] Show implementation flow chart
[E] Edit/Clarify — refine understanding
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

> ⚠️ **The VERIFICATION PLAN section is MANDATORY in every dashboard.**
>
> It must always be present, including for ops-only tasks. The plan makes explicit:
> - Whether source changes exist
> - Whether Playwright verification will run (and why)
> - What behavior will be verified
>
> This prevents Builder from "forgetting" verification after ops commands complete.

### Step 0.2a: Flow Chart Option ([F])

When user selects `[F] Show implementation flow chart`, generate an ASCII flow chart showing the full implementation plan adapted to the specific stories from analysis.

**Flow chart format:**

```
═══════════════════════════════════════════════════════════════════════
                      IMPLEMENTATION FLOW CHART
═══════════════════════════════════════════════════════════════════════

  4 stories │ Story Processing Pipeline (per story)
  ──────────┤
            │
  ┌─────────────────────────────────────────────────┐
  │ TSK-001: Add loading state to SubmitButton       │
  │   implement → test-flow → commit → postActions   │
  └──────────────────────┬──────────────────────────┘
                         │
  ┌─────────────────────────────────────────────────┐
  │ TSK-002: Show Spinner when loading               │
  │   implement → test-flow → commit → postActions   │
  └──────────────────────┬──────────────────────────┘
                         │
  ┌─────────────────────────────────────────────────┐
  │ TSK-003: Disable button during submission        │
  │   implement → test-flow → commit → postActions   │
  └──────────────────────┬──────────────────────────┘
                         │
  ┌─────────────────────────────────────────────────┐
  │ TSK-004: Add unit tests                          │
  │   implement → test-flow → commit → postActions   │
  └─────────────────────────────────────────────────┘

  Pipeline per story:
    1. Set status → in_progress
    2. Delegate to @developer
    3. Run test-flow (typecheck → lint → test → Playwright → fix loop)
    4. Auto-commit (mandatory, unconditional)
    4.5. Execute postChangeActions (from project.json)
    5. Update status → completed
    6. Advance to next story

═══════════════════════════════════════════════════════════════════════
```

**Adaptation rules:**

| Scenario | Flow chart behavior |
|----------|-------------------|
| Single story | One box, no connecting lines |
| Multi-story (no deps) | Vertical sequence with `│` connectors |
| Stories with dependencies | Show dependency arrows (if noted in PRD/Task Spec) |
| PRD mode | Use `US-XXX` prefixes instead of `TSK-XXX` |

**After viewing the flow chart**, return to the same ANALYSIS COMPLETE dashboard with all original options (`[G]`, `[F]`, `[E]`, `[P]`, `[C]`, etc.).

> ℹ️ **Available in both PRD and ad-hoc modes.** In PRD mode, the flow chart can be shown at story list review time — Builder generates it from the PRD's story list using the same format.

### Step 0.3: Clarifying Questions (MANDATORY for MEDIUM/LOW)

> ⛔ **This step is MANDATORY when confidence is MEDIUM or LOW.**
>
> Do NOT proceed to Step 0.5 (Task Spec) without either:
> 1. User answers questions → Re-run analysis → Show updated dashboard with [G]
> 2. User chooses [J] → Show updated dashboard with [G] and note "proceeding with best interpretation"

For MEDIUM or LOW confidence, show questions in series format:

```
═══════════════════════════════════════════════════════════════════════
                       CLARIFYING QUESTIONS
═══════════════════════════════════════════════════════════════════════

I need to clarify a few things:

1. Where should the spinner appear?
   A. Inside the button (replaces text)
   B. Next to the button
   C. Overlay on the entire form

2. Should the spinner use the existing design system component?
   A. Yes, use <Spinner /> from @/components/ui
   B. No, create a new custom spinner

3. What triggers the loading state?
   A. Form submission only
   B. Any button click that triggers async action

Reply with codes (e.g., "1A, 2A, 3A") or describe your preference.
Type "just do it" to proceed with my best interpretation.

> _
═══════════════════════════════════════════════════════════════════════
```

**Question rules:**
- Single round of questions — ask all at once
- User can reply with letter codes for speed
- User can type "just do it" or choose `[J]` to proceed with best interpretation

**After questions answered or [J] chosen:**

1. Re-analyze with new information (if questions were answered)
2. Update confidence level (typically becomes HIGH after clarification)
3. Show UPDATED analysis dashboard with `[G]` now available:

```
═══════════════════════════════════════════════════════════════════════
                    ANALYSIS COMPLETE (UPDATED)
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Fix the caching issue"

📊 UNDERSTANDING                                    Confidence: HIGH
───────────────────────────────────────────────────────────────────────
Fix browser cache issue in ProductList component:
- Clear stale cache on navigation
- Add cache invalidation on data updates
(Based on your clarification: "It's the browser cache for product data")

...

═══════════════════════════════════════════════════════════════════════

[G] Go ahead — create Task Spec and start
[F] Show implementation flow chart
[E] Edit/Clarify — refine understanding  
[P] Promote to PRD — hand off to Planner
[C] Cancel — abort this request

> _
═══════════════════════════════════════════════════════════════════════
```

If user chose `[J]` instead of answering questions, show dashboard with note:

```
📊 UNDERSTANDING                       Confidence: MEDIUM → proceeding
───────────────────────────────────────────────────────────────────────
Proceeding with best interpretation: [state what you're assuming]
User chose to proceed without clarification.
```

### Step 0.4: PRD Recommendation (For Medium/Large Scope)

For medium or large scope requests, recommend PRD with auto-created promotion doc:

```
═══════════════════════════════════════════════════════════════════════
                       PRD RECOMMENDED
═══════════════════════════════════════════════════════════════════════

⚠️ This request is MEDIUM scope with potential impacts:

• Affects 12 files across 3 modules
• Requires database schema changes
• Has downstream impacts on API consumers

💡 I recommend creating a formal PRD for proper planning.
   (Promotion document ready: docs/tasks/promotions/promote-to-prd.md)

[P] Promote to Planner — use prepared promotion doc
[O] Override and continue — proceed with Task Spec anyway

> _
═══════════════════════════════════════════════════════════════════════
```

**Before showing this prompt:**
1. Auto-create promotion document at `docs/tasks/promotions/promote-task-YYYY-MM-DD-name-to-prd.md`
2. Include full analysis, understanding, alternatives, consequences

If user chooses [O] (override), proceed but warn again at ~50% completion if scope grew.

### Step 0.5: Generate Task Spec

On [G] Go ahead:

1. **Create Task Spec file** at `docs/tasks/drafts/task-YYYY-MM-DD-brief-name.md`:

```markdown
---
id: task-2026-03-01-add-spinner
title: Add Loading Spinner to Submit Button
status: draft
scope: small
confidence: high
createdAt: 2026-03-01T10:30:00Z
---

# Task: Add Loading Spinner to Submit Button

## Summary

Add visual loading feedback to SubmitButton component with spinner icon
during form submission, disabled state to prevent double-submit.

**Original Request:** "Add loading spinner to submit button"

## Analysis

**Scope:** Small (2 files, no breaking changes)
**Confidence:** High

**Approach:** Use existing Spinner component, disable button during submission.

**Alternatives Considered:**
- CSS-only animation — simpler but inconsistent with design system
- Full-page overlay — overkill for single button

**Recommendation:** Use Spinner component (consistent, accessible, already styled)

**Consequences:** None identified

### Implementation Decisions

*(This section is included when design decisions were resolved in Step 0.1c. Omit when no decisions were detected.)*

| Decision | User's Choice | Impact |
|----------|--------------|--------|
| State persistence | No — reset on page leave (1B) | Simpler implementation, no localStorage/DB needed |
| Validation timing | Per-step (2A) | Each wizard step validates before Next |
| Success behavior | Toast and close modal (4B) | No redirect, modal dismisses with confirmation toast |

*Source: consideration:permissions — "Which roles can perform this action?" → Admin only*

> **Decisions flow to acceptance criteria:** Each resolved decision that implies a specific behavior generates an acceptance criterion on the relevant story below. Consideration-sourced decisions also use `acceptanceCriteriaHints` from project.json when available.

## Stories

### TSK-001: Add loading state to SubmitButton component

**Description:** Add isLoading prop to track submission state.

**Acceptance Criteria:**

- [ ] Add `isLoading` prop to SubmitButton
- [ ] Pass loading state from parent form
- [ ] Typecheck passes

### TSK-002: Show Spinner when loading

**Description:** Display spinner icon during submission.

**Acceptance Criteria:**

- [ ] Import Spinner component
- [ ] Render Spinner when `isLoading` is true
- [ ] Hide button text while loading
- [ ] Verify in browser

### TSK-003: Disable button during submission

**Description:** Prevent double-submit during loading.

**Acceptance Criteria:**

- [ ] Add `disabled={isLoading}` to button
- [ ] Style disabled state appropriately
- [ ] Works in both light and dark mode

### TSK-004: Add unit tests

**Description:** Test loading behavior.

**Acceptance Criteria:**

- [ ] Test loading state renders spinner
- [ ] Test button is disabled during loading
- [ ] Unit tests pass
```

2. **Register in task-registry.json:**

```json
{
  "$schema": "https://opencode.ai/schemas/task-registry.json",
  "tasks": [
    {
      "id": "task-2026-03-01-add-spinner",
      "title": "Add Loading Spinner to Submit Button",
      "status": "draft",
      "scope": "small",
      "confidence": "high",
      "filePath": "docs/tasks/drafts/task-2026-03-01-add-spinner.md",
      "storyCount": 4,
      "createdAt": "2026-03-01T10:30:00Z"
    }
  ]
}
```

3. **Move to ready and start:**
   - Move file from `docs/tasks/drafts/` to `docs/tasks/`
   - Update status to `ready` in registry
   - Update `session.json` with **`analysisCompleted: true`**
   - Proceed to Phase 1

> ⚠️ **CRITICAL: Only set `analysisCompleted: true` after user responds with [G] Go ahead.**
>
> This flag is the technical checkpoint that prevents implementation without approval.
> If this flag is `false`, @developer delegation is BLOCKED.

### Multi-Task Chunk Grouping

When the user provides multiple unrelated tasks in a single ad-hoc request, Builder groups them into logical chunks before starting. Each chunk becomes an independent unit of work with its own context boundary.

**Show grouping to user before proceeding:**

```
I'll work through these in 3 chunks:
  1. TSK-001: Fix header alignment + update nav styles (related files)
  2. TSK-002: Add error handling to API endpoints (related domain)
  3. TSK-003: Update documentation (independent)

Override grouping? (Enter to accept, or describe different grouping)
```

**Grouping heuristics (in priority order):**

1. **Related files** — tasks touching the same files go together
2. **Dependency** — tasks that depend on each other go in sequence
3. **Logical domain** — tasks in the same feature area group together
4. **Default** — if no clear grouping, each task is its own chunk

**Single-task optimization:** For single-task requests, the entire request is one chunk. No grouping prompt — no overhead.

**User can override:** regroup, reorder, or accept the default.

---

## Phase 1: Task Execution

### Step 1.0: Setup State

Update `session.json` with chunks and set `analysisCompleted: true`:

```json
{
  "mode": "adhoc",
  "source": { "taskId": "task-2026-03-01-add-spinner" },
  "chunks": [
    { "id": "TSK-001-01-add-loading-state", "storyId": "TSK-001", "description": "Add loading state", "status": "in_progress" },
    { "id": "TSK-002-01-show-spinner", "storyId": "TSK-002", "description": "Show Spinner", "status": "pending" },
    { "id": "TSK-003-01-disable-button", "storyId": "TSK-003", "description": "Disable button", "status": "pending" },
    { "id": "TSK-004-01-add-unit-tests", "storyId": "TSK-004", "description": "Add unit tests", "status": "pending" }
  ],
  "currentChunk": "TSK-001-01-add-loading-state",
  "analysisCompleted": true
}
```

Create chunk folders for each chunk and initialize `chunk.json` in each.

> ⛔ **Before ANY @developer delegation, verify `session.json` → `analysisCompleted === true`.**
>
> If not true, STOP and show the analysis dashboard first.

Right-panel todos are derived from `session.json` → `chunks[]`. Update right panel via `todowrite` to match chunks.

---

## Per-Task Quality Checks (MANDATORY)

> 📚 **SKILL: test-flow** → "Skip Gate → Activity Resolution → Quality Check Pipeline"
>
> Load the `test-flow` skill for the complete quality check pipeline that runs after every story completion.
> It includes skip-gate logic, activity resolution, typecheck/lint/test/rebuild/critic/Playwright,
> and the completion prompt. **No prompts, no skipping** — test-flow runs automatically.
>
> **Ad-hoc context to pass:**
> - `mode: "adhoc"` — 3-attempt retry strategy (vs PRD's 5-attempt)
> - `taskId` and `storyId` from `session.json`
> - `taskSpecPath` for acceptance criteria reference
>
> **Failure behavior:** If any check fails after 3 fix attempts, STOP and report to user.

**After all checks pass**, show the story completion prompt (see Step 1.4 below).

---

### Step 1.1: Setup Execution Branch

Read git workflow from `project.json`:

- If `trunk + branchless`: Stay on default branch
- Otherwise: Create/checkout ad-hoc branch

```bash
# Branch naming: adhoc/YYYY-MM-DD
BRANCH="adhoc/$(date +%Y-%m-%d)"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git checkout "$BRANCH"
else
    git checkout -b "$BRANCH" main
fi
```

### Step 1.2: Execute Story

For each story (TSK-001, TSK-002, etc.):

1. **Mark story in_progress** in todos and registry
2. **Generate verification contract** (see builder.md)
3. **Delegate to @developer** with context block:

```yaml
<context>
version: 1
project:
  path: {absolute path}
  stack: {stack from project.json}
  commands:
    test: {commands.test}
    lint: {commands.lint}
conventions:
  summary: |
    {2-5 sentence summary}
currentWork:
  mode: task-spec
  taskId: task-2026-03-01-add-spinner
  story: TSK-001
  title: Add loading state to SubmitButton component
  acceptanceCriteria:
    - Add isLoading prop to SubmitButton
    - Pass loading state from parent form
    - Typecheck passes
</context>

Implement TSK-001: Add loading state to SubmitButton component

Requirements:
- Add `isLoading` prop to SubmitButton
- Pass loading state from parent form
- Ensure typecheck passes
```

4. **Run quality checks** (automatic — load `test-flow` skill, see [Per-Task Quality Checks](#per-task-quality-checks-mandatory) above)
5. **Mark story complete** — update todos, registry, Task Spec file
6. **Update scope estimate** — check if scope is growing

### Step 1.2a: Post-Ops Verification Checkpoint (ops-only tasks)

> 📚 **SKILL: test-flow** → "Skip Gate" (taskType routing)
>
> For ops-only tasks, `test-flow` handles the taskType-based routing automatically:
>
> | taskType | test-flow behavior |
> |----------|-------------------|
> | `source-change` | Standard pipeline: typecheck → lint → test → rebuild → critic → Playwright |
> | `ops-with-runtime-impact` | Skip typecheck/lint/test/rebuild → run Playwright only against `verificationTarget` |
> | `ops-only` | Skip all checks → mark complete |
>
> **Trigger:** After ops commands complete, load `test-flow` with taskType context from `session.json`.
> test-flow reads `verificationTarget` and writes/runs targeted Playwright tests for `ops-with-runtime-impact` tasks.
>
> **Failure behavior:** If Builder completes ops commands and declares "done" without running test-flow, the task is NOT verified.

### Step 1.3: Scope Growth Warning

If at ~50% story completion, scope has grown significantly (files or stories increased by >50%):

```
═══════════════════════════════════════════════════════════════════════
                       ⚠️ SCOPE GROWTH DETECTED
═══════════════════════════════════════════════════════════════════════

This task has grown beyond the original estimate:

Original: Small (2 files, 4 stories)
Current:  Medium (8 files, 7 stories)

Consider promoting to formal PRD for better tracking.
(Promotion document ready)

[P] Promote to PRD now
[K] Keep going with Task Spec

> _
═══════════════════════════════════════════════════════════════════════
```

This is a one-time warning per task.

### Step 1.4: Story Completion Prompt

After each story completes:

```
═══════════════════════════════════════════════════════════════════════
                         STORY COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ TSK-001: Add loading state to SubmitButton component

Quality checks:
  ✅ Typecheck: passed
  ✅ Lint: passed
  ✅ Unit tests: passed
  ✅ UI Verification: verified (screenshot captured)

Progress: 1/4 stories (25%)

[N] Next story (TSK-002: Show Spinner when loading)
[C] Commit and continue later
[P] Promote to PRD
[A] Abandon task

> _
═══════════════════════════════════════════════════════════════════════
```

**Verification status indicators:**

| Status | Display | Meaning |
|--------|---------|---------|
| `verified` | `✅ UI Verification: verified (screenshot captured)` | Browser test passed |
| `not-required` | `➖ UI Verification: not required (no UI changes)` | No UI files changed |
| `settings-disabled` | `➖ UI Verification: disabled (testVerifySettings)` | Setting is `false` in project.json |
| `skipped` | `⚠️ UI Verification: SKIPPED (added to test debt)` | User chose to skip |

---

## Mid-PRD Task Injection

When user says "add a task to handle X after US-002" during active PRD work:

### Step 1: Generate TSK Story

```markdown
### TSK-001: Handle error states for theme save [INJECTED]

**Description:** As a user, I want to see error feedback if theme save fails.

**Acceptance Criteria:**

- [ ] Show toast on save failure
- [ ] Allow retry
- [ ] Verify in browser
```

### Step 2: Inject into PRD File

Insert after the specified story (US-002 in this example).

### Step 3: Update Session State

Update `session.json` to track the injected task as a new chunk:

```json
{
  "mode": "prd",
  "prdId": "prd-user-settings",
  "chunks": [
    { "id": "US-002-01-user-settings", "storyId": "US-002", "status": "in_progress" }
  ],
  "currentChunk": "US-002-01-user-settings",
  "injectedTasks": ["TSK-001"]
}
```

### Step 4: Update Todos

Insert TSK-001 at correct position in right panel todos.

---

## Task Spec Completion (US-011)

When all stories complete:

### Step 1: Generate Completion Summary (MANDATORY)

> ⛔ **This completion report MUST be shown before offering to commit.**
>
> The user cannot proceed to commit without seeing this report.
> Do not skip any section — all fields are required.

```
═══════════════════════════════════════════════════════════════════════
                       TASK SPEC COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ All stories complete!

📋 ORIGINAL REQUEST
───────────────────────────────────────────────────────────────────────
"Add loading spinner to submit button"

📊 UNDERSTANDING (How I Interpreted It)
───────────────────────────────────────────────────────────────────────
Add visual loading feedback to SubmitButton component:
- Show spinner icon during form submission
- Disable button while loading to prevent double-submit
- Use existing Spinner component from design system

📝 STORIES COMPLETED
───────────────────────────────────────────────────────────────────────
  ✅ TSK-001: Add loading state to SubmitButton
  ✅ TSK-002: Show Spinner when loading
  ✅ TSK-003: Disable button during submission
  ✅ TSK-004: Add unit tests

📁 FILES MODIFIED
───────────────────────────────────────────────────────────────────────
  • src/components/SubmitButton.tsx
  • src/components/SubmitButton.test.tsx

🧪 TESTS RUN
───────────────────────────────────────────────────────────────────────
  Unit tests: 3 tests passed
  Verification tests: 1 test passed

✅ VERIFICATION STATUS (per story)
───────────────────────────────────────────────────────────────────────
  TSK-001: ✅ verified (screenshot: submit-button-loading-state.png)
  TSK-002: ✅ verified (screenshot: submit-button-spinner.png)
  TSK-003: ✅ verified (screenshot: submit-button-disabled.png)
  TSK-004: ➖ not required (test file only)

📸 SCREENSHOTS CAPTURED
───────────────────────────────────────────────────────────────────────
  • .tmp/verification/screenshots/submit-button-loading-state.png
  • .tmp/verification/screenshots/submit-button-spinner.png
  • .tmp/verification/screenshots/submit-button-disabled.png

📦 COMMITS MADE
───────────────────────────────────────────────────────────────────────
  • abc1234: feat: Add loading state to SubmitButton
  • def5678: feat: Add spinner and disable during loading
  • ghi9012: test: Add unit tests for loading behavior

⏱️ TIME TAKEN
───────────────────────────────────────────────────────────────────────
  Started: 10:30 AM
  Completed: 10:45 AM
  Duration: ~15 minutes

═══════════════════════════════════════════════════════════════════════

[C] Commit and ship

> _
═══════════════════════════════════════════════════════════════════════
```

### Completion Report Field Reference

| Field | Required | Source |
|-------|----------|--------|
| Original Request | ✅ Yes | User's initial message that triggered ad-hoc mode |
| Understanding | ✅ Yes | From ANALYSIS COMPLETE dashboard |
| Stories Completed | ✅ Yes | From Task Spec file |
| Files Modified | ✅ Yes | Aggregated from all story implementations |
| Tests Run | ✅ Yes | Count of unit tests + verification tests |
| Verification Status | ✅ Yes | Per-story: verified / skipped / not-required |
| Screenshots Captured | ✅ Yes | Paths to any screenshots taken (empty if none) |
| Commits Made | ✅ Yes | Git log for this task (hash + message) |
| Time Taken | ✅ Yes | From session.json `startedAt` to now |

### Step 2: Archive Task Spec

1. Move file to `docs/tasks/completed/`
2. Update registry status to `completed` with `completedAt` timestamp
3. Update Task Spec file with completion section:

```markdown
## Completion

**Completed:** 2026-03-01T11:15:00Z
**Files Changed:** 2
**Tests Added:** 3 unit tests
**Summary:** Added loading spinner to SubmitButton with isLoading prop, Spinner component, and disabled state during submission.
```

4. Archive session to `docs/sessions/archive/`

---

## Task Spec Abandonment (US-012)

When user types "abandon" or chooses [A]:

```
═══════════════════════════════════════════════════════════════════════
                       ABANDON TASK SPEC
═══════════════════════════════════════════════════════════════════════

Task: Add Loading Spinner to Submit Button
Progress: 2/4 stories complete

Optional: Why are you abandoning? (press Enter to skip)
> _

Revert uncommitted changes? 
[Y] Yes — discard uncommitted work
[N] No — keep all changes as-is

> _
═══════════════════════════════════════════════════════════════════════
```

### On Abandonment:

1. If [Y]: `git checkout -- .` to discard uncommitted changes
2. Move Task Spec to `docs/tasks/abandoned/`
3. Update registry with `status: abandoned`, `abandonedAt`, `abandonReason`
4. Archive session to `docs/sessions/archive/` with status `abandoned`
5. Notify: "Task abandoned. You can resume later with `resume task-2026-03-01-add-spinner`"

### Resuming Abandoned Task:

When user says "resume task-2026-03-01-add-spinner":

1. Move Task Spec from `docs/tasks/abandoned/` to `docs/tasks/`
2. Update registry with `status: in_progress`
3. Restore session from `docs/sessions/archive/` back to `docs/sessions/`
4. Resume from first incomplete chunk

---

## Task Spec Promotion (US-008, US-011)

When user chooses [P] Promote to PRD:

### Step 1: Create/Update Promotion Document

Save to `docs/tasks/promotions/promote-task-YYYY-MM-DD-name-to-prd.md`:

```markdown
---
taskId: task-2026-03-01-add-spinner
promotedAt: 2026-03-01T11:00:00Z
preserveWork: true
reason: User requested promotion
---

# Promotion Request: Add Loading Spinner Feature

## Original Request

"Add loading spinner to submit button"

## Analysis Summary

**Original Scope Estimate:** Small
**Actual Scope:** Medium (scope grew during implementation)
**Confidence:** High

**Why promotion is recommended:**
- Discovered need for accessibility improvements
- Animation timing requires design input
- Should be part of larger button component refactor

## Work Completed

### TSK-001: Add loading state ✅
- Added isLoading prop to SubmitButton
- Passes typecheck

### TSK-002: Show Spinner ✅
- Using existing Spinner component

## Remaining Scope (for PRD)

- TSK-003: Disable button during submission
- TSK-004: Add unit tests
- (Additional stories may be needed for accessibility)

## Files Modified

- src/components/SubmitButton.tsx

## Recommended PRD Structure

1. **Loading State** — completed (TSK-001, TSK-002)
2. **Disable Behavior** — from TSK-003
3. **Testing** — from TSK-004
4. **Accessibility Audit** — new story needed
5. **Animation Timing** — design review needed
```

### Step 2: Ask About Work Preservation

```
═══════════════════════════════════════════════════════════════════════
                       PROMOTE TO PRD
═══════════════════════════════════════════════════════════════════════

Promotion document created:
  docs/tasks/promotions/promote-task-2026-03-01-add-spinner-to-prd.md

Completed work (2 stories):
  ✅ TSK-001: Add loading state
  ✅ TSK-002: Show Spinner

[K] Keep completed work — PRD continues from here
[F] Fresh start — Planner re-evaluates everything

> _
═══════════════════════════════════════════════════════════════════════
```

### Step 3: Update State

1. Update Task Spec registry: `status: promoted`, `promotedTo: null` (set when PRD created)
2. Archive session to `docs/sessions/archive/` with status `promoted`
3. Notify: "Promotion request created. Run @planner to continue."

---

## Git Auto-Commit Enforcement

> ⛔ **CRITICAL: Check `git.autoCommit` setting before ANY commit operation**
>
> **Trigger:** Before running `git commit` or any commit delegation.
>
> **Check:** Read `project.json` → `git.autoCommit` value.
>
> **Failure behavior:** If `autoCommit` is `manual` or `false`, do NOT run `git commit`. Stage files and report suggested commit message instead.
>
> See AGENTS.md for full rules.

---

## Phase 2: Ship

When all stories complete and user chooses [C] Commit:

### Step 1: Commit Changes

```bash
git add -A
git commit -m "feat: Add loading spinner to submit button

- TSK-001: Add loading state
- TSK-002: Show Spinner when loading
- TSK-003: Disable button during submission
- TSK-004: Add unit tests

Task-Spec: task-2026-03-01-add-spinner"
```

### Step 1.5: Execute postChangeActions (MANDATORY)

> ⛔ **This step is MANDATORY after every ad-hoc commit — same as Step 4.5 in the Story Processing Pipeline.**
>
> **Failure behavior:** If you find yourself pushing or declaring the task complete without having checked and executed `postChangeActions` — STOP and go back.

After the commit succeeds, read and execute `project.json` → `postChangeActions[]`.
Each action's `trigger.condition` is evaluated against the committed changes.
Actions execute in order: `command` → run shell command, `pending-update` → create file in target project, `agent` → invoke agent, `notify` → display message.

Report per action: `✅ pass`, `⚠️ warn`, or `❌ fail` (per `failureMode`).

> 📚 See `builder.md` → Story Processing Pipeline → Step 4.5 for the full decision tree.
> See `test-flow` → Section 5.5 for detailed execution logic per action type.

### Step 2: Push and PR (Git Completion Workflow)

> ⚓ **AGENTS.md: Git Completion Workflow**
>
> This step follows the canonical Git Completion Workflow defined in AGENTS.md.
> Both PRD mode and ad-hoc mode use the same workflow for consistency.

> ⛔ **CRITICAL: Follow `git.agentWorkflow` settings strictly.**
>
> **Trigger:** After commit, before push/PR operations.
>
> **Check:** Read `project.json` → `git.agentWorkflow` for `pushTo`, `createPrTo`, `requiresHumanApproval`.
>
> **Failure behavior:** If `git.agentWorkflow` is not defined, STOP with Missing Config Error (see AGENTS.md).

**Flow based on project settings:**

1. **Push to configured `pushTo` branch:**
   ```bash
   git push origin {git.agentWorkflow.pushTo}
   ```

2. **If `createPrTo` differs from `pushTo`, offer to create PR:**
   ```
   ═══════════════════════════════════════════════════════════════════════
                          PUSH COMPLETE
   ═══════════════════════════════════════════════════════════════════════
   
   ✅ Pushed to origin/{pushTo}
   
   Your workflow is configured to create PRs to '{createPrTo}'.
   
   [P] Create PR to {createPrTo}
   [S] Stay on {pushTo} (no PR yet)
   
   > _
   ═══════════════════════════════════════════════════════════════════════
   ```

3. **If user chooses [P] and `createPrTo` is in `requiresHumanApproval`:**
   - Create the PR: `gh pr create --base {createPrTo}`
   - Do NOT auto-merge
   - Report: "PR created. Human approval required to merge."

4. **If user chooses [S]:**
   - Stay on current branch
   - Report: "Changes pushed to {pushTo}. Create PR when ready."

### Step 3: Cleanup

1. Clear test checkpoints
2. Archive Task Spec to `docs/tasks/completed/`
3. Archive session to `docs/sessions/archive/`

> Per-chunk verification isolation eliminates the need for manual verification state resets between tasks.

---

## Configuration

Read from `docs/project.json`:

```json
{
  "agents": {
    "prdRecommendationThreshold": "medium",
    "analysisTimeoutMs": 10000,
    "taskSpecEnabled": true,
    "analysisProbeTimeoutMs": 5000
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `prdRecommendationThreshold` | `"medium"` | Scope at which PRD is recommended: `small`, `medium`, `large` |
| `analysisTimeoutMs` | `10000` | Max analysis time in milliseconds |
| `taskSpecEnabled` | `true` | Set `false` for legacy behavior (not recommended) |
| `analysisProbeTimeoutMs` | `5000` | Timeout per page for Playwright probe |

> ⛔ **There is no `analysisProbe` toggle.** The probe is mandatory and cannot be disabled via configuration.

---

## Example Flow (Complete)

```
User: "Add loading spinner to submit button"

Builder:
═══════════════════════════════════════════════════════════════════════
                         ANALYZING REQUEST
═══════════════════════════════════════════════════════════════════════

⏳ Scanning imports...
⏳ Identifying affected files...
⏳ Estimating scope...
✅ Code analysis complete
⏳ Running Playwright probe (confirming analysis)...
✅ Probe confirmed: 3/3 assertions match

═══════════════════════════════════════════════════════════════════════
                         ANALYSIS COMPLETE
═══════════════════════════════════════════════════════════════════════

📋 REQUEST: "Add loading spinner to submit button"

📊 UNDERSTANDING                          Confidence: HIGH ✅ Playwright-confirmed
Add visual loading feedback to SubmitButton component.

🔍 PROBE RESULTS                                              3/3 ✅
  ✅ /checkout → button[type='submit'] visible
  ✅ /checkout → .spinner absent (no spinner yet)
  ✅ /checkout → button[type='submit'] enabled

🎯 SCOPE: Small (2 files, no breaking changes)

📁 AFFECTED FILES
• src/components/SubmitButton.tsx
• src/components/SubmitButton.test.tsx

⚠️ CONSEQUENCES: None identified

📝 STORY PREVIEW
TSK-001: Add loading state
TSK-002: Show Spinner
TSK-003: Disable button
TSK-004: Add unit tests

[G] Go ahead | [F] Flow chart | [E] Edit | [P] Promote to PRD | [C] Cancel

> _

User: G

Builder:
✅ Task Spec created: docs/tasks/task-2026-03-01-add-spinner.md
📋 Registered in task-registry.json

Starting TSK-001: Add loading state...

[Delegates to @developer, runs quality checks, completes story]

═══════════════════════════════════════════════════════════════════════
                         STORY COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ TSK-001: Add loading state

Progress: 1/4 stories (25%)

[N] Next | [C] Commit | [P] Promote | [A] Abandon

> _

User: N

[Continues through TSK-002, TSK-003, TSK-004...]

═══════════════════════════════════════════════════════════════════════
                       TASK SPEC COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ All 4 stories complete!

Files changed: 2
Tests added: 3

[C] Commit and ship

> _

User: C

═══════════════════════════════════════════════════════════════════════
                         COMMIT COMPLETE
═══════════════════════════════════════════════════════════════════════

✅ Committed: feat: Add loading spinner to submit button
✅ Archived to docs/tasks/completed/

Pushing to origin/staging (configured pushTo)...
✅ Pushed to origin/staging

Your workflow is configured to create PRs to 'main'.

[P] Create PR to main
[S] Stay on staging (no PR yet)

> _

User: P

✅ PR #5 created: staging → main
⚠️ Human approval required to merge (main is protected)
✅ Task complete!
```

---

## End-of-Session: Check for Toolkit Update Requests

**After shipping**, check if sub-agents created toolkit update requests:

```bash
ls ~/.config/opencode/pending-updates/*.md 2>/dev/null | grep -v README.md
```

If any files exist, notify the user:

```
───────────────────────────────────────────────────────────────────────
📋 TOOLKIT UPDATE REQUESTS
───────────────────────────────────────────────────────────────────────

Sub-agents queued update request(s) during this session.
Run @toolkit to review and apply these updates.
───────────────────────────────────────────────────────────────────────
```
