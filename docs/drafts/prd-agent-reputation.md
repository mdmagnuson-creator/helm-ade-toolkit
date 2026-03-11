# PRD Draft: Agent Trust & Reputation System

**Status:** Draft  
**Priority:** Medium  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)

## Introduction

The paper emphasizes that effective delegation requires "trust calibration" — aligning trust with actual capabilities. Currently, yo-go treats all specialists equally regardless of their track record. A reputation system would inform delegation decisions based on historical performance.

## Problem Statement

1. **No performance tracking** — We don't know which specialists succeed most often
2. **No capability confidence** — "This agent can do X" is binary, not graduated
3. **No learning from failures** — Same delegation decisions repeat despite poor outcomes
4. **No informed alternative selection** — Dynamic reassignment doesn't know which alternative is best

## Goals

- Track success/failure rates per agent per task type
- Build capability confidence scores over time
- Inform dynamic reassignment decisions
- Surface insights to toolkit maintainers for agent improvement

## Proposed Solution

### Reputation Schema

```json
{
  "schemaVersion": 1,
  "agents": {
    "react-dev": {
      "taskTypes": {
        "component": { "success": 45, "failure": 5, "lastUpdated": "2026-02-28" },
        "styling": { "success": 30, "failure": 2, "lastUpdated": "2026-02-28" },
        "hooks": { "success": 20, "failure": 8, "lastUpdated": "2026-02-28" }
      },
      "overallSuccessRate": 0.88,
      "lastEvaluated": "2026-02-28T10:00:00Z"
    }
  }
}
```

### Data Collection

Record outcomes when:
- Specialist completes task successfully (verification passes)
- Specialist fails (verification fails, escalation required, or reassignment triggered)
- Classify task type from prompt keywords or explicit tagging

### Usage in Delegation

```
# Pseudocode for informed delegation
def select_specialist(task_type, alternatives):
    scores = []
    for agent in alternatives:
        if agent has reputation data for task_type:
            score = agent.reputation[task_type].success_rate
        else:
            score = 0.5  # Unknown defaults to 50%
        scores.append((agent, score))
    
    return sorted(scores, by=score, descending)[0]
```

## Open Questions

1. **Where should reputation data live?**
   - Option A: Global toolkit file (`~/.config/opencode/agent-reputation.json`)
   - Option B: Per-project (different codebases may have different patterns)
   - Option C: Hybrid (global defaults, project overrides)

2. **How do we categorize task types?**
   - Manual tagging vs. inference from prompts
   - Coarse categories (component, API, test) vs. fine-grained

3. **How much history is relevant?**
   - Recent performance may be more relevant than all-time
   - Sliding window vs. exponential decay

4. **Privacy implications?**
   - Reputation data reveals usage patterns
   - Should it be gitignored or shared?

5. **What about model changes?**
   - Agent using GPT-4o vs. Claude may have different reliability
   - Should reputation track agent+model pairs?

## User Stories

### US-001: Track specialist outcomes

**Acceptance Criteria:**
- [ ] Record success when task verification passes
- [ ] Record failure when task verification fails or escalation occurs
- [ ] Categorize by task type
- [ ] Persist to reputation file

### US-002: Use reputation in delegation decisions

**Acceptance Criteria:**
- [ ] Query reputation when selecting specialists
- [ ] Prefer higher-rated specialists for task type
- [ ] Fall back to default ordering for unknown agents
- [ ] Log reputation-informed decisions

### US-003: Surface insights to maintainers

**Acceptance Criteria:**
- [ ] Toolkit can generate reputation report
- [ ] Identify consistently failing agents/task-types
- [ ] Recommend areas for agent improvement

## Technical Considerations

- **Write conflicts:** Multiple sessions recording simultaneously
- **Storage size:** Could grow indefinitely — need pruning strategy
- **Cold start:** New agents have no reputation — need reasonable defaults
- **Gaming:** Could an agent artificially inflate success by picking easy tasks?

## Dependencies

- Dynamic Reassignment PRD (primary consumer of reputation data)
- Verifiable Task Completion (defines what "success" means)

## Success Metrics

- Delegation decisions improve over time (fewer escalations)
- First-choice specialist success rate increases
- Dynamic reassignment picks better alternatives

## Credential & Service Access Plan

No external credentials required for this PRD.
