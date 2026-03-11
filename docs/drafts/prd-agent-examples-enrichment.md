---
id: prd-agent-examples-enrichment
title: Agent Examples Enrichment
status: draft
priority: high
createdAt: 2026-03-04T00:00:00Z
---

# PRD: Agent Examples Enrichment

## Problem Statement

An audit of the 64 agents in the yo-go toolkit reveals a significant gap in example coverage. Examples serve as **few-shot prompts** that dramatically improve LLM behavior by providing concrete patterns to follow. The audit found:

### Current State

| Category | Total | With Examples | Without Examples | Coverage |
|----------|-------|---------------|------------------|----------|
| Primary agents | 7 | 7 | 0 | 100% |
| Critics | 22 | 2 | 20 | 9% |
| Testers | 5 | 3 | 2 | 60% |
| Implementation (*-dev) | 9 | 9 | 0 | 100%* |
| Operational | 10 | 4 | 6 | 40% |
| E2E/Playwright | 3 | 1 | 2 | 33% |

*Implementation agents have anti-patterns (❌) but no positive examples (✅) or conversation examples.

### Agents with ZERO Examples (34 total)

**Critics (20):**
- aesthetic-critic, ansible-critic, api-critic, backend-aws-critic, backend-critic-go, backend-critic-java, backend-critic-ts, cloudformation-critic, comment-critic, critic, dx-critic, exploit-critic, frontend-critic, handoff-contract-critic, network-critic, oddball-critic, policy-testability-critic, prompt-critic, public-page-critic, requirements-critic, security-critic, semantic-critic, tailwind-critic, update-schema-critic, workflow-enforcement-critic

**Testers (2):**
- go-tester, jest-tester

**Operational (6):**
- debugger, felix, qa-explorer, screenshot-maintainer, docs-writer, support-article-writer, tools-writer

**Other (3):**
- e2e-reviewer, prd, prd-impact-analyzer

### Why Examples Matter

1. **Concrete beats abstract** — Rules like "review for security issues" are vague; `❌ User input passed directly to SQL query` is unambiguous
2. **Pattern completion** — LLMs excel at completing patterns; examples give them patterns to complete
3. **Anti-pattern prevention** — `❌` examples explicitly show what NOT to do, preventing common mistakes
4. **Consistency** — Examples establish voice, format, and decision-making style across similar situations
5. **Grounding** — Examples anchor the agent's behavior to real scenarios, reducing drift

### Evidence from High-Performing Agents

The most effective agents in the toolkit have rich examples:

| Agent | ❌ | ✅ | Quality |
|-------|----|----|---------|
| builder.md | 43 | 20 | Excellent — dashboards, flows, anti-patterns |
| planner.md | 19 | 20 | Excellent — conversations, decisions, outputs |
| toolkit.md | 17 | 8 | Good — interactions, commands, outputs |
| seo-critic.md | 8 | 8 | Good — balanced good/bad patterns |
| e2e-auditor.md | 7 | 5 | Good — outputs, decisions |

These agents work well because they show the LLM exactly what to produce.

## Goals

1. **100% example coverage** — Every agent has at least 3 meaningful examples
2. **Balanced patterns** — Both `❌` (what NOT to do) and `✅` (what TO do) for decision-making agents
3. **Realistic scenarios** — Examples from actual usage, not contrived cases
4. **Output examples** — Show what the agent's output should look like
5. **Decision examples** — For critics, show the reasoning process

## Non-Goals

- Changing agent behavior or capabilities
- Adding new features to agents
- Restructuring agent files
- Modifying primary agents (already have good coverage)

## Proposed Solution

### Example Types Required

Each agent should have examples appropriate to its function:

| Agent Type | Required Examples |
|------------|-------------------|
| Critics | ❌ Bad code + why it's bad, ✅ Good code + why it's good, Review output format |
| Testers | Test file structure, Edge case identification, Assertion patterns |
| Implementation | Input/output transformation, Error handling, Convention following |
| Operational | Workflow execution, Decision points, Output format |
| Writers | Document structure, Content patterns, Style examples |

### Example Format Standards

**Anti-pattern example:**
```
❌ **Bad: SQL injection vulnerability**
```typescript
const query = `SELECT * FROM users WHERE id = ${userId}`;
```
Why: User input directly interpolated into SQL query.
```

**Good pattern example:**
```
✅ **Good: Parameterized query**
```typescript
const query = 'SELECT * FROM users WHERE id = $1';
const result = await db.query(query, [userId]);
```
Why: User input passed as parameter, preventing injection.
```

**Review output example:**
```
### Example Review Output

```
## Security Review: auth-handler.ts

### Critical Issues (2)

1. **Line 45: Hardcoded secret**
   - Found: `const secret = "abc123"`
   - Fix: Use environment variable `process.env.AUTH_SECRET`
   - Severity: CRITICAL

2. **Line 78: Missing rate limiting**
   - Found: Login endpoint has no rate limiting
   - Fix: Add rate limiter middleware
   - Severity: HIGH

### Passed Checks
- [x] HTTPS enforcement
- [x] Secure cookie flags
- [x] CORS configuration
```
```

---

## User Stories

### US-001: Critic Agent Examples (Priority: HIGH)

**Description:** Add comprehensive examples to all 20 critic agents that currently have none.

**Acceptance Criteria:**

- [ ] Each critic has at least 2 `❌` anti-pattern examples showing what to flag
- [ ] Each critic has at least 2 `✅` good pattern examples showing what passes
- [ ] Each critic has 1 example review output showing the expected format
- [ ] Examples are realistic and derived from actual codebases
- [ ] Examples include "Why" explanations for teaching

**Agents affected:**
aesthetic-critic, ansible-critic, api-critic, backend-aws-critic, backend-critic-go, backend-critic-java, backend-critic-ts, cloudformation-critic, comment-critic, critic, dx-critic, exploit-critic, frontend-critic, handoff-contract-critic, network-critic, oddball-critic, policy-testability-critic, prompt-critic, public-page-critic, requirements-critic, security-critic, semantic-critic, tailwind-critic, update-schema-critic, workflow-enforcement-critic

### US-002: Tester Agent Examples (Priority: HIGH)

**Description:** Add examples to tester agents showing test generation patterns.

**Acceptance Criteria:**

- [ ] go-tester: 3 examples showing Go test patterns with testify
- [ ] jest-tester: 3 examples showing Jest/TypeScript test patterns
- [ ] Examples show: happy path, error case, edge case
- [ ] Examples include assertion pattern examples
- [ ] Examples show proper test file naming and structure

**Agents affected:**
go-tester, jest-tester

### US-003: Operational Agent Examples (Priority: MEDIUM)

**Description:** Add workflow and output examples to operational agents.

**Acceptance Criteria:**

- [ ] debugger: 2 examples showing investigation workflow
- [ ] felix: 2 examples showing PR feedback watching
- [ ] qa-explorer: 2 examples showing bug discovery
- [ ] screenshot-maintainer: 2 examples showing screenshot workflow
- [ ] docs-writer: 2 examples showing documentation patterns
- [ ] support-article-writer: 2 examples showing article structure
- [ ] tools-writer: 2 examples showing tool definition patterns

**Agents affected:**
debugger, felix, qa-explorer, screenshot-maintainer, docs-writer, support-article-writer, tools-writer

### US-004: E2E/Review Agent Examples (Priority: MEDIUM)

**Description:** Add examples to E2E and review agents.

**Acceptance Criteria:**

- [ ] e2e-reviewer: 2 examples showing UI change identification
- [ ] prd: 2 examples showing PRD generation patterns
- [ ] prd-impact-analyzer: 2 examples showing impact analysis

**Agents affected:**
e2e-reviewer, prd, prd-impact-analyzer

### US-005: Implementation Agent Enhancement (Priority: LOW)

**Description:** Add positive examples (✅) to implementation agents that only have anti-patterns.

**Acceptance Criteria:**

- [ ] Each *-dev agent has at least 2 `✅` examples showing correct patterns
- [ ] Examples show the agent following project conventions
- [ ] Examples show proper error handling patterns
- [ ] Examples show delegation patterns where applicable

**Agents affected:**
aws-dev, docker-dev, go-dev, java-dev, playwright-dev, public-page-dev, python-dev, react-dev, terraform-dev

---

## Implementation Approach

### Phase 1: Critic Agents (US-001)

Critics are highest priority because they make decisions that affect code quality. Without examples, critics may:
- Flag valid patterns as issues
- Miss actual problems
- Produce inconsistent review formats

**Approach:**
1. Group critics by domain (backend, frontend, infrastructure, operational)
2. Research actual issues each critic should catch
3. Create realistic bad/good pattern pairs
4. Add example review output format

### Phase 2: Tester Agents (US-002)

Testers generate code that must compile and run. Examples ensure:
- Correct test structure
- Proper assertion patterns
- Framework-specific conventions

**Approach:**
1. Extract patterns from existing test files in projects
2. Show complete test file examples, not snippets
3. Include edge case identification examples

### Phase 3: Operational + E2E (US-003, US-004)

These agents have complex workflows. Examples ensure:
- Correct workflow execution
- Proper output formats
- Decision-making patterns

### Phase 4: Implementation Enhancement (US-005)

Add positive examples to balance the anti-patterns. Lower priority because these agents already work reasonably well.

---

## Definition of Done

- [ ] All 34 agents with zero examples have at least 3 examples each
- [ ] All 9 implementation agents have at least 2 `✅` examples
- [ ] Examples follow the format standards defined in this PRD
- [ ] No agent has only `❌` examples without corresponding `✅` examples
- [ ] Manual testing: Run 3 critics on sample code and verify improved output quality
- [ ] toolkit-structure.json updated with example count metadata (optional enhancement)

---

## Open Questions

1. **Example source:** Should examples be synthetic or extracted from real projects?
   - Recommendation: Mix — synthetic for teaching, real for realism

2. **Example count:** Is 3 examples per agent enough?
   - Recommendation: Start with 3, add more if agent behavior is still inconsistent

3. **Example maintenance:** How do we keep examples current as conventions evolve?
   - Recommendation: Tie examples to CONVENTIONS.md patterns where possible

---

## Metrics

Track before/after:

1. **Critic consistency** — Run same critic on 5 similar code samples, measure output consistency
2. **Tester compilation rate** — % of generated tests that compile on first try
3. **User corrections** — Count of "that's not right" corrections during agent interactions

---

## Appendix: Full Audit Data

### Agents by Example Count

| Tier | Count | Agents |
|------|-------|--------|
| Rich (10+) | 5 | builder (63), planner (39), toolkit (25), seo-critic (16), e2e-auditor (12) |
| Moderate (3-9) | 15 | developer (9), terraform-dev (8), session-status (7), merge-coordinator (12), qa-browser-tester (5), quality-critic (4), qa (4), wall-e (4), aws-dev (3), docker-dev (3), go-dev (3), java-dev (3), overlord (3), public-page-dev (3), python-dev (3), react-dev (3), hammer (3) |
| Sparse (1-2) | 10 | tester (2), react-tester (2), playwright-dev (1), e2e-playwright (2) |
| None (0) | 34 | (see list above) |
