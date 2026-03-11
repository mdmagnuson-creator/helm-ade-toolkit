---
title: Remove deprecated agents.multiSession field
updateType: schema
interactive: false
---

# Remove deprecated `agents.multiSession` field

## What to do

1. Open `docs/project.json`
2. Remove the `agents.multiSession` field (it is now ignored — coordination is always-on)
3. No replacement field is needed

## Why

Session coordination (session locks, heartbeat, merge queue) is now always active with lazy overhead. Solo developers experience zero git overhead — heartbeat updates are local-only when no other sessions are detected. The `agents.multiSession` flag is no longer checked by any agent.

## Verification

Run: `jq '.agents.multiSession' docs/project.json` — should return `null` (field removed)

## What happens if you don't apply this

Nothing breaks — the field is simply ignored. Removing it keeps your config clean and avoids confusion.
