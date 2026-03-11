# PRD: Non-Localhost Testing Support

**Status:** COMPLETE  
**Created:** 2026-03-03  
**Completed:** 2026-03-03  
**Author:** @toolkit (on behalf of user)

---

## Problem Statement

Currently, the AI toolkit assumes all E2E and verification testing runs against a local development server (`http://localhost:${devPort}`). This creates problems for several project types:

### Projects Without Local Runtime (`devPort: null`)

**Example:** HelmDev (Electron app using Vercel staging deployment)

1. Project is configured with `devPort: null` because there's no localhost server
2. All E2E testing agents skip tests entirely with "no local runtime" message
3. The app IS testable — just against the deployed staging URL
4. **Result:** No E2E coverage, no verification, no automated testing at all

### Dynamic Preview Environments

**Example:** Vercel preview deployments

1. Every PR gets a unique preview URL (`https://my-app-abc123.vercel.app`)
2. These URLs aren't in `project.json` (they're dynamic)
3. No way to tell agents "test against this URL"
4. **Result:** Can't verify PRs before merge

### Supabase Preview Branches

**Example:** Feature branch with database preview

1. Supabase creates preview branches with different connection strings
2. Tests need to run against preview database + preview app URL
3. No configuration for this pattern
4. **Result:** Can't test database migrations on previews

### Current Agent Hardcoding

**Problem:** 21+ occurrences in agents building `http://localhost:${devPort}`:

```typescript
// Current pattern (hardcoded everywhere)
baseURL: `http://localhost:${DEV_PORT}`
```

Even when `environments.staging.url` exists in project.json, agents don't use it.

---

## Goals

1. **Test environment selection** — Allow agents to target localhost, staging, or preview URLs
2. **Dynamic preview URL detection** — Automatically detect Vercel/Netlify preview URLs from environment
3. **Explicit configuration** — Allow `testBaseUrl` override in project.json or projects.json
4. **Fallback chain** — Clear priority order: explicit config → preview URL → staging → localhost
5. **Database environment awareness** — Handle Supabase preview branches and other database previews
6. **Agent refactoring** — Replace hardcoded `localhost:${devPort}` with centralized URL resolution
7. **No-runtime projects** — Enable E2E testing for `devPort: null` projects via deployed URLs

---

## Non-Goals

- Production testing (too risky, requires separate safety PRD)
- Changing how `devPort: null` is assigned (that's project-bootstrap's job)
- Multi-environment test runs in a single session
- CI/CD pipeline integration (that's a deployment concern)

---

## User Stories

### Story 1: Centralized Test URL Resolution

**As a** toolkit maintainer  
**I want** a single function that resolves the test base URL  
**So that** all agents use consistent URL resolution logic

**Acceptance Criteria:**
- [ ] Create `resolveTestBaseUrl(projectPath)` helper in a shared location
- [ ] Resolution order: `testBaseUrl` config → detected preview URL → `environments.staging.url` → `localhost:${devPort}`
- [ ] Returns `null` if no URL can be resolved (project cannot be tested)
- [ ] All 21+ agent locations updated to use this helper instead of hardcoded localhost
- [ ] Helper logs which source the URL came from for debugging

### Story 2: Preview URL Detection

**As a** developer running tests in a Vercel preview environment  
**I want** agents to automatically detect the preview URL from environment variables  
**So that** tests run against the preview without manual configuration

**Acceptance Criteria:**
- [ ] Detect Vercel preview: `VERCEL_URL` or `NEXT_PUBLIC_VERCEL_URL`
- [ ] Detect Netlify preview: `DEPLOY_URL` or `DEPLOY_PRIME_URL`
- [ ] Detect Railway preview: `RAILWAY_PUBLIC_DOMAIN`
- [ ] Detect Render preview: `RENDER_EXTERNAL_URL`
- [ ] Detected URLs are prefixed with `https://` if missing
- [ ] Preview URL takes precedence over staging URL
- [ ] Detection logged: "Using Vercel preview URL: https://..."

### Story 3: Explicit Test URL Configuration

**As a** developer with a non-standard deployment  
**I want** to explicitly configure the test URL  
**So that** agents test against my custom staging environment

**Acceptance Criteria:**
- [ ] Add `testBaseUrl` to projects.json registry (per-project)
- [ ] Add `agents.verification.testBaseUrl` to project.json (alternative location)
- [ ] projects.json takes precedence over project.json
- [ ] URL must include protocol (`https://` or `http://`)
- [ ] Validation error if URL format is invalid

### Story 4: No-Runtime Project Testing

**As a** developer with a `devPort: null` project (e.g., Electron using remote staging)  
**I want** agents to test against the staging URL instead of skipping E2E entirely  
**So that** I get E2E coverage even without a local dev server

**Acceptance Criteria:**
- [ ] When `devPort: null`, agents check for staging/preview URL before skipping
- [ ] If URL available, run tests against that URL
- [ ] If no URL available, show "Cannot test: no devPort and no staging URL configured"
- [ ] Remove "skipping E2E" messages when URL resolution succeeds
- [ ] Add "testing against staging" or "testing against preview" messages

### Story 5: Database Preview Branch Support

**As a** developer using Supabase preview branches  
**I want** agents to use the preview database connection  
**So that** I can test migrations and data changes on the preview

**Acceptance Criteria:**
- [ ] Detect Supabase preview: `SUPABASE_URL` that differs from project.json default
- [ ] Detect preview branches via `SUPABASE_BRANCH_ID` or URL pattern
- [ ] When preview detected, log: "Using Supabase preview branch: [branch-name]"
- [ ] No code changes needed for this — environment variables handle it
- [ ] Document the pattern in skills or agent instructions

### Story 6: Health Check for Remote URLs

**As a** developer testing against a staging URL  
**I want** agents to verify the remote server is accessible before running tests  
**So that** I get clear errors if staging is down

**Acceptance Criteria:**
- [ ] Before testing against non-localhost URL, perform health check
- [ ] Use `devServer.healthCheck` path if configured, else `/`
- [ ] Timeout: 10 seconds for remote URLs (vs 30 for local)
- [ ] If health check fails, show: "Staging server not responding at [url]"
- [ ] Suggest: "Check deployment status or use localhost with `devPort`"

### Story 7: Proactive CLI Usage for Environment Operations

**As a** developer working with deployed environments  
**I want** Builder to proactively use available CLIs (Vercel, Supabase, GitHub, etc.)  
**So that** I don't have to remind it that it has CLI access

**Acceptance Criteria:**
- [ ] Builder checks `availableCLIs` before any environment-related operation
- [ ] Proactive CLI triggers documented for each CLI:
  - **Vercel:** deployment status, preview URL lookup, environment variables, logs
  - **Supabase:** preview branch status, database migrations, connection strings
  - **GitHub:** PR status, check runs, deployment status
  - **Netlify/Fly/Railway:** deployment status, logs
- [ ] When health check fails for remote URL, Builder uses CLI to check deployment status
- [ ] When `devPort: null` and no URL configured, Builder uses CLI to find deployment URL
- [ ] "I have CLI access" reminders removed — replaced with proactive usage patterns
- [ ] CLI capabilities table expanded with specific use-case triggers

---

## Technical Specification

### URL Resolution Priority

```
resolveTestBaseUrl(projectPath):
    1. projects.json → projects[id].testBaseUrl (explicit override)
    2. project.json → agents.verification.testBaseUrl (explicit override)
    3. Environment → VERCEL_URL, DEPLOY_URL, etc. (preview detection)
    4. project.json → environments.staging.url (configured staging)
    5. projects.json → devPort → http://localhost:${devPort} (local dev)
    6. null (cannot resolve — project untestable)
```

### Environment Variable Detection

| Platform | Environment Variables | Example |
|----------|----------------------|---------|
| Vercel | `VERCEL_URL`, `NEXT_PUBLIC_VERCEL_URL` | `my-app-abc123.vercel.app` |
| Netlify | `DEPLOY_URL`, `DEPLOY_PRIME_URL` | `deploy-preview-42--my-app.netlify.app` |
| Railway | `RAILWAY_PUBLIC_DOMAIN` | `my-app-production.up.railway.app` |
| Render | `RENDER_EXTERNAL_URL` | `my-app.onrender.com` |
| Fly.io | `FLY_APP_NAME` + `.fly.dev` | `my-app.fly.dev` |

### Configuration Schema Changes

**projects.json (per-project registry):**

```json
{
  "projects": [
    {
      "id": "my-app",
      "path": "/Users/mark/code/my-app",
      "devPort": null,
      "testBaseUrl": "https://staging.my-app.com"
    }
  ]
}
```

**project.json (agents section):**

```json
{
  "agents": {
    "verification": {
      "mode": "playwright-required",
      "testBaseUrl": "https://staging.my-app.com"
    }
  }
}
```

### Helper Function Location

Create in a shared skill or data file that agents can reference:

**Option A:** New skill `skills/test-url-resolution/SKILL.md`

```typescript
// Pseudocode for URL resolution
function resolveTestBaseUrl(projectPath: string): string | null {
  // 1. Check explicit config
  const registryUrl = getFromProjectsRegistry(projectPath, 'testBaseUrl');
  if (registryUrl) return registryUrl;
  
  const projectUrl = getFromProjectJson(projectPath, 'agents.verification.testBaseUrl');
  if (projectUrl) return projectUrl;
  
  // 2. Check preview environment
  const previewUrl = detectPreviewUrl();
  if (previewUrl) return previewUrl;
  
  // 3. Check staging config
  const stagingUrl = getFromProjectJson(projectPath, 'environments.staging.url');
  if (stagingUrl) return stagingUrl;
  
  // 4. Fall back to localhost
  const devPort = getFromProjectsRegistry(projectPath, 'devPort');
  if (devPort) return `http://localhost:${devPort}`;
  
  // 5. Cannot resolve
  return null;
}
```

**Option B:** Inline in each agent (less DRY but simpler)

Each agent includes the resolution logic in its startup section. Use this if agents can't easily share code.

### Agent Updates Required

Update these agents/skills to use centralized resolution:

| File | Current Pattern | Change To |
|------|-----------------|-----------|
| `agents/e2e-playwright.md` | `http://localhost:${DEV_PORT}` | `resolveTestBaseUrl()` |
| `agents/playwright-dev.md` | `http://localhost:${DEV_PORT}` | `resolveTestBaseUrl()` |
| `agents/qa-browser-tester.md` | `http://localhost:{devPort}` | `resolveTestBaseUrl()` |
| `agents/e2e-reviewer.md` | `http://localhost:{devPort}` | `resolveTestBaseUrl()` |
| `agents/screenshot-maintainer.md` | `http://localhost:{devPort}` | `resolveTestBaseUrl()` |
| `agents/tester.md` | `http://localhost:3000` | `resolveTestBaseUrl()` |
| `agents/support-article-writer.md` | `http://localhost:${DEV_PORT}` | `resolveTestBaseUrl()` |
| `skills/test-flow/SKILL.md` | `http://localhost:${DEV_PORT}` | `resolveTestBaseUrl()` |
| `skills/auth-headless/SKILL.md` | `baseUrl` parameter | Already parameterized ✓ |
| `templates/coding-playwright.md` | `http://localhost:${DEV_PORT}` | `resolveTestBaseUrl()` |

### Sample Output Messages

**Using preview URL:**
```
🌐 Test environment: Vercel preview
   URL: https://my-app-abc123.vercel.app
   Source: VERCEL_URL environment variable
```

**Using staging URL:**
```
🌐 Test environment: Staging
   URL: https://staging.my-app.com
   Source: environments.staging.url in project.json
```

**Using explicit override:**
```
🌐 Test environment: Custom
   URL: https://custom-test.example.com
   Source: testBaseUrl in projects.json
```

**Cannot resolve (error):**
```
❌ Cannot determine test URL

   This project has:
   - devPort: null (no local server)
   - No staging URL configured
   - No preview environment detected

   Options:
    1. Add testBaseUrl to projects.json
    2. Add environments.staging.url to project.json
    3. Set devPort if you have a local server
```

### Proactive CLI Trigger Patterns

Builder currently has passive CLI detection (lines 518-564) but often "forgets" to use CLIs. This section defines **specific triggers** for when Builder MUST check CLIs.

| Trigger Situation | CLI to Use | Command Pattern | What to Extract |
|-------------------|------------|-----------------|-----------------|
| **Health check fails for remote URL** | Vercel/Netlify/Fly | `vercel inspect [url]` or `vercel ls` | Deployment status, error logs |
| **`devPort: null` with no testBaseUrl** | Vercel/Netlify/Fly | `vercel ls --prod` or `netlify status` | Production/staging URL |
| **Need preview URL for PR** | GitHub + Vercel | `gh pr view --json deployments` | Preview deployment URL |
| **Database migration test fails** | Supabase | `supabase db diff` | Migration status, schema drift |
| **Auth test fails on preview** | Supabase | `supabase branches list` | Preview branch connection string |
| **PR checks failing** | GitHub | `gh pr checks` | Which checks failed, logs |
| **Deployment status unknown** | GitHub | `gh api repos/{owner}/{repo}/deployments` | Active deployments |

**Builder Decision Points:**

```
When resolving test URL:
  IF config lookup returns null AND availableCLIs includes "vercel":
    → Run `vercel ls` to find deployment URL
    → Use production URL as fallback

When health check fails:
  IF remote URL unreachable AND availableCLIs includes deployment CLI:
    → Run deployment status check (vercel/netlify/fly)
    → Report: "Staging is down — last deployment failed at [time]"

When database tests fail unexpectedly:
  IF availableCLIs includes "supabase":
    → Run `supabase branches list` to check for preview branch
    → Run `supabase db diff` to check for uncommitted migrations
```

---

## Implementation Plan

### Phase 1: URL Resolution Logic

**Files to create/modify:**
- Create `data/test-url-resolution.md` with resolution algorithm
- OR create `skills/test-url-resolution/SKILL.md` if more complex

**Deliverables:**
- [ ] Document URL resolution priority order
- [ ] Document environment variable detection
- [ ] Provide copy-pasteable resolution logic for agents

### Phase 2: Schema Updates

**Files to modify:**
- `schemas/project.schema.json` — Add `agents.verification.testBaseUrl`
- Document `testBaseUrl` field in projects.json (already allows arbitrary fields)

**Deliverables:**
- [ ] Schema updated with `testBaseUrl` field
- [ ] Validation for URL format (must include protocol)
- [ ] Documentation in schema description

### Phase 3: Agent Refactoring (Core Agents)

**Files to modify:**
- `agents/e2e-playwright.md`
- `agents/playwright-dev.md`
- `agents/tester.md`

**Deliverables:**
- [ ] Replace hardcoded localhost with resolution logic
- [ ] Add environment variable detection
- [ ] Update "devPort: null" skip logic to check for fallback URLs
- [ ] Add test environment logging

### Phase 4: Agent Refactoring (Secondary Agents)

**Files to modify:**
- `agents/qa-browser-tester.md`
- `agents/e2e-reviewer.md`
- `agents/screenshot-maintainer.md`
- `agents/support-article-writer.md`

**Deliverables:**
- [ ] Same changes as Phase 3 for remaining agents

### Phase 5: Skills & Templates

**Files to modify:**
- `skills/test-flow/SKILL.md`
- `templates/coding-playwright.md`

**Deliverables:**
- [ ] Update test-flow skill with resolution logic
- [ ] Update Playwright template with configurable baseURL

### Phase 6: Health Check for Remote URLs

**Files to modify:**
- `skills/start-dev-server/SKILL.md` — Add remote health check variant

**Deliverables:**
- [ ] Health check function for remote URLs
- [ ] Shorter timeout for remote (10s vs 30s)
- [ ] Clear error messages for unreachable staging

### Phase 7: Proactive CLI Triggers

**Files to modify:**
- `agents/builder.md` — Expand CLI capabilities table with proactive triggers

**Deliverables:**
- [ ] Add "When to use" column to CLI capabilities table
- [ ] Define specific trigger patterns for each CLI:
  - **Vercel CLI:** Health check fails → check deployment status; `devPort: null` → look up deployment URL; preview URL needed → `vercel inspect`
  - **Supabase CLI:** Database test fails → check preview branch status; migration needed → `supabase db diff`
  - **GitHub CLI:** PR verification → check status checks; deployment status → `gh api deployments`
  - **Netlify/Fly/Railway:** Same patterns as Vercel for deployment status/logs
- [ ] Replace passive "remember to check availableCLIs" with active decision points
- [ ] Add CLI fallback to URL resolution (when config lookup fails, try CLI)

---

## Open Questions

*All questions resolved — see Resolved Questions below.*

---

## Resolved Questions

| Question | Resolution |
|----------|------------|
| Should preview URL detection be opt-in? | **Always auto-detect.** Check for preview environment variables regardless of `devPort` setting. Support multiple providers (Vercel, Netlify, Railway, Render, Fly, custom). |
| Support multiple test environments in one session? | **No.** One environment per session. Out of scope. |
| How to handle auth differences between environments? | **Use existing `authentication` config.** Test users should work across environments. No per-environment auth config needed. |
| Should we add a CLI flag for test URL? | **Out of scope.** Use environment variables or config files. |
| Builder forgets it has CLI access? | **Add proactive CLI triggers.** Instead of passive "check availableCLIs", add specific triggers telling Builder WHEN to use each CLI (Story 7). |

---

## Success Metrics

- Projects with `devPort: null` can run E2E tests (currently: 0% coverage)
- Agents correctly resolve URLs from environment variables
- No more hardcoded `localhost:${devPort}` in agents (currently: 21+ occurrences)
- Clear error messages when URL cannot be resolved

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-03-03 | @toolkit | Initial draft based on HelmDev non-localhost testing analysis |
| 2026-03-03 | @toolkit | Added Story 7 (Proactive CLI Usage), Phase 7, CLI trigger patterns; resolved all open questions; status → READY |
