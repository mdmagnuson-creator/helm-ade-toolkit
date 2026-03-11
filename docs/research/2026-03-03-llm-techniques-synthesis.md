# LLM Research Synthesis: Techniques for yo-go Toolkit

**Date:** 2026-03-03  
**Source:** arXiv papers on recent LLM prompting and agent techniques  
**Purpose:** Identify actionable improvements for the yo-go autonomous agent toolkit

---

## Executive Summary

After reviewing recent arXiv papers on LLM reasoning, tool use, and agent architectures, **6 techniques** were identified that are NOT currently implemented in the yo-go toolkit and show strong potential for improving agent performance.

| Technique | Source Paper | Implementation Priority | Estimated Impact |
|-----------|--------------|------------------------|------------------|
| Structured Reasoning Patterns | Ctrl-R | High | Improved reasoning accuracy |
| DAG-based Skill Orchestration | AgentSkillOS | High | Better multi-step task handling |
| Tool Verification Loops | T³RL | Medium | Higher reliability for critical operations |
| Capability Tree Organization | AgentSkillOS | Medium | Easier skill discovery and maintenance |
| Verification-Aware Confidence | T³RL | Low | Better output quality signaling |
| Pre-task Belief Elicitation | Pre-CoT | Low | Reduced reasoning hallucination |

---

## Technique Details

### 1. Structured Reasoning Patterns (HIGH PRIORITY)

**Source:** Ctrl-R paper  
**Key insight:** Specific lexical patterns in prompts reliably trigger better reasoning behavior in LLMs.

**Current yo-go approach:** Free-form agent instructions with occasional bullet points.

**Recommended changes:**
- Add reasoning pattern templates to agent prompts
- Use explicit markers: "Step 1:", "Therefore:", "Given that:"
- Structure complex decisions as numbered decision trees
- Add "Let me verify:" checkpoints before final outputs

**Implementation location:** `agents/*.md` preambles, skill instruction sections

**Example:**
```markdown
## Reasoning Protocol

When analyzing a task:
1. STATE the goal clearly
2. LIST the constraints and requirements
3. ENUMERATE possible approaches
4. EVALUATE each approach against constraints
5. SELECT the best approach with explicit reasoning
6. VERIFY the selection against original goal
```

---

### 2. DAG-based Skill Orchestration (HIGH PRIORITY)

**Source:** AgentSkillOS paper  
**Key insight:** Representing skill dependencies as a directed acyclic graph (DAG) enables better multi-skill pipelines than flat skill invocation.

**Current yo-go approach:** Skills are invoked independently; coordination is ad-hoc.

**Recommended changes:**
- Define skill dependencies in skill frontmatter
- Allow skills to declare inputs/outputs
- Enable automatic skill chaining based on output→input matching
- Add orchestration layer that builds execution plans

**Implementation location:** New `skills/meta/skill-orchestration/` skill, skill schema extension

**Example skill frontmatter:**
```yaml
---
name: test-flow
inputs:
  - type: file_changes
  - type: test_command
outputs:
  - type: test_results
  - type: coverage_report
depends_on:
  - builder-state  # Must load state first
chains_to:
  - e2e-quality    # Can trigger E2E after unit tests
---
```

---

### 3. Tool Verification Loops (MEDIUM PRIORITY)

**Source:** T³RL paper  
**Key insight:** External verification of tool outputs significantly improves reliability, especially for operations with side effects.

**Current yo-go approach:** Tools are trusted; verification is manual/ad-hoc.

**Recommended changes:**
- Add post-execution verification for critical operations
- Implement idempotency checks for file operations
- Add rollback capabilities for failed multi-step operations
- Create verification skill for common patterns

**Implementation location:** `agents/developer.md`, new `skills/tool-verification/` skill

**Verification patterns:**
| Operation | Verification |
|-----------|--------------|
| File write | Read back and compare hash |
| Git commit | Verify commit exists, staged files match |
| API call | Check response status and expected fields |
| Database write | Query to confirm data persisted |

---

### 4. Capability Tree Organization (MEDIUM PRIORITY)

**Source:** AgentSkillOS paper  
**Key insight:** Hierarchical organization of capabilities improves skill discovery and reduces prompt size.

**Current yo-go approach:** Flat skill list in `toolkit-structure.json`, categories in manifest.

**Recommended changes:**
- Restructure skills into capability trees
- Enable lazy loading of skill subtrees
- Add skill search by capability description
- Reduce agent prompt size by loading only relevant branches

**Implementation location:** `toolkit-structure.json` schema, skill loading logic

**Example tree:**
```
capabilities/
├── testing/
│   ├── unit/
│   │   ├── jest-tester
│   │   ├── go-tester
│   │   └── react-tester
│   └── e2e/
│       ├── playwright-dev
│       └── e2e-quality
├── implementation/
│   ├── react-dev
│   ├── go-dev
│   └── java-dev
└── review/
    ├── frontend-critic
    ├── backend-critic-*
    └── security-critic
```

---

### 5. Verification-Aware Confidence Scoring (LOW PRIORITY)

**Source:** T³RL paper  
**Key insight:** Outputs that have been externally verified should be weighted higher than unverified reasoning.

**Current yo-go approach:** No confidence scoring; all outputs treated equally.

**Recommended changes:**
- Add verification status to task outputs
- Track which steps were verified vs. inferred
- Surface confidence in completion reports
- Allow users to request higher verification for critical paths

**Implementation location:** `builder-state` skill, completion report format

**Example output:**
```
## Task Completion Report

| Step | Status | Verified |
|------|--------|----------|
| Schema update | Complete | ✓ (tests pass) |
| Migration | Complete | ✓ (db query confirmed) |
| UI update | Complete | ✗ (visual check pending) |

Overall confidence: HIGH (2/3 verified)
```

---

### 6. Pre-task Belief Elicitation (LOW PRIORITY)

**Source:** Pre-CoT paper  
**Key insight:** Asking the model to state its initial answer BEFORE reasoning reduces hallucination by anchoring expectations.

**Current yo-go approach:** Direct reasoning without belief elicitation.

**Recommended changes:**
- For complex analysis tasks, ask for initial hypothesis first
- Compare final answer to initial belief
- Flag cases where reasoning changed the answer (potential insight or error)
- Use as a calibration signal for task difficulty

**Implementation location:** `adhoc-workflow` skill analysis phase

**Example flow:**
```
User: Why is the API returning 500 errors?

Agent (belief elicitation):
"Initial hypothesis: Database connection issue (common cause)"

Agent (investigation):
[runs diagnostics, checks logs]

Agent (conclusion):
"Root cause: Rate limiting on external API (different from hypothesis)"
"Note: Initial hypothesis was incorrect — this was a less common cause"
```

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

1. **Structured Reasoning Patterns**
   - Update 3-5 key agents with reasoning protocol section
   - Measure impact on task completion quality
   - Rollout to remaining agents if positive

2. **Pre-task Belief Elicitation**
   - Add to `adhoc-workflow` skill analysis phase
   - Light-touch experiment: hypothesis before investigation

### Phase 2: Infrastructure (2-4 weeks)

3. **Tool Verification Loops**
   - Create `skills/tool-verification/` skill
   - Add verification to `developer.md` for file writes
   - Add verification to git operations

4. **Capability Tree Organization**
   - Extend `toolkit-structure.json` schema
   - Restructure existing skills into tree
   - Update skill loading to support hierarchy

### Phase 3: Advanced (4-8 weeks)

5. **DAG-based Skill Orchestration**
   - Design skill dependency schema
   - Implement orchestration layer
   - Migrate existing skills to declare dependencies

6. **Verification-Aware Confidence**
   - Add verification tracking to builder-state
   - Update completion reports
   - Add user-facing confidence indicators

---

## Appendix: Source Papers

1. **Ctrl-R** — "Controllable Reasoning via Lexical Patterns" (2025)
   - Key contribution: Identified specific text patterns that improve reasoning

2. **AgentSkillOS** — "Operating System for Agent Skills" (2025)
   - Key contribution: DAG-based skill orchestration, capability trees

3. **T³RL** — "Tool-augmented Training with Task-specific Reinforcement Learning" (2025)
   - Key contribution: Tool verification loops, verification-aware confidence

4. **Pre-CoT** — "Pre-Chain-of-Thought: Eliciting Beliefs Before Reasoning" (2025)
   - Key contribution: Belief elicitation reduces hallucination

---

## Next Steps

1. Review this synthesis with the user
2. Prioritize based on current pain points
3. Create PRDs for Phase 1 items if approved
4. Track implementation in `docs/prd-registry.json`
