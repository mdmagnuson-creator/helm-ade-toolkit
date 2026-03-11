---
title: Configure testVerifySettings — Playwright gate settings
updateType: schema
interactive: true
---

# Configure `testVerifySettings` — Playwright Gate Settings

## Phase 1: Autonomous Analysis

Read the project's current configuration:

1. Read `docs/project.json` → `testing.testVerifySettings` to check which settings are already configured
2. Read `docs/project.json` → `testing.e2e` to check if Playwright is set up for this project
3. Check for deprecated fields: `testing.storyAssessment`, `testing.rigorProfile`

## Phase 2: Present Findings

Show this dashboard to the user:

```
═══════════════════════════════════════════════════════════════════════
                 PLAYWRIGHT GATE CONFIGURATION
═══════════════════════════════════════════════════════════════════════

These 6 settings control when Playwright tests run automatically.
When true, Playwright runs automatically at that point.
When false, Playwright is skipped at that point.

┌──────────────────────────────────────┬─────────┬────────────────────────────────┐
│ Setting                              │ Current │ Description                    │
├──────────────────────────────────────┼─────────┼────────────────────────────────┤
│ adHocUIVerify_Analysis               │ {value} │ Run Playwright during ad-hoc   │
│                                      │         │ analysis phase                 │
├──────────────────────────────────────┼─────────┼────────────────────────────────┤
│ adHocUIVerify_StoryTest              │ {value} │ Run Playwright after each      │
│                                      │         │ ad-hoc story completes         │
├──────────────────────────────────────┼─────────┼────────────────────────────────┤
│ adHocUIVerify_CompletionTest         │ {value} │ Run Playwright on ad-hoc       │
│                                      │         │ completion                     │
├──────────────────────────────────────┼─────────┼────────────────────────────────┤
│ prdUIVerify_Analysis                 │ {value} │ Run Playwright during PRD      │
│                                      │         │ analysis phase                 │
├──────────────────────────────────────┼─────────┼────────────────────────────────┤
│ prdUIVerify_StoryTest                │ {value} │ Run Playwright after each PRD  │
│                                      │         │ story completes                │
├──────────────────────────────────────┼─────────┼────────────────────────────────┤
│ prdUIVerify_PRDCompletionTest        │ {value} │ Run holistic Playwright tests  │
│                                      │         │ on full PRD completion         │
└──────────────────────────────────────┴─────────┴────────────────────────────────┘

{If no testing.e2e configured:}
⚠️  Playwright is not configured for this project (no testing.e2e section).
    All settings are effectively moot until Playwright is set up.

{If deprecated fields found:}
⚠️  Deprecated fields found:
    • testing.storyAssessment — no longer used (test activities are automatic)
    • testing.rigorProfile — no longer used (test activities are automatic)
    These can be safely removed.

═══════════════════════════════════════════════════════════════════════
```

Replace `{value}` with the current value, or `true (default)` if not explicitly set.

## Phase 3: User Confirmation

Ask the user:

```
Would you like to:
  [D] Accept all defaults (all true)
  [C] Configure each setting individually
  [S] Skip for now
```

If `[C]`: Walk through each of the 6 settings, asking true/false.
If `[D]`: Write all 6 as `true`.
If `[S]`: Skip — do not write anything.

After confirmation, write the values to `docs/project.json` → `testing.testVerifySettings`.

If deprecated fields were found and user agrees, remove:
- `testing.storyAssessment`
- `testing.rigorProfile`

## Verification

Run: `jq '.testing.testVerifySettings' docs/project.json` — should return an object with 6 boolean keys.

Run: `jq '.testing.storyAssessment // "removed"' docs/project.json` — should return `"removed"`.

Run: `jq '.testing.rigorProfile // "removed"' docs/project.json` — should return `"removed"`.

## What happens if you don't apply this

Nothing breaks — all `testVerifySettings` default to `true` when not set. Applying this update makes the configuration explicit and removes deprecated fields.
