---
name: task-promotion
description: "Process Task Spec promotions from Builder into formal PRDs. Use when user selects [P] from the Planner dashboard."
---

# Task Spec Promotion Pickup

Builder creates promotion documents when ad-hoc tasks grow beyond their original scope or when users explicitly request promotion to formal PRD.

**Location:** `<project>/docs/tasks/promotions/*.md`

## When User Selects a Promotion

1. **Read the promotion document** in full
2. **Display promotion summary:**

```
═══════════════════════════════════════════════════════════════════════
                    TASK SPEC PROMOTION
═══════════════════════════════════════════════════════════════════════

📋 Original Request: "Add user preferences with theme selection"

📊 ANALYSIS FROM BUILDER
───────────────────────────────────────────────────────────────────────
Scope grew from Small → Large during implementation

Completed work:
  ✅ TSK-001: Create preferences database table
  ✅ TSK-002: Add theme selection UI

Remaining scope identified:
  - Cross-device sync
  - Migration for existing users
  - Theme application to 40+ components
  - Accessibility audit
  - Mobile app integration

Builder's recommendation: Create formal PRD for remaining scope

[C] Create PRD from this promotion
[R] Reject and delete promotion
[V] View full promotion document

> _
═══════════════════════════════════════════════════════════════════════
```

## Creating PRD from Promotion

When user chooses [C]:

1. **Auto-generate PRD draft** in `docs/drafts/`:
   - Use promotion document as source
   - Title: From promotion's title or original request
   - Introduction: Include original request context
   - Mark completed work: TSK stories become "already completed" stories
   - Remaining scope: Become new US-### stories

2. **Example generated PRD structure:**

```markdown
# PRD: User Preferences Feature

## Introduction

This feature enables user preferences with theme selection and cross-device sync.

> 📋 **Promoted from Task Spec:** task-2026-03-01-user-preferences
> **Completed during ad-hoc phase:** TSK-001 (database), TSK-002 (UI)

## User Stories

### US-001: Cross-Device Preference Sync

**Description:** As a user, I want my preferences synced across devices.

**Acceptance Criteria:**
- [ ] Preferences load from server on login
- [ ] Changes sync within 5 seconds
- [ ] Offline changes sync when reconnected

### US-002: Migrate Existing Users

**Description:** As a returning user, I want my existing settings preserved.

**Acceptance Criteria:**
- [ ] Migration runs on first load after update
- [ ] Legacy settings mapped to new schema
- [ ] No data loss during migration

[... more stories from promotion document ...]

## Prior Work (Completed)

The following was completed during the ad-hoc Task Spec phase:

### TSK-001: Create preferences database table ✅
- Migration created and applied
- Schema includes theme, notifications, accessibility

### TSK-002: Add theme selection UI ✅
- ThemeSelector component created
- Integrated with settings page

## Technical Considerations

[From promotion document]
```

3. **Register PRD in Supabase** using `helm_prd_create` with status `draft`

4. **Delete the promotion document** after PRD is created:
   ```bash
   rm <project>/docs/tasks/promotions/promote-task-*.md
   ```

5. **Update task-registry.json** (if exists):
   - Set `promotedTo: "prd-user-preferences"` on the original task

6. **Notify user:**
   ```
   ✅ PRD draft created: docs/drafts/prd-user-preferences.md
   
   This PRD includes:
   - 2 completed stories from ad-hoc phase (TSK-001, TSK-002)
   - 6 new stories for remaining scope
   
   Would you like to refine this PRD now? [Y/n]
   ```

## Rejecting a Promotion

When user chooses [R]:

1. **Confirm rejection:**
   ```
   Are you sure? This will delete the promotion document.
   The original Task Spec will remain in docs/tasks/ (not affected).
   
   [Y] Yes, delete promotion
   [N] Cancel
   ```

2. **If confirmed:** Delete the promotion file
