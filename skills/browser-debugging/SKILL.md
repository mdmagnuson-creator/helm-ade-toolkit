---
name: browser-debugging
description: "Browser debugging escalation protocol for when tests pass but the feature doesn't work in the user's browser. Triggers on: tests pass but doesn't work, feature broken in browser, works in playwright but not browser, console screenshot, browser debugging."
---

# Browser Debugging Escalation Protocol

> **Load this skill when ANY of these triggers occur:**
>
> 1. User says "it's not working" but code inspection shows it should work
> 2. Two rounds of code analysis haven't found the issue
> 3. User provides a screenshot showing unexpected behavior
> 4. Tests pass but feature doesn't work in browser
> 5. User explicitly mentions visual discrepancy
>
> **Do NOT wait for 5+ rounds of back-and-forth.** Escalate early when there's a disconnect between expected and actual behavior.

## Overview

This protocol provides a structured debugging escalation for "works in tests, fails in browser" scenarios. It minimizes wasted rounds by gathering evidence early and injecting diagnostics proactively.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   LEVEL 1       │ ──► │   LEVEL 2       │ ──► │   LEVEL 3       │ ──► │   LEVEL 4       │
│ Quick Verify    │     │ Inject Version  │     │ Runtime Diag    │     │ Env Comparison  │
│                 │     │                 │     │                 │     │                 │
│ Browser info,   │     │ Module-load     │     │ Console.log at  │     │ Different       │
│ console output  │     │ markers         │     │ decision points │     │ browser/headed  │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## When to Use This Protocol

Activate this protocol when:

1. User reports "X doesn't work" but relevant tests pass
2. You've already tried basic suggestions (hard refresh, clear cache) without success
3. There's a mismatch between what tests show and what the user experiences

**Do NOT assume caching first.** Get browser info and console state before suggesting cache clears.

---

## Level 1: Quick Verification (Do First, Immediately)

When user reports a feature doesn't work but tests pass, your **first response** should ask:

```
I see the tests are passing. Let me gather some diagnostic info:

1. Which browser are you using? (Brave, Chrome, Safari, Firefox, Edge)
2. Can you open DevTools (F12) → Console tab and share a screenshot?
3. Are there any red errors or yellow warnings?

This will help me understand what's happening in your environment.
```

**Key principle:** Get console output BEFORE suggesting any fixes.

---

## Level 2: Inject Diagnostics (If No Obvious Errors)

If user's console shows no errors, inject a version marker to verify code freshness:

### Step 1: Add Module-Level Version Marker

Run @developer to add a highly visible console.log at module load time:

```typescript
// Temporary debug - remove after issue resolved
console.log('%c[ComponentName] v2026-02-24-v1', 'background: #ff0; color: #000; font-size: 16px;');
```

**Properties of a good version marker:**
- Unique timestamp/version in the string
- High-visibility styling (yellow background, large font)
- Component name for identification
- Placed at module top level (outside any function)

### Step 2: Ask User to Verify

```
I've added a diagnostic marker. Please:

1. Hard refresh the page (Ctrl/Cmd + Shift + R)
2. Open DevTools → Console
3. Do you see a bright yellow "[ComponentName] v2026-02-24-v1" message?

If YES → Code is loading correctly, issue is runtime behavior (go to Level 3)
If NO → Code isn't loading, likely a caching or build issue (debug that path)
```

---

## Level 3: Runtime Diagnostics (If Code Is Loading But Feature Broken)

If the version marker appears but the feature still doesn't work, add targeted logging:

### Step 1: Identify Key Decision Points

Map out where the feature could fail:
- Event handler entry (is it being called?)
- Conditional branches (which path is taken?)
- State changes (what values are being set?)
- DOM queries (are elements being found?)

### Step 2: Add Diagnostic Logging

Run @developer to add console.log statements:

```typescript
// Event handler entry
const handleClick = useCallback(() => {
  console.log('[ComponentName] handleClick called');
  // ... rest of function
}, [deps]);

// Conditional branches
if (someCondition) {
  console.log('[ComponentName] branch A, condition value:', someCondition);
  // ...
} else {
  console.log('[ComponentName] branch B, condition value:', someCondition);
  // ...
}

// State/ref access
console.log('[ComponentName] checking ref:', {
  refCurrent: ref.current,
  activeElement: document.activeElement,
  matches: ref.current === document.activeElement
});
```

### Step 3: Have User Reproduce and Share

```
I've added diagnostic logging. Please:

1. Refresh the page
2. Try to use the feature that's not working
3. Share a screenshot of the Console output

I'm looking for which logs appear and what values they show.
```

### Step 4: Compare Expected vs Actual

When user shares console output:
- Check which handlers were called (or not called)
- Check conditional branch values
- Look for unexpected `undefined`, `null`, or stale values
- Compare against what the code logic expects

---

## Level 4: Environment Comparison (If Still Unclear)

If runtime diagnostics don't reveal the issue, compare environments:

### Option A: Different Browser

```
Let's test in a different environment:

1. Try the feature in a different browser (or incognito/private window)
2. Does it work there?

If YES → Browser-specific issue (extensions, settings, cached state)
If NO → Issue is consistent, likely a subtle code bug
```

### Option B: Headed Playwright Test

Run the E2E test in headed mode to see exactly what Playwright sees:

```bash
npx playwright test path/to/test.spec.ts --headed --project=chromium
```

Watch the browser:
- Does the UI look correct?
- Does the interaction work visually?
- Compare DevTools state in headed test vs user's browser

### Option C: React StrictMode Check

If the project uses React, check for StrictMode-related issues:

```
Is this a development build with React StrictMode enabled?

StrictMode double-mounts components, which can cause:
- Event listeners capturing stale DOM references
- Effects running twice with cleanup issues
- Closures capturing first-mount values

Check for patterns like:
- `const element = ref.current` captured in a closure
- `document.activeElement === capturedElement` comparisons
- Event handlers that don't read ref.current at event time
```

See: React StrictMode / Stale Closure patterns in CONVENTIONS.md

---

## Common Root Causes

After running this protocol, common issues found include:

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Handler never called | Event listener not attached, wrong element | Check effect dependencies, verify element exists |
| Handler called but condition fails | Stale closure, wrong comparison | Read refs at event time, not capture time |
| Works in test, fails in dev | React StrictMode double-mount | Use refs instead of captured variables |
| Works after HMR, fails on fresh load | Initialization timing | Check effect dependencies, add proper guards |
| Works in Chrome, fails in Safari | Browser API differences | Check for unsupported APIs, add polyfills |

---

## Diagnostic Logging Pattern for @developer

When Builder reports "user says feature doesn't work but tests pass", @developer should:

### 1. Add Module-Level Version Marker

```typescript
// Temporary debug - remove after issue resolved
console.log('%c[ComponentName] v2026-02-24', 'background: yellow; font-size: 14px;');
```

### 2. Add Entry-Point Logging

```typescript
const handleSomething = useCallback(() => {
  console.log('[ComponentName] handleSomething called');
  // ... rest of function
}, []);
```

### 3. Add Conditional Branch Logging

```typescript
if (someCondition) {
  console.log('[ComponentName] branch A, value:', someValue);
} else {
  console.log('[ComponentName] branch B, value:', someValue);
}
```

### 4. Add Ref/DOM State Logging

```typescript
console.log('[ComponentName] DOM state:', {
  refCurrent: ref.current,
  activeElement: document.activeElement,
  comparison: ref.current === document.activeElement
});
```

These logs help Builder identify where behavior diverges between test and user browser.

---

## Cleanup

After the issue is resolved:

1. Remove all temporary `console.log` statements
2. Remove version markers
3. Document the root cause in commit message or PR description
4. If this revealed a common pattern, consider adding it to CONVENTIONS.md

---

## Key Principles

1. **Get console output early** — Don't waste rounds on cache-clearing guesses
2. **Inject diagnostics proactively** — Add logging before asking user to try again
3. **Unique version markers** — Use dated/versioned console.log to confirm code freshness
4. **Screenshots with DevTools** — Always request console tab visible
5. **Compare test vs browser** — If tests pass but browser fails, suspect environment differences (StrictMode, extensions, etc.)

---

## Example Application

**Before (10+ rounds):**
1. User: "Selection menu doesn't work"
2. Agent: "Try hard refresh" → didn't work
3. Agent: "Try clearing cache" → didn't work  
4. Agent: "Try incognito" → didn't work
5. Agent: "Let me restart dev server" → didn't work
6. Agent: "Let me add console.log" → added logging
7. User: shares screenshot → shows handler not being called
8. Agent: identifies stale closure issue → fixed

**After (3-4 rounds):**
1. User: "Selection menu doesn't work"
2. Agent: "Which browser? Can you share console screenshot?" + immediately injects version marker
3. User: shares screenshot showing version marker but no handler logs
4. Agent: "Code is loading but handler isn't firing — adding diagnostic logging"
5. User: shares screenshot showing stale ref comparison
6. Agent: identifies stale closure issue → fixed

Half the rounds, faster resolution, less user frustration.
