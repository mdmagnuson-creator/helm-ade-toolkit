# Codemode for Helm — Design Brief

> **Purpose:** Give this to @planner as context for PRD creation.
> **Origin:** Ad-hoc analysis session, April 2026. Builder analyzed both helm-ade-macos (helm-bridge plugin) and helm-ade-toolkit (agent instructions) to identify multi-hop tool call patterns and evaluate Cloudflare's Codemode pattern as a solution.

---

## The Problem

Helm agents make **sequential tool calls with in-context data processing between them**. The LLM acts as a data-shuffling middleman — parsing JSON, doing glob matching, filtering sets, cross-referencing entities — work that's error-prone, token-expensive, and hallucinates.

### Measured Multi-Hop Patterns

| Pattern | Round-trips | What the LLM does between calls | Hallucination risk |
|---------|-------------|----------------------------------|-------------------|
| PRD + stories + tasks + tests | 8-15 | N+1 queries, set intersection, fuzzy matching | HIGH |
| Flow tracing (@explore) | 10-25 | Parse function calls from code, track visited files, build call graph | MEDIUM |
| Test activity resolution | 6-10 | Parse 602-line JSON, 50+ glob matches, 25+ regex matches, set operations | HIGH |
| Session context hydration | 5-8 | Loop tasks, fetch tests per task, merge results | MEDIUM |
| Search + hydrate | 3-10 | Search returns IDs only, loop-fetch each entity | MEDIUM |
| Critic deduplication | 4-8 | Merge/dedup findings across multiple critics by file:line | MEDIUM |

### Current Tool Inventory (helm-bridge)

31 tools total. **22 are thin CRUD wrappers** (single Supabase table insert/update). 8 do server-side joins. 1 workflow trigger.

The tools themselves are fine — the problem is the **composition layer** is the LLM's context window.

---

## The Solution: Codemode

Cloudflare's Codemode pattern (docs: https://developers.cloudflare.com/agents/api-reference/codemode/). Inspired by Apple's CodeAct research.

### How It Works

1. **Take your existing tools** — all 31 `helm_*` tools stay exactly as they are
2. **Auto-generate TypeScript type definitions** from their Zod schemas (helm-bridge already uses Zod via `tool.schema`)
3. **Expose a single `codemode` tool** to the LLM — "write an async function using these typed methods"
4. **Execute that function in a sandbox** — `codemode.helm_task_list(...)` calls route back to real tool implementations
5. **Return the composed result** to the LLM — no in-context data shuffling

### Before (today): 8 tool calls, LLM parsing between each

```
LLM → helm_prd_list({ status: "ready" })
LLM: "ok let me parse these 12 PRDs and find the one I need..."
LLM → helm_prd_get({ prd_id: "prd-auth" })
LLM: "now let me extract the stories and find tasks..."
LLM → helm_task_list({ prd_id: "prd-auth" })
LLM: "ok 6 tasks, let me check tests for each..."
LLM → get_test_summary({ task_id: "task-1" })
LLM → get_test_summary({ task_id: "task-2" })
... (4 more)
LLM: "let me compile all the failing tests..." (hallucinates count)
```

### After (codemode): 1 tool call, code runs server-side

```
LLM → codemode({
  code: `async () => {
    const { prds } = await codemode.helm_prd_list({ status: "ready" });
    const authPrd = prds.find(p => p.prd_id === "prd-auth");
    const { prd, stories } = await codemode.helm_prd_get({ prd_id: authPrd.prd_id });
    const { tasks } = await codemode.helm_task_list({ prd_id: authPrd.prd_id });
    const results = await Promise.all(
      tasks.map(async t => ({
        ...t,
        tests: await codemode.get_test_summary({ task_id: t.id })
      }))
    );
    return {
      prd: prd.title,
      failing: results.filter(r => !r.tests.all_passing)
        .map(r => ({ task: r.title, failing: r.tests.failing }))
    };
  }`
})
```

The code runs in a sandbox. The LLM gets back `{ prd: "Auth Flow", failing: [{ task: "Login", failing: 2 }] }`. Done.

---

## Architecture

### Where This Lives

```
helm-ade-toolkit/
├── plugins/
│   ├── helm-bridge.js          ← existing, unchanged (31 tools)
│   ├── helm-codemode.js        ← NEW: codemode plugin
│   └── shell-history.js        ← existing, unchanged
├── opencode.json               ← add helm-codemode.js to plugin array
└── plugin-deps.json            ← add sandbox dependency
```

The codemode plugin:
1. Imports the tool definitions from helm-bridge (or receives them via plugin context)
2. Generates TypeScript type definitions from the Zod schemas
3. Registers a single `codemode` tool
4. On execution: runs LLM-generated code in sandbox, dispatches `codemode.*` calls to real tools

### Runtime Environment

- **Plugins run in Bun** (opencode's runtime). Full system access, no sandbox.
- **opencode manages the plugin lifecycle**: load → register tools → expose to LLM
- **Plugins have access to**: `fs`, `os`, `child_process`, `process.env`, npm packages, Bun's `$` shell API

### Sandbox Options

Cloudflare uses Workers isolates (their infrastructure). Helm runs locally on macOS. Options:

| Option | Security | Performance | Complexity | Notes |
|--------|----------|-------------|------------|-------|
| **Bun `vm` module** | Low (not a security boundary) | Fast | Low | Same as Node's `vm` — isolation, not security |
| **`isolated-vm`** | High (V8 isolates) | Fast | Medium | True memory isolation, CPU/memory limits |
| **`quickjs-emscripten`** | High (WASM sandbox) | Medium | Medium | Lightweight, ES2020 only |
| **Child process** | Medium (OS-level) | Slower | Low | Spawn node/bun subprocess, `ulimit` for resource limits |
| **No sandbox (trust the LLM)** | None | Fastest | Lowest | Viable for dev-only — agents already have full system access via bash tool |

**Recommendation:** Start with **no sandbox / minimal `vm` isolation**. Rationale:
- The LLM already has full system access via the `bash` tool — codemode doesn't expand the attack surface
- The code only calls `codemode.*` methods (which are your existing tools) — no direct filesystem/network
- Cloudflare needs Workers sandbox because they run untrusted code on shared infrastructure. Helm runs on the developer's own machine.
- Can add `isolated-vm` later if the trust model changes

### What Gets Exposed to Codemode

**Phase 1: Helm data tools only**
All 31 `helm_*` tools from helm-bridge. The LLM composes Supabase queries.

**Phase 2: Add opencode built-in tools** (optional, higher value but more complex)
Also expose `grep`, `read`, `glob` through codemode. This lets the LLM compose code investigation flows:

```javascript
async () => {
  const rules = JSON.parse(await codemode.read("data/test-activity-rules.json"));
  const changed = (await codemode.bash("git diff --name-only HEAD~1")).trim().split("\n");
  const activities = { critics: new Set() };
  for (const file of changed) {
    for (const [pattern, rule] of Object.entries(rules.filePatterns)) {
      if (minimatch(file, pattern)) {
        (rule.critics || []).forEach(c => activities.critics.add(c));
      }
    }
  }
  return { critics: [...activities.critics] };
}
```

This eliminates the #2 worst multi-hop pattern (test activity resolution) without building a dedicated tool.

**Phase 3: Agent instruction updates** (toolkit)
Update agent .md files to prefer codemode for multi-step operations. Not all agents need this — single-tool calls should still use direct tool calling (Cloudflare's own docs say this).

---

## Cross-Repo Coordination

Per CONVENTIONS.md: toolkit changes propagate without an app rebuild. The app pulls the toolkit on startup.

| Change | Repo | Requires app rebuild? |
|--------|------|-----------------------|
| `helm-codemode.js` plugin | helm-ade-toolkit | No — pulled on launch |
| `plugin-deps.json` (add sandbox dep) | helm-ade-toolkit | No — `bun install` runs on launch |
| `opencode.json` (add plugin) | helm-ade-toolkit | No — config read on session start |
| Agent instruction updates | helm-ade-toolkit | No — agents read .md on session start |
| helm-bridge.js changes (if any) | helm-ade-toolkit (source of truth) | No |

**No changes required to helm-ade-macos.** This is entirely a toolkit-side feature.

---

## Key Design Decisions for Planner

1. **Sandbox strategy** — No sandbox (dev machine), `vm` isolation, or `isolated-vm`? Recommendation: start with `vm`, graduate to `isolated-vm` if needed.

2. **Tool surface** — Phase 1 (helm_* tools only) or jump to Phase 2 (include opencode built-ins like grep/read/bash)? Recommendation: Phase 1 first, prove the pattern, then expand.

3. **Type generation approach** — Cloudflare's `generateTypes()` works from Zod schemas. helm-bridge already uses Zod via `tool.schema`. This should be straightforward, but verify compatibility with the `@opencode-ai/plugin` SDK's schema format vs the `ai` SDK's format.

4. **Agent opt-in** — Which agents should prefer codemode vs direct tool calls? Recommendation: Builder (coordinator, does the most cross-entity queries), Planner (PRD analysis), and the test-flow skill. Leave @developer and @explore on direct tool calls (they do single-purpose tool calls, not data composition).

5. **Existing tools unchanged** — This is additive. All 31 tools keep working exactly as they do today. Agents can use either direct calls or codemode. Migration is gradual.

---

## What Success Looks Like

- Builder's PRD cross-referencing: 8-15 calls → 1 codemode call
- Test activity resolution: 6-10 calls + 602-line JSON parse → 1 codemode call  
- Session hydration: 5-8 calls → 1 codemode call
- Search + hydrate: 3-10 calls → 1 codemode call
- Token savings: ~30-50% reduction in multi-step operations (less intermediate data in context)
- Hallucination reduction: deterministic code execution replaces LLM data manipulation

---

## References

- Cloudflare Codemode docs: https://developers.cloudflare.com/agents/api-reference/codemode/
- Apple CodeAct research: https://machinelearning.apple.com/research/codeact
- Cloudflare codemode example (project management + SQLite): https://github.com/cloudflare/agents/tree/main/examples/codemode
- helm-bridge plugin: `helm-ade-toolkit/plugins/helm-bridge.js` (31 tools, Zod schemas)
- Test activity rules: `helm-ade-toolkit/data/test-activity-rules.json` (602 lines, worst multi-hop pattern)
- Plugin SDK: `@opencode-ai/plugin` v1.2.27 (tool registration, hooks, Bun runtime)
