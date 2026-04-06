# PRD: Codemode — Composable Tool Execution for Helm Agents

## Introduction

Helm agents currently make **sequential tool calls with LLM-side data processing between each call**. The LLM acts as a data-shuffling middleman — parsing JSON, doing glob matching, filtering sets, cross-referencing entities — work that is error-prone, token-expensive, and hallucinates counts and set membership.

Codemode eliminates this by giving agents a single tool to write and execute a typed async function that composes multiple `helm_*` calls server-side. Inspired by Cloudflare's Codemode pattern (itself derived from Apple's CodeAct research), this is an entirely additive feature: all 31 existing tools stay unchanged, and agents can continue using direct tool calls for simple single-tool operations.

**All three phases ship back-to-back.** Phase 1 covers Helm data tools only. Phase 2 expands the codemode surface to opencode built-in tools (`read`, `grep`, `glob`, `bash`). Phase 3 updates agent and skill instructions to prefer codemode for multi-step operations.

### The Problem (Measured)

| Pattern | Round-trips today | What changes with codemode |
|---------|------------------|---------------------------|
| PRD + stories + tasks + tests | 8–15 calls | → 1 codemode call |
| Test activity resolution | 6–10 calls + 602-line JSON parse | → 1 codemode call |
| Session context hydration | 5–8 calls | → 1 codemode call |
| Search + hydrate entities | 3–10 calls | → 1 codemode call |
| Critic deduplication | 4–8 calls | → 1 codemode call |

---

## Goals

- Reduce multi-step Helm data queries from N round-trips to 1 codemode call
- Eliminate in-context LLM data processing (JSON parsing, set operations, fuzzy matching)
- Reduce token consumption by 30–50% on multi-step operations
- Replace hallucination-prone LLM data manipulation with deterministic code execution
- Keep all 31 existing tools unchanged and backward-compatible
- Enable gradual agent opt-in — no forced migration

---

## User Stories

### US-001: Schema Compatibility Spike

**Description:** As a developer, I need to verify that the `@opencode-ai/plugin` SDK's `tool.schema` Zod instances are compatible with Cloudflare's `generateTypes()` approach before committing to that implementation path — so we don't build the type generation pipeline on a broken foundation.

**Acceptance Criteria:**

- [ ] Read `helm-bridge.js` to understand exact Zod schema shape used (how `tool.schema` / `z` is imported, what Zod version is exposed)
- [ ] Research whether Cloudflare's `generateTypes()` can consume these schemas or requires raw Zod directly
- [ ] If compatible: document the import path and usage in a code comment at the top of `helm-codemode.js`
- [ ] If incompatible: identify the adaptation needed (e.g., extract raw Zod schemas from `tool.schema`, or write type strings manually from `args` definitions)
- [ ] Decision logged in a code comment block; no dead code, no TODOs left open
- [ ] Spike output: a working `generateTypes(tools)` call or the confirmed alternative approach

---

### US-002: `helm-codemode.js` Plugin — Core Infrastructure

**Description:** As an agent, I need a `codemode` tool registered alongside the existing `helm_*` tools so I can write and execute async functions that compose multiple tool calls in a single operation.

**Acceptance Criteria:**

- [ ] New file `plugins/helm-codemode.js` created
- [ ] Plugin exports a default async function following the `@opencode-ai/plugin` SDK pattern (same structure as `helm-bridge.js`)
- [ ] Plugin imports tool definitions from `helm-bridge.js` (or receives them via plugin context — see US-001 spike for how tools are shared between plugins)
- [ ] `codemode` tool registered with a clear description explaining it accepts an async function string
- [ ] Tool `args` schema: `{ code: z.string() }` — the async function body as a string
- [ ] `opencode.json` updated to include `"./plugins/helm-codemode.js"` in the `plugin` array
- [ ] Plugin loads without error when opencode starts

---

### US-003: Type Definition Generation

**Description:** As an agent using codemode, I need TypeScript type definitions auto-generated from the existing Zod schemas so my LLM-written functions are typed and I get accurate parameter names without memorizing them.

**Acceptance Criteria:**

- [ ] Type definitions generated from all 31 `helm_*` tool schemas (using approach confirmed in US-001)
- [ ] Types cover both input args and return shapes (where return shapes can be inferred or documented)
- [ ] Generated types injected into the tool's description or as a `types` field the LLM sees
- [ ] Type definitions regenerated automatically on plugin load (not a manual build step)
- [ ] Example: `codemode.helm_prd_list` is typed as `(args: { status?: string; repo_id?: string }) => Promise<...>`

---

### US-004: Sandbox Execution — No-Sandbox Phase 1 Implementation

**Description:** As an agent, I need the code I pass to `codemode` to execute safely in Phase 1 (Helm tools only), with a clear path to upgrade the sandbox when Phase 2 exposes `bash`/`read`/`grep`.

**Acceptance Criteria:**

- [ ] Phase 1 executes LLM-generated code using Node/Bun `vm` module for lightweight scope isolation
- [ ] `codemode.*` method calls within the function route to real helm-bridge tool implementations
- [ ] `codemode` context object is the **only** global injected into the vm sandbox — no `fs`, `fetch`, `process`, `require`, or other globals exposed
- [ ] Execution wrapped in try/catch; errors returned as structured `{ error: string, code: string }` (not thrown)
- [ ] Configurable timeout (default 30 seconds) kills runaway executions
- [ ] Sandbox strategy noted in a comment: "Phase 1 uses vm isolation. Phase 2 (bash/read/grep exposure) should upgrade to isolated-vm — see US-009."

---

### US-005: Error Handling Contract

**Description:** As an agent receiving a codemode result, I need structured error responses that give me enough context to self-correct without needing a second round-trip to diagnose what went wrong.

**Acceptance Criteria:**

- [ ] Runtime errors (TypeError, undefined access, etc.) return: `{ error: "<error type>: <message>", code: "<original code string>", partial: <any results before the error, or null> }`
- [ ] Timeout errors return: `{ error: "timeout: execution exceeded 30s", code: "<original code string>", partial: null }`
- [ ] Tool-level errors (e.g., `helm_prd_get` returns `{ error: "PRD not found" }`) are surfaced in the return value, not thrown — LLM sees them inline
- [ ] Successful execution returns the function's return value directly (no wrapper envelope on success)
- [ ] Error shape is documented in the tool's description so the LLM knows what to expect

---

### US-006: `plugin-deps.json` — Sandbox Dependency (Phase 1 Placeholder)

**Description:** As a developer setting up the toolkit, I need `plugin-deps.json` to declare any sandbox dependencies so ToolkitManager can install them automatically.

**Acceptance Criteria:**

- [ ] If `vm` module is used (Node/Bun built-in): no new dependency needed — document this in a comment
- [ ] Add a commented entry for `isolated-vm` so Phase 2 upgrade path is obvious: `// "isolated-vm": "^4.7.2"  — enable for Phase 2 when bash/read/grep are exposed`
- [ ] `plugin-deps.json` passes schema validation

---

### US-007: Phase 2 — Expose opencode Built-in Tools in Codemode

**Description:** As an agent, I need `read`, `grep`, `glob`, and `bash` available as `codemode.read(...)`, `codemode.grep(...)`, etc. so I can compose file investigation and data pipeline flows in a single codemode call — eliminating the worst multi-hop pattern (test activity resolution).

**Acceptance Criteria:**

- [ ] `codemode.read(filePath)` available — routes to opencode's native read tool
- [ ] `codemode.grep(pattern, options)` available — routes to opencode's native grep tool
- [ ] `codemode.glob(pattern)` available — routes to opencode's native glob tool
- [ ] `codemode.bash(command)` available — routes to opencode's native bash tool
- [ ] Sandbox **upgraded to `isolated-vm`** now that `bash` is exposed (arbitrary command execution requires real isolation)
- [ ] `isolated-vm` added to `plugin-deps.json` as a real (uncommented) dependency
- [ ] Type definitions for built-ins generated or hand-authored alongside Helm types
- [ ] Test: a single codemode call can read `data/test-activity-rules.json`, parse it, glob for changed files, and return a filtered activity list — the exact test-activity-resolution pattern

---

### US-008: `isolated-vm` Sandbox Upgrade

**Description:** As a security-conscious developer, I need Phase 2's sandbox to use `isolated-vm` (V8 isolates) with CPU and memory limits — because Phase 2 exposes `bash`, which gives LLM-generated code real system access and makes the sandbox a meaningful security boundary.

**Acceptance Criteria:**

- [ ] `isolated-vm` installed as a dependency in `plugin-deps.json`
- [ ] Execution moved from Node `vm` to `isolated-vm` isolate
- [ ] Memory limit configured (recommended default: 128MB)
- [ ] CPU time limit configured (recommended default: 30s wall clock, 10s CPU)
- [ ] `codemode.*` method proxies work correctly inside the isolate (serialization of args/results handled)
- [ ] Error handling contract from US-005 preserved (same `{ error, code, partial }` shape)
- [ ] Phase 1 vm-based path removed (no dual-path complexity)

---

### US-009: Phase 3 — Builder Agent Instruction Updates

**Description:** As Builder, I need my agent instructions updated to prefer codemode for multi-step Helm data operations so I automatically write fewer sequential tool calls and produce more reliable results.

**Acceptance Criteria:**

- [ ] `agents/builder.md` updated with a "Codemode" section in the tool reference table
- [ ] Section includes: when to use codemode vs direct tool calls (rule of thumb: 3+ sequential helm_* calls that share data → use codemode)
- [ ] Before/after examples included for the two most common Builder patterns: PRD+story+task cross-reference, and session hydration
- [ ] Existing tool table kept intact — codemode is additive, not a replacement
- [ ] Direct tool call guidance preserved: "Single-tool operations should still use direct tool calls"

---

### US-010: Phase 3 — test-flow Skill Instruction Updates

**Description:** As the test-flow skill, I need my instructions updated to use codemode for the test activity resolution step — replacing the current pattern of reading a 602-line JSON file, doing 50+ glob matches, and 25+ regex matches across multiple LLM turns.

**Acceptance Criteria:**

- [ ] `skills/test-flow/SKILL.md` updated with a codemode-based activity resolution block
- [ ] Block shows the codemode call that: reads `test-activity-rules.json`, gets changed files via `bash("git diff --name-only HEAD~1")`, matches patterns, returns resolved activities
- [ ] Old multi-step activity resolution flow replaced (not duplicated) — the codemode path becomes the canonical path
- [ ] Fallback documented: "If codemode tool is unavailable, fall back to direct file reads and sequential glob matching"
- [ ] Existing test-flow logic for skip gate, quality checks, and completion prompt unchanged

---

### US-011: Phase 3 — Planner Agent Instruction Updates

**Description:** As Planner, I need my instructions updated to use codemode for PRD analysis queries — replacing the current pattern of listing PRDs, fetching each one, and cross-referencing stories in sequential calls.

**Acceptance Criteria:**

- [ ] `agents/planner.md` (or equivalent planner agent file) updated with codemode guidance
- [ ] Example provided: fetching all draft PRDs with their story counts in a single codemode call
- [ ] Example provided: cross-referencing a PRD's stories against task status in a single codemode call
- [ ] Same direct-call guidance as Builder: "Single-tool operations still use direct tool calls"

---

## Non-Goals

- No changes to `helm-bridge.js` or any of the 31 existing tools
- No changes to the `helm-ade-macos` app (all work is toolkit-side)
- No new Supabase tables or database schema changes
- No UI surface for codemode in the Helm native app
- No automatic migration of existing agent behavior — opt-in via instructions
- No codemode for @developer or @explore agents (they do single-purpose tool calls, not data composition)
- No streaming partial results from codemode executions

---

## Technical Considerations

- **Plugin runtime:** Bun. Plugins have full access to `fs`, npm packages, Bun `$` API.
- **Toolkit propagation:** All changes take effect on next session start — no app rebuild needed. App pulls toolkit on launch.
- **Plugin inter-dependency:** `helm-codemode.js` needs access to tool implementations from `helm-bridge.js`. The opencode plugin SDK's plugin context or a shared module export is the mechanism — verified in US-001.
- **Zod schema source:** `helm-bridge.js` uses `tool.schema` (the `z` alias from `@opencode-ai/plugin`). Compatibility with type generation TBD in US-001.
- **Sandbox progression:** `vm` (Phase 1, no real security boundary, appropriate since LLM already has bash access) → `isolated-vm` (Phase 2, required once `bash` is exposed through codemode).
- **No app rebuild required:** `opencode.json`, `plugin-deps.json`, and all `.md` agent files are read at session start.

---

## Credential & Service Access Plan

No external credentials required for this PRD. The codemode plugin routes through existing `helm_*` tools, which use the existing `HELM_SUPABASE_*` environment variables already configured.

---

## Definition of Done

This PRD is complete when:

1. **`helm-codemode.js` plugin is registered** in `opencode.json` and loads cleanly on session start
2. **Phase 1 verified:** A single `codemode` call can fetch a PRD list, get a specific PRD, fetch its tasks, and return a summary — replacing 8+ sequential tool calls
3. **Phase 2 verified:** A single `codemode` call can read `data/test-activity-rules.json`, run `git diff --name-only HEAD~1`, and return a resolved activity list — the exact test-activity-resolution pattern
4. **Phase 3 verified:** Builder, test-flow, and Planner instructions include codemode guidance with before/after examples; all three agents have a documented fallback to direct tool calls
5. **All existing tools unchanged:** `helm-bridge.js` diff shows zero modifications
6. **Backward compatibility confirmed:** An agent using direct `helm_prd_list` calls still works correctly alongside an agent using codemode in the same session

---

## Open Questions

1. **Plugin inter-dependency mechanism:** How does `helm-codemode.js` access the real tool implementations from `helm-bridge.js` at runtime? Does the `@opencode-ai/plugin` SDK expose a plugin context with registered tools, or does `helm-codemode.js` need to import `helm-bridge.js` directly? (Answered in US-001.)
2. **opencode built-in tool routing (Phase 2):** How does `helm-codemode.js` call opencode's native `read`/`grep`/`glob`/`bash` tools from inside a plugin? Does the plugin context expose these, or does the plugin need to shell out? Needs investigation before US-007.
3. **LLM code generation quality:** Will the LLM reliably write correct async functions using the typed `codemode.*` interface, or will it need few-shot examples injected into the tool description? Consider adding 1-2 examples to the `codemode` tool's description.
