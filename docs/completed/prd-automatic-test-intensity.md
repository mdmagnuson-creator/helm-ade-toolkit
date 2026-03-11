# PRD: Automatic Test Activity Selection

## Introduction

Currently, the test flow requires users to manually select a "rigor profile" at PRD start (rapid/standard/strict/compliance). In practice, users always choose "compliance" because lower settings don't catch enough bugs. This PRD proposes **fully automatic test activity selection** — the system determines exactly which testing agents and checks to run based on what changed. **No prompts, no selection, no user interaction required.**

## Key Principle: Zero User Interaction

**This system is fully automatic.** The user does not:
- Select a rigor level before starting work
- Confirm which tests to run
- Approve the test plan
- Choose between speed and quality

The system analyzes changed files, detects code patterns, checks hotspots, and determines the exact activities to run — then runs them. The user sees a brief summary of what's running and why, but is never asked to approve or modify it.

**Works in both modes:**
- **PRD mode:** Activities resolve per-task based on files changed in that task
- **Ad-hoc mode:** Activities resolve based on files changed in the current request

## Problem Statement

1. **Manual selection is a false choice** — Users always pick "compliance" because lower levels miss bugs
2. **Abstract levels obscure what actually runs** — "high intensity" doesn't tell you which agents fire
3. **One-size-fits-all is wasteful** — A typo fix doesn't need security review; a payment change does
4. **Signals exist but aren't leveraged** — File types, code patterns, and past failures could drive precise decisions
5. **Prompts slow down work** — Any selection step interrupts flow

The goal is: **Run exactly the right testing activities for each change — no more, no less — without asking.**

## Goals

- **Zero prompts:** No rigor selection, no confirmation dialogs, no "proceed?" questions
- **Fully automatic:** Analyze changes → resolve activities → run them
- **Works everywhere:** PRD mode and ad-hoc mode, same behavior
- **Transparent but non-blocking:** Show what's running and why (informational only)
- **Comprehensive by default:** Risky changes get full coverage automatically
- **Smart skipping:** Genuinely low-risk changes skip unnecessary work
- **Near-zero bug escape:** Catch issues before they reach users

## Non-Goals

- Adding new test frameworks or tools
- Changing how individual testing agents work internally
- Removing escape hatches (force commands remain for power users, but are never required)
- Changing E2E deferral mechanics (immediate vs deferred timing is part of this system)
- Requiring any user input for test selection

## Current State Analysis

### Available Testing Activities

**Baseline (Always Run):**
| Activity | Agent/Command | Purpose |
|----------|---------------|---------|
| Typecheck | `npm run typecheck` | Type safety |
| Lint | `npm run lint` | Code style, basic errors |

**Unit Test Generation:**
| Activity | Agent | When Relevant |
|----------|-------|---------------|
| Jest tests | `@jest-tester` | TypeScript/JavaScript backend |
| React tests | `@react-tester` | React components (`.tsx`) |
| Go tests | `@go-tester` | Go files |

**E2E Testing (Two-Phase):**
| Phase | Agent | Purpose |
|-------|-------|---------|
| 1. Review & Identify | `@e2e-reviewer` | Analyzes changes, identifies affected UI areas, navigates app, creates `e2e-areas.json` manifest |
| 2. Write & Run | `@e2e-playwright` | Reads manifest, writes Playwright test files, runs them against dev server |

| Supporting | Agent | Purpose |
|------------|-------|---------|
| QA browser tests | `@qa-browser-tester` | Writes Playwright tests for specific QA findings |

**Code Review (Critics):**
| Activity | Agent | When Relevant |
|----------|-------|---------------|
| General review | `@critic` | Routes to specialists |
| Frontend review | `@frontend-critic` | React/Vue/etc. components |
| Backend TS review | `@backend-critic-ts` | Express, Lambda, etc. |
| Backend Go review | `@backend-critic-go` | Go services |
| API design review | `@api-critic` | API routes, endpoints |
| Security review | `@security-critic` | Auth, crypto, secrets |
| Exploit attempt | `@exploit-critic` | Adversarial security |
| Network review | `@network-critic` | HTTP clients, retries |
| AWS review | `@backend-aws-critic` | AWS SDK usage |

**Quality Checks:**
| Activity | Agent | When Relevant |
|----------|-------|---------------|
| Visual/a11y/perf | `@quality-critic` | UI changes |
| Design system | `@aesthetic-critic` | Styling changes |
| Tailwind patterns | `@tailwind-critic` | Tailwind usage |

**Exploratory QA:**
| Activity | Agent | When Relevant |
|----------|-------|---------------|
| Adversarial exploration | `@qa-explorer` | Complex user flows |

### Problems with Current Approach

1. **Four levels (critical/high/medium/low) are arbitrary** — Why should "high" include E2E but "medium" not?
2. **Levels hide what actually runs** — Users don't know which agents fire
3. **All-or-nothing escalation** — Changing one auth file escalates EVERYTHING to critical
4. **Critics aren't selectively applied** — `@security-critic` should run for auth changes, not UI tweaks

## Proposed Solution: Signal-Based Activity Selection

### Core Principle

**Each signal activates specific testing activities. Activities are additive, not levels.**

Instead of:
```
auth file changed → escalate to "critical" level → run everything
```

We do:
```
auth file changed → add: @security-critic, @exploit-critic, E2E-immediate
component file changed → add: @react-tester, @frontend-critic, @aesthetic-critic
```

### Activity Categories

**Category A: Baseline (Always)**
- Typecheck
- Lint

**Category B: Unit Tests (Per File Type)**
- `@jest-tester` for `.ts` backend files
- `@react-tester` for `.tsx` component files
- `@go-tester` for `.go` files

**Category C: Critics (Per Signal)**
- Selected based on file type and patterns detected

**Category D: E2E Tests (Two-Phase Process)**

E2E testing is a two-phase process that thoroughly tests the UI:

| Phase | Agent | What It Does |
|-------|-------|--------------|
| **Phase 1: Review** | `@e2e-reviewer` | Analyzes changed files → identifies all affected UI areas → navigates to each area in the running app → takes screenshots → creates `docs/e2e-areas.json` manifest |
| **Phase 2: Write & Run** | `@e2e-playwright` | Reads the manifest → writes comprehensive Playwright test files for each area → runs them against the dev server → reports failures |

**Timing:**
- `immediate`: Both phases run NOW, before task is marked complete
- `deferred`: Phases run at PRD completion (tests are queued)
- `skip`: No E2E (docs-only changes)

**Category E: Quality Checks**
- `@quality-critic` for UI changes
- `@aesthetic-critic` for styling changes

**Category F: Exploratory QA**
- `@qa-explorer` for complex multi-step flows

### Signal → Activity Mapping

Stored in `~/.config/opencode/data/test-activity-rules.json`:

```json
{
  "version": 1,
  "defaults": {
    "e2e": "deferred",
    "unit": true
  },
  "filePatterns": {
    "**/auth/**": {
      "critics": ["security-critic", "exploit-critic"],
      "e2e": "immediate",
      "unit": true
    },
    "**/payment/**": {
      "critics": ["security-critic", "exploit-critic", "backend-critic-ts"],
      "e2e": "immediate",
      "quality": true,
      "unit": true
    },
    "**/*.tsx": {
      "critics": ["frontend-critic"],
      "unit": "react-tester",
      "e2e": "deferred",
      "quality": ["aesthetic-critic"]
    },
    "**/*.jsx": {
      "critics": ["frontend-critic"],
      "unit": "react-tester",
      "e2e": "deferred",
      "quality": ["aesthetic-critic"]
    },
    "**/pages/**": {
      "e2e": "deferred",
      "quality": ["aesthetic-critic"]
    },
    "**/app/**/*.tsx": {
      "e2e": "deferred",
      "quality": ["aesthetic-critic"]
    },
    "**/components/**": {
      "e2e": "deferred",
      "quality": ["aesthetic-critic"]
    },
    "**/api/**": {
      "critics": ["api-critic", "backend-critic-ts"],
      "e2e": "immediate",
      "unit": true
    },
    "**/middleware/**": {
      "critics": ["security-critic", "network-critic"],
      "e2e": "immediate",
      "unit": true
    },
    "**/*.md": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Documentation — no runtime impact"
    },
    "**/*.d.ts": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Type definitions — compile-time only"
    },
    "**/types.ts": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Type definitions — compile-time only (verify no runtime exports)"
    },
    "**/*.test.ts": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Test files — tests test themselves"
    },
    "**/*.spec.ts": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Test files — tests test themselves"
    },
    "**/__tests__/**": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Test files — tests test themselves"
    },
    "**/.eslintrc*": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Dev tooling config — no runtime impact"
    },
    "**/.prettierrc*": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Dev tooling config — no runtime impact"
    },
    "**/tsconfig*.json": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Dev tooling config — no runtime impact"
    },
    "**/.gitignore": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "Git config — no runtime impact"
    },
    "**/.github/**": {
      "critics": [],
      "unit": false,
      "e2e": "skip",
      "reason": "CI config — no runtime impact"
    },
    "**/utils/**": {
      "critics": [],
      "unit": true,
      "e2e": "deferred",
      "e2eScope": "dependents",
      "reason": "Utils affect runtime — smoke test dependents"
    },
    "**/lib/**": {
      "critics": [],
      "unit": true,
      "e2e": "deferred",
      "e2eScope": "dependents",
      "reason": "Lib code affects runtime — smoke test dependents"
    },
    "**/hooks/**": {
      "critics": ["frontend-critic"],
      "unit": "react-tester",
      "e2e": "deferred"
    },
    "**/services/**": {
      "critics": ["backend-critic-ts", "network-critic"],
      "unit": true,
      "e2e": "immediate"
    },
    "**/db/**": {
      "critics": ["backend-critic-ts"],
      "unit": true,
      "e2e": "immediate"
    },
    "**/prisma/**": {
      "critics": ["backend-critic-ts"],
      "e2e": "immediate"
    },
    "**/schema.prisma": {
      "e2e": "immediate"
    },
    "**/*.css": {
      "e2e": "deferred",
      "quality": ["aesthetic-critic", "tailwind-critic"]
    },
    "**/*.scss": {
      "e2e": "deferred",
      "quality": ["aesthetic-critic"]
    }
  },
  "codePatterns": {
    "prisma\\.(create|update|delete|upsert)": {
      "critics": ["backend-critic-ts"],
      "unit": true
    },
    "(fetch|axios).*(/auth|/login|/session)": {
      "critics": ["security-critic", "network-critic"],
      "e2e": "immediate"
    },
    "crypto\\.": {
      "critics": ["security-critic", "exploit-critic"]
    },
    "eval\\(|Function\\(": {
      "critics": ["security-critic", "exploit-critic"]
    },
    "child_process|exec\\(|spawn\\(": {
      "critics": ["security-critic", "exploit-critic"]
    },
    "fs\\.(write|unlink|rm)": {
      "critics": ["security-critic"]
    },
    "useState|useReducer|zustand|redux": {
      "critics": ["frontend-critic"],
      "unit": "react-tester"
    }
  },
  "crossCuttingRules": {
    "multipleDirectories": {
      "threshold": 3,
      "add": {
        "critics": ["oddball-critic"]
      }
    },
    "sharedModuleTouch": {
      "paths": ["**/shared/**", "**/common/**", "**/lib/**"],
      "add": {
        "critics": ["dx-critic"]
      }
    }
  }
}
```

### Activity Resolution Algorithm

```
function resolveActivities(changedFiles, diffContent, projectContext):
  # Check if project has UI — if not, skip all Playwright
  if not projectContext.capabilities.ui:
    return {
      baseline: ["typecheck", "lint"],
      unit: resolveUnitTesters(changedFiles),
      critics: resolveCritics(changedFiles),
      e2e: "skip-no-ui",
      quality: Set(),
      dependentSmoke: []
    }
  
  activities = {
    baseline: ["typecheck", "lint"],  # Always
    unit: Set(),
    critics: Set(),
    e2e: "deferred",  # or "immediate" or "skip"
    e2eAreas: [],     # Direct areas to test
    dependentSmoke: [], # Files to find dependents for
    quality: Set()
  }
  
  for file in changedFiles:
    # Match file patterns
    for pattern, rules in filePatterns:
      if matches(file, pattern):
        activities.critics.addAll(rules.critics)
        
        if rules.unit:
          activities.unit.add(resolveUnitTester(file, rules.unit))
        
        if rules.e2e == "skip":
          continue  # Type defs, tests, docs — no Playwright
        
        if rules.e2e == "immediate":
          activities.e2e = "immediate"
          activities.e2eAreas.add(file)
        
        if rules.e2e == "deferred":
          activities.e2eAreas.add(file)
        
        # If e2eScope is "dependents", also smoke test importers
        if rules.e2eScope == "dependents":
          activities.dependentSmoke.add(file)
        
        if rules.quality:
          activities.quality.addAll(rules.quality)
  
  # Match code patterns in diff
  for pattern, rules in codePatterns:
    if regex_matches(diffContent, pattern):
      activities.critics.addAll(rules.critics)
      if rules.e2e == "immediate":
        activities.e2e = "immediate"
  
  # Check cross-cutting rules
  if countDistinctDirectories(changedFiles) >= 3:
    activities.critics.add("oddball-critic")
  
  if touchesSharedModule(changedFiles):
    activities.critics.add("dx-critic")
  
  # Check hotspots (past failures)
  for file in changedFiles:
    if file in projectContext.testDebt.hotspots:
      activities.critics.addAll(hotspots[file].addedCritics)
      if hotspots[file].forceE2E:
        activities.e2e = "immediate"
  
  # Resolve dependent smoke tests
  # For each file marked for dependent testing, find all importers
  for file in activities.dependentSmoke:
    dependents = findFilesImporting(file, projectContext)
    for dependent in dependents:
      # Map dependent to routes/pages
      routes = mapFileToRoutes(dependent, projectContext)
      activities.e2eAreas.addAll(routes)
  
  # Dedupe and return
  return activities


function findFilesImporting(file, projectContext):
  # Use grep/ripgrep to find all files that import this file
  # Returns list of file paths
  importPattern = extractImportableName(file)
  return grep("import.*" + importPattern, projectContext.srcDirs)


function mapFileToRoutes(file, projectContext):
  # Map a component/hook file to the routes/pages that use it
  # - If file is a page (in pages/, app/), return its route
  # - If file is a component, recursively find pages using it
  # - Return list of routes like ["/dashboard", "/settings"]
  ...
```

### E2E Timing Rules

**Core Rule: If the project has a UI, any change that affects runtime behavior gets Playwright tests.**

This is NOT about "user-facing" vs "backend." It's about runtime impact:
- Does this code execute when the app runs? → Playwright tests
- Is it compile-time only, tests, or docs? → No Playwright

### Skip Playwright Entirely (No UI Project)

If `project.json` → `capabilities.ui: false`, skip all Playwright:
- CLI tools, pure libraries, backend-only services
- Use unit tests and API tests (supertest, httptest) instead

### Skip Playwright for These File Types

Even in UI projects, these never need Playwright:

| File Type | Examples | Why |
|-----------|----------|-----|
| Type definitions | `*.d.ts`, `types.ts` (interfaces only) | Compile-time, no runtime |
| Test files | `*.test.ts`, `*.spec.ts` | Tests test themselves |
| Documentation | `*.md`, `README`, `docs/` | No runtime |
| Dev config | `.eslintrc`, `.prettierrc`, `tsconfig.json` | Dev-time only |
| Git/CI | `.gitignore`, `.github/workflows/` | No runtime |

### Immediate vs Deferred (UI Projects)

For everything else, the question is WHEN:

| Signal | E2E Timing | What to Test |
|--------|------------|--------------|
| Auth code (any layer) | **Immediate** | Login, logout, session, protected routes |
| Payment code (any layer) | **Immediate** | Checkout flow, validation, error states |
| API routes | **Immediate** | UI flows that call this endpoint |
| Middleware | **Immediate** | User requests affected by the middleware |
| Database/Prisma changes | **Immediate** | CRUD flows for affected models |
| React components | **Deferred** | Pages using the component |
| Pages/routes | **Deferred** | The page itself |
| Hooks | **Deferred** | Components using the hook |
| Utilities | **Deferred** | Smoke test dependents |
| CSS/styling | **Deferred** | Visual regression |
| Hotspot file | **Immediate** | Whatever broke before |

**At PRD/batch completion:**
All deferred E2E tests run. No runtime code ships without Playwright coverage (in UI projects).

### Dependency Smoke Testing (Playwright)

**When you change X, Playwright smoke tests everything that depends on X.**

This catches regressions in consumers of the changed code — not just the code itself.

| Changed | Playwright Smoke Tests |
|---------|------------------------|
| `useAuth` hook | All pages/components importing `useAuth` |
| `Button` component | All pages using `Button` (basic render + click) |
| `/api/users` endpoint | All UI flows that call `/api/users` |
| `User` Prisma model | All pages doing User CRUD |
| `formatCurrency` util | Pages displaying currency (if detectable) |
| Shared `Layout` component | All pages using that layout |
| Auth middleware | All protected routes |

**How it works:**

```
1. @e2e-reviewer analyzes the change
2. For each changed file:
   a. Find dependents: grep/AST search for imports
   b. Map dependents to routes/pages
   c. Add those routes to e2e-areas.json
3. @e2e-playwright writes smoke tests for each:
   - Page loads without error
   - Key elements render
   - Basic interactions work (click, navigate)
   - No console errors
```

**Smoke test depth:**

| Dependent Type | Smoke Test Depth |
|----------------|------------------|
| Direct consumer (imports changed file) | Full interaction test |
| Indirect consumer (2+ hops away) | Load + render check only |
| Unrelated | Skip |

**Example: Change `useAuth` hook**

```
Changed: src/hooks/useAuth.ts

@e2e-reviewer finds dependents:
  Direct imports:
    - src/components/LoginForm.tsx
    - src/components/UserMenu.tsx
    - src/components/ProtectedRoute.tsx
  
  Pages using those components:
    - /login (LoginForm)
    - /dashboard (UserMenu, ProtectedRoute)
    - /settings (UserMenu, ProtectedRoute)
    - /profile (UserMenu, ProtectedRoute)

@e2e-playwright generates smoke tests:
  e2e/auth-dependents-smoke.spec.ts:
    • test: /login loads and form renders
    • test: /login form submits successfully
    • test: /dashboard loads when authenticated
    • test: /dashboard shows user menu
    • test: /settings loads when authenticated  
    • test: /profile loads when authenticated
    • test: protected routes redirect when unauthenticated
```

**Example: Change `Button` component**

```
Changed: src/components/Button.tsx

@e2e-reviewer finds dependents:
  Pages using Button:
    - /checkout (Submit button)
    - /settings (Save button)
    - /profile (Edit button)
    - /login (Login button)

@e2e-playwright generates smoke tests:
  e2e/button-dependents-smoke.spec.ts:
    • test: /checkout submit button renders and is clickable
    • test: /settings save button renders and is clickable
    • test: /profile edit button renders and is clickable
    • test: /login login button renders and is clickable
```
| Docs/config | **Skip** | Nothing — no runtime impact |

**At PRD/batch completion:**
All deferred E2E tests run. No user-facing change ships without Playwright coverage.

### E2E Execution Flow (When Triggered)

```
E2E IMMEDIATE triggered
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 1: @e2e-reviewer                                              │
│                                                                     │
│ 1. Analyze git diff to identify changed UI areas                   │
│ 2. Navigate to each affected page/modal/component in the browser   │
│ 3. Take screenshots for evidence                                   │
│ 4. Check for console errors, broken layouts, missing elements      │
│ 5. Create/update docs/e2e-areas.json manifest with:                │
│    - Area paths (e.g., /checkout, /settings/payment)               │
│    - Selectors for key elements                                    │
│    - Interactions to test (click, fill, submit, etc.)              │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2: @e2e-playwright                                            │
│                                                                     │
│ 1. Read docs/e2e-areas.json manifest                               │
│ 2. For each UI area, write comprehensive Playwright tests:         │
│    - Page load and initial state                                   │
│    - All documented interactions                                   │
│    - Error states and edge cases                                   │
│    - Mobile responsive checks                                      │
│ 3. Run the tests: npx playwright test [files]                      │
│ 4. If failures:                                                    │
│    - @developer fixes                                              │
│    - Re-run (max 3 attempts)                                       │
│ 5. Update manifest with coverage status                            │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
✅ E2E Complete — tests pass, coverage documented
```

### What E2E Tests Actually Cover

For a payment flow change, the E2E tests would:

1. **Navigate to checkout page**
2. **Fill payment form** with test card data
3. **Submit and verify** success/error states
4. **Check loading states** during processing
5. **Test validation errors** (invalid card, expired, etc.)
6. **Verify mobile layout** (375px width)
7. **Check accessibility** (keyboard nav, screen reader labels)
8. **Test edge cases** (network failure, session timeout)

### Activity Display to User (Informational Only)

After resolution, show what's running — **no confirmation required, execution proceeds immediately:**

```
═══════════════════════════════════════════════════════════════════════
                      TEST ACTIVITIES FOR THIS CHANGE
═══════════════════════════════════════════════════════════════════════

Changed files:
  • src/components/PaymentForm.tsx
  • src/api/payments/charge.ts
  • src/hooks/usePayment.ts

Running:
  ✓ Baseline: typecheck, lint
  ✓ Unit tests: @react-tester (PaymentForm), @jest-tester (charge.ts)
  ✓ Critics: @frontend-critic, @backend-critic-ts, @security-critic, @exploit-critic
  ✓ E2E: IMMEDIATE
      Phase 1: @e2e-reviewer identifies affected UI areas
      Phase 2: @e2e-playwright writes & runs tests
  ✓ Quality: @aesthetic-critic

Why:
  • Payment files → security-critic, exploit-critic, E2E immediate
  • .tsx → react-tester, frontend-critic, aesthetic-critic
  • API routes → backend-critic-ts

═══════════════════════════════════════════════════════════════════════
```

**Note:** This display is informational. The user is NOT asked to confirm, approve, or modify. Activities begin immediately after display.

### E2E Progress Display (During Execution)

While E2E runs, show progress:

```
═══════════════════════════════════════════════════════════════════════
                         E2E TESTING IN PROGRESS
═══════════════════════════════════════════════════════════════════════

Phase 1: @e2e-reviewer
  ✓ Analyzed changed files
  ✓ Identified 3 UI areas:
      • /checkout (PaymentForm)
      • /checkout/confirm (confirmation modal)
      • /settings/billing (payment methods list)
  ✓ Navigated to each area
  ✓ Screenshots captured
  ✓ Created docs/e2e-areas.json

Phase 2: @e2e-playwright
  ✓ Writing tests for /checkout...
      • checkout-form.spec.ts (12 test cases)
  ⏳ Writing tests for /checkout/confirm...
  ○ Writing tests for /settings/billing...
  ○ Running tests...

═══════════════════════════════════════════════════════════════════════
```

### E2E Completion Display

```
═══════════════════════════════════════════════════════════════════════
                         E2E TESTING COMPLETE
═══════════════════════════════════════════════════════════════════════

Results:
  ✓ 3 UI areas tested
  ✓ 28 test cases written
  ✓ All tests passing

Test files created:
  • e2e/checkout-form.spec.ts (12 tests)
  • e2e/checkout-confirm.spec.ts (8 tests)
  • e2e/billing-settings.spec.ts (8 tests)

Coverage:
  • Form submission flow ✓
  • Validation errors ✓
  • Loading states ✓
  • Mobile responsive (375px) ✓
  • Keyboard navigation ✓

═══════════════════════════════════════════════════════════════════════
```

### Hotspot Tracking

Store in `<project>/docs/test-debt.json`:

```json
{
  "hotspots": {
    "src/components/PaymentForm.tsx": {
      "failureCount": 3,
      "lastFailure": "2026-02-27",
      "addedCritics": ["exploit-critic"],
      "forceE2E": true,
      "reason": "3 security issues found in past 30 days"
    }
  },
  "decayDays": 30
}
```

When a file appears in hotspots, its `addedCritics` are automatically included.

### Escape Hatches (Optional — Power Users Only)

These overrides exist but are **never required**. The system works fully automatically without them.

**Per-task force (if user explicitly requests more coverage):**
```
User: "force full"
Builder: "Adding all critics + unit tests..."
```

**Per-task skip (if user explicitly requests less coverage):**
```
User: "skip security-critic"
Builder: "Removing @security-critic from this run..."
```

**Project-level additions (via project.json — set once, never prompted):**
```json
{
  "testing": {
    "alwaysInclude": ["security-critic"],
    "neverSkip": ["exploit-critic"]
  }
}
```

## User Stories

### US-001: Remove Manual Rigor Selection

**Description:** As a Builder user, I want test activities determined automatically so I never have to choose between speed and quality.

**Acceptance Criteria:**
- [ ] Remove rigor profile prompt from PRD start flow (no prompt at all)
- [ ] Remove rigor profile prompt from ad-hoc mode (no prompt at all)
- [ ] Remove `testingRigor` from builder-state.json
- [ ] Update prd-workflow skill to skip rigor selection
- [ ] Update adhoc-workflow skill to skip rigor selection
- [ ] No confirmation dialogs for test activities
- [ ] Show one-time notice: "Test activities are now automatic"

### US-002: Create Activity Rules Data File

**Description:** As the toolkit, I need a data file mapping signals to activities.

**Acceptance Criteria:**
- [ ] Create `data/test-activity-rules.json` with file patterns
- [ ] Include code patterns for risky operations
- [ ] Include cross-cutting rules
- [ ] Document the schema

### US-003: Implement File Pattern Matching

**Description:** As Builder, I need to match changed files against activity rules.

**Acceptance Criteria:**
- [ ] Glob pattern matching for file paths
- [ ] Multiple patterns can match (activities are additive)
- [ ] Return set of activities per file
- [ ] Unit tests for pattern matching

### US-004: Implement Code Pattern Detection

**Description:** As Builder, I need to detect risky code patterns in diffs.

**Acceptance Criteria:**
- [ ] Regex matching against `git diff` output
- [ ] Patterns for: DB writes, auth calls, crypto, eval, child_process, fs writes
- [ ] Return additional activities when patterns match
- [ ] Unit tests for pattern detection

### US-005: Implement Activity Resolution

**Description:** As Builder, I need to combine all signals into a final activity set.

**Acceptance Criteria:**
- [ ] Combine file patterns + code patterns + cross-cutting + hotspots
- [ ] Deduplicate activities
- [ ] Determine E2E timing (immediate vs deferred vs skip)
- [ ] Return structured result with reasoning

### US-006: Update Test Flow for Activity-Based Execution

**Description:** As Builder, I need to execute the resolved activities.

**Acceptance Criteria:**
- [ ] Run baseline (typecheck, lint) always
- [ ] Run resolved unit testers for their file types
- [ ] Run resolved critics in parallel where possible
- [ ] Handle E2E timing correctly
- [ ] Run quality checks if resolved
- [ ] Update test-flow skill

### US-006a: Implement Dependency Smoke Testing

**Description:** As Builder, I need to Playwright smoke test all dependents of changed files.

**Acceptance Criteria:**
- [ ] For each changed file, find all files that import it
- [ ] Map importing files to routes/pages they render
- [ ] Generate smoke tests: page load, key elements render, no console errors
- [ ] Direct dependents get interaction tests; indirect get load-only tests
- [ ] Include dependent smoke tests in `e2e-areas.json`
- [ ] `@e2e-playwright` generates `*-dependents-smoke.spec.ts` files

### US-007: Display Activities to User (Informational)

**Description:** As a user, I want to see what tests are running and why — without being asked to confirm.

**Acceptance Criteria:**
- [ ] Show activity summary as tests begin (not before, not blocking)
- [ ] Group by category (baseline, unit, critics, E2E, quality)
- [ ] Show brief reasoning for each activity
- [ ] Works in both PRD and ad-hoc modes
- [ ] NO confirmation prompt — display is informational only
- [ ] Execution proceeds immediately after display

### US-008: Implement Hotspot Tracking

**Description:** As Builder, I need to track files with past failures.

**Acceptance Criteria:**
- [ ] Create `docs/test-debt.json` schema
- [ ] Record failures after each test run
- [ ] Add hotspot activities during resolution
- [ ] Decay hotspots after 30 days without failure

### US-009: Implement Escape Hatches

**Description:** As a user, I need to override automatic activity selection.

**Acceptance Criteria:**
- [ ] `force full` command adds all activities
- [ ] `skip [activity]` removes specific activity
- [ ] `testing.alwaysInclude` in project.json
- [ ] `testing.neverSkip` in project.json

### US-010: Migrate Existing Projects

**Description:** As a toolkit user, I need existing projects to work seamlessly.

**Acceptance Criteria:**
- [ ] Projects without new config work with defaults
- [ ] Existing `rigorProfile` settings are ignored (deprecated)
- [ ] No breaking changes for users
- [ ] Migration notes in changelog

## Technical Considerations

### New Data Files

| File | Location | Purpose |
|------|----------|---------|
| `test-activity-rules.json` | `~/.config/opencode/data/` | Signal → activity mapping |
| `test-debt.json` | `<project>/docs/` | Per-project failure hotspots |

### Schema Changes

**project.json additions:**
```json
{
  "testing": {
    "alwaysInclude": [],      // activities to always run
    "neverSkip": [],          // activities that can't be skipped
    "rigorProfile": "..."     // DEPRECATED, ignored
  }
}
```

**builder-state.json changes:**
```json
{
  "currentTask": {
    "resolvedActivities": {
      "baseline": ["typecheck", "lint"],
      "unit": ["react-tester", "jest-tester"],
      "critics": ["frontend-critic", "security-critic"],
      "e2e": "immediate",
      "quality": ["aesthetic-critic"],
      "reasoning": [
        "Payment files → security-critic, exploit-critic",
        ".tsx files → react-tester, frontend-critic"
      ]
    }
  }
}
```

### Performance Considerations

- File pattern matching: O(files × patterns), cached per task
- Code pattern detection: Single ripgrep pass over diff
- Hotspot lookup: O(1) hash lookup
- Total overhead: <300ms per task

## Success Metrics

- **Bug escape rate:** <5% of bugs caught post-merge
- **E2E coverage:** 100% of UI changes have Playwright tests before shipping
- **Activity accuracy:** >90% of resolved activities are relevant
- **User overrides:** <5% of tasks require manual override
- **Time savings:** Skip unnecessary critics for low-risk changes

## E2E Policy Summary

**Any change that affects runtime behavior gets Playwright tests — unless the project has no UI.**

### The Rule

If code runs at runtime and the project has a UI, it needs Playwright coverage. Period.

This is NOT about "user-facing" vs "backend" — it's about **runtime impact**:
- Auth hook throws? → Users can't log in
- API route fails? → Features break
- Utility returns wrong value? → UI displays garbage
- CSS breaks? → Layout is broken
- Middleware fails? → Requests don't work

### What Gets Playwright Tests

**Everything that runs at runtime:**
- React components, hooks, pages
- API routes, middleware, server actions
- Database queries, Prisma operations
- Services, business logic
- Utilities that are called at runtime
- CSS, styling (visual regression)
- Configuration that affects runtime behavior

### What Does NOT Get Playwright Tests

**Only these categories are exempt:**

| Category | Examples | Why Exempt |
|----------|----------|------------|
| Type-only files | `.d.ts`, `types.ts` (interfaces only) | Compile-time only, no runtime |
| Test files | `*.test.ts`, `*.spec.ts`, `__tests__/` | Tests test themselves |
| Documentation | `*.md`, `docs/`, `README` | No runtime impact |
| Dev tooling config | `.eslintrc`, `.prettierrc`, `tsconfig.json` | Dev-time only |
| Git/CI config | `.gitignore`, `.github/workflows/` | No runtime impact |
| **Projects without UI** | CLI tools, pure libraries, backend-only services | Nothing for Playwright to test |

### Project UI Detection

Before running Playwright tests, check if the project has a UI:

```json
// project.json
{
  "capabilities": {
    "ui": true,      // Has web UI → Playwright runs
    "ui": false      // No UI (CLI, library, backend-only) → Skip Playwright
  }
}
```

**Detection heuristics if not declared:**
- Has `apps/web/`, `src/app/`, `src/pages/` → UI project
- Has React/Vue/Svelte/Next.js in dependencies → UI project
- Has `playwright.config.*` → UI project
- Pure Node.js/Go/Python with no frontend deps → No UI

**For projects without UI:**
- Skip all Playwright E2E tests
- Unit tests and critics still run
- API tests (supertest, httptest) replace E2E for endpoint coverage

### Timing: Immediate vs Deferred

For UI projects, the question is only WHEN Playwright runs:

| Signal | Timing | Rationale |
|--------|--------|-----------|
| Auth/payment/security code | **Immediate** | Too risky to defer |
| API routes, middleware | **Immediate** | Can break user flows |
| Database/Prisma changes | **Immediate** | Can break data access |
| Components, hooks, pages | **Deferred** | Test at PRD/batch end |
| Styling, CSS | **Deferred** | Test at PRD/batch end |
| Utilities | **Deferred** | Test dependents at PRD/batch end |

**Deferred ≠ Skipped.** Deferred tests run at PRD/batch completion.

### Dependency Smoke Testing

When you change X, Playwright smoke tests everything that imports X:

| Changed | Smoke Test Dependents |
|---------|----------------------|
| `useAuth` hook | All components/pages importing it |
| `Button` component | All pages using Button |
| `/api/users` route | All UI calling `/api/users` |
| `formatCurrency` util | All pages displaying currency |
| `prisma/schema.prisma` | All pages doing CRUD on affected models |

## Open Questions

1. Should hotspot decay be configurable per-project?
2. Should we auto-tune rules based on which critics find issues?
3. How do we handle monorepos with different risk profiles per package?

## Rollout Plan

1. **Phase 1:** Create activity rules data file (US-002)
2. **Phase 2:** Implement pattern matching + resolution (US-003, US-004, US-005)
3. **Phase 3:** Update test flow execution (US-006)
4. **Phase 4:** Add user display + hotspot tracking (US-007, US-008)
5. **Phase 5:** Remove manual selection + escape hatches (US-001, US-009)
6. **Phase 6:** Migration + polish (US-010)

## Automatic Behavior Summary

**This entire system is fully automatic. Zero user interaction required.**

| Mode | What Happens | User Action Required |
|------|--------------|---------------------|
| **PRD mode** | Each task: analyze changed files → resolve activities → run them | None |
| **Ad-hoc mode** | Each request: analyze changed files → resolve activities → run them | None |
| **Starting work** | No rigor selection prompt | None |
| **Before tests run** | Brief informational display of activities | None (no confirmation) |
| **During tests** | Progress display | None |
| **After tests** | Results display | None (unless failures need fixing) |

**The user never:**
- Selects a rigor level
- Confirms which tests to run
- Approves the test plan
- Chooses between speed and quality

**The system always:**
- Analyzes changes automatically
- Determines appropriate activities
- Runs them without prompting
- Shows what it's doing (informational only)

## Credential & Service Access Plan

No external credentials required for this PRD.
