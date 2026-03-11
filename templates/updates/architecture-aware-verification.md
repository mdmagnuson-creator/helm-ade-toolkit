# Configure Architecture-Aware Verification & Auth Acquisition

This update ensures every project has proper authentication acquisition configured and desktop/Electron apps have correct `webContent` settings for automated verification.

## What to do

This is an **analyze-first update**. Builder performs a complete autonomous analysis of the project, then presents a single comprehensive report with proposed configuration for the user to review. Do NOT ask questions one at a time — gather all information first, then present everything at once.

### Phase 1: Autonomous Analysis (no user interaction)

Read and analyze the following **before showing anything to the user**:

**1a. Authentication state:**
- Read `docs/project.json` → `authentication`
- Check if `authentication` block exists
- Check if `authentication.acquisition` exists and is valid (has `description`, `steps[]`, `fallbackToUI`)
- Check if `authentication.headless` exists and what method it uses

**1b. Auth provider detection:**
- Read `docs/project.json` → `authentication.provider` (e.g., supabase, nextauth, custom)
- Read `docs/project.json` → `authentication.method` (e.g., email-password, passwordless-otp)
- If no auth config, check `capabilities.authentication` — if true, auth is needed but unconfigured

**1c. CLI tool discovery:**
- Check `package.json` → `scripts` for auth-related commands (e.g., `auth:token`, `test:auth`, `cli`)
- Check for CLI entry points in `bin/`, `cli/`, or `src/cli/`
- Check for test utility scripts that generate tokens
- Note any found CLI tools and their likely purpose

**1d. App architecture:**
- Read `docs/project.json` → `apps[]`
- For each app: note `type`, `framework`, `webContent` (if set)
- For desktop apps: check if dev config uses Vite dev server URL (suggests `remote`) or file:// protocol (suggests `bundled`)
- Check `electron-builder.yml`, `forge.config.*`, `electron.vite.config.*` for architecture clues
- Check main process entry point for `loadURL(http://localhost:...)` vs `loadFile(...)` patterns

**1e. Existing postChangeWorkflow:**
- Check if `docs/project.json` → `postChangeWorkflow` already exists

### Phase 2: Present Full Analysis (single output)

Present ALL findings in one dashboard. Include what you found, what you propose, and what you need the user to confirm:

```
═══════════════════════════════════════════════════════════════════════
         ARCHITECTURE-AWARE VERIFICATION — FULL ANALYSIS
═══════════════════════════════════════════════════════════════════════

PROJECT: {project name}

─── AUTHENTICATION ────────────────────────────────────────────────────

  Provider:     {provider} ({method})
  Auth config:  {exists/missing}
  Acquisition:  {exists/missing/incomplete}
  Headless:     {method or "not configured"}

  {If CLI tools found:}
  CLI tools found:
    • {script name} — {what it likely does}

  Proposed authentication.acquisition:
    description: "{proposed description}"
    steps:
      1. {proposed step}
      2. {proposed step}
    fallbackToUI: {true/false}

  {If CLI found, also propose:}
  Proposed authentication.headless:
    method: "cli"
    command: "{proposed command}"
    responseFormat: {json/text}
    tokenPath: "{proposed path}"
    sessionStorage: {cookie/localStorage}

─── APP ARCHITECTURE ──────────────────────────────────────────────────

  {For each app:}
  App: {name} ({type}, {framework})
    webContent:  {current value or "not set"}
    Evidence:    {what you found — e.g., "main.ts loads http://localhost:5173"}
    Proposed:    webContent: "{proposed value}"
    Pipeline:    {inferred verification pipeline}

  {If no desktop apps:}
  No desktop apps — web-only verification pipeline applies.

─── VERIFICATION PIPELINE ─────────────────────────────────────────────

  Inferred pipeline: {pipeline steps}
  postChangeWorkflow: {auto-inferred / already configured / custom needed}

═══════════════════════════════════════════════════════════════════════

Please review:
  [A] Looks good — apply this configuration
  [E] I need to edit some values first (tell me what to change)

> _
═══════════════════════════════════════════════════════════════════════
```

**Important:** The proposed values should be Builder's best inference based on the codebase analysis. The user reviews and either approves or requests edits. Do NOT leave blank fields for the user to fill in — propose concrete values.

### Phase 3: Apply Configuration

After user approves (or provides edits):

1. Write all configuration to `docs/project.json` in a single update
2. Validate the written config:
   ```bash
   jq '.authentication.acquisition' docs/project.json
   jq '.apps[] | {name, type, webContent}' docs/project.json
   ```
3. Show completion summary:

```
═══════════════════════════════════════════════════════════════════════
             VERIFICATION CONFIGURATION COMPLETE
═══════════════════════════════════════════════════════════════════════

Configured:
  ✅ authentication.acquisition — agent-readable auth steps
  {✅ authentication.headless.method: "cli" — if applicable}
  {✅ apps[N].webContent: "value" — for each desktop app}

Verification pipeline for this project:
  {full pipeline description}

═══════════════════════════════════════════════════════════════════════
```

### Edge Cases

**No auth at all (`capabilities.authentication` is false or missing):**
- Skip auth acquisition entirely
- Only configure app architecture if desktop apps exist
- If nothing to configure, mark update as applied with note "No auth, no desktop apps — nothing to configure"

**Auth exists but no `capabilities.authentication`:**
- Still configure acquisition (the auth config proves auth is used)

**Multiple desktop apps:**
- Analyze each independently — they may have different `webContent` values

**User says [E] to edit:**
- Ask what specifically needs to change
- Re-present the updated proposal for confirmation
- Do NOT revert to step-by-step questioning

## Files affected

- `docs/project.json`

## Why

Builder needs to verify code changes actually work in the running application before committing. This requires:

1. **Auth acquisition** — Playwright can't verify authenticated UI without logging in. Every project needs documented auth steps, whether automated (CLI) or manual (agent-readable steps).

2. **App architecture awareness** — Desktop/Electron apps require different verification than web apps. `webContent` tells Builder whether to rebuild+relaunch (bundled) or just ensure the Electron process is running (remote/HMR).

Without this configuration, Builder either skips verification entirely or attempts browser-based verification on Electron-only apps (which doesn't work).

## Verification

```bash
# Auth acquisition configured
jq '.authentication.acquisition.steps | length' docs/project.json
# Expected: > 0

# For desktop apps: webContent configured
jq '.apps[] | select(.type == "desktop") | .webContent' docs/project.json
# Expected: "bundled", "remote", or "hybrid" for each desktop app

# Optional: CLI headless method
jq '.authentication.headless.method' docs/project.json
# Expected: "cli" (if project has CLI auth), or existing method
```
