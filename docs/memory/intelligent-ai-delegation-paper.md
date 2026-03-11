# Intelligent AI Delegation - Paper Summary

**Paper:** Intelligent AI Delegation (arXiv:2602.11865)  
**Authors:** Google DeepMind  
**Date Reviewed:** 2026-02-28  
**Relevance:** High - directly applicable to yo-go toolkit's agent delegation architecture

## Overview

The paper proposes a comprehensive framework for AI-to-AI delegation, addressing how AI systems can effectively delegate tasks to other AI systems. Key insight: delegation is not just task assignment—it requires dynamic assessment, adaptive execution, transparency, coordination, and resilience.

## Five Pillars of Intelligent Delegation

### 1. Dynamic Assessment
- **Granular inference** of agent state and capabilities
- **Capability matching** - match task requirements to agent skills
- **Trust calibration** - align trust level with actual capabilities
- Important concept: **Authority Gradient** - capability disparities impede communication; less capable agents won't challenge requests from more capable ones

### 2. Adaptive Execution
- Handle **context shifts** during execution
- **Switch delegatees mid-execution** when needed (dynamic reassignment)
- Graceful degradation and fallback mechanisms
- Key insight: Tasks often change while being executed; rigid delegation fails

### 3. Structural Transparency
- **Auditability** via monitoring and logging
- **Verifiable completion** - explicit criteria before delegation
- Observable delegation chains
- Contract-first decomposition: only delegate if verification is possible

### 4. Scalable Market Coordination
- **Trust/reputation systems** - track agent reliability over time
- **Multi-objective optimization** - balance speed, cost, quality
- Matching delegators with best-fit delegatees
- Reputation informs future delegation decisions

### 5. Systemic Resilience
- **Security** and permission handling
- **Liability firebreaks** - contain damage from failures
- **Delegation Capability Tokens** - attenuated authorization with scope restrictions
- Scope attenuation: restrict delegatees to minimum necessary permissions

## Key Concepts for Yo-Go

### Authority Gradient
When capability disparities exist, less experienced agents won't challenge requests from more capable ones. This creates sycophancy risk where agents execute instructions without critical scrutiny.

**Yo-Go implication:** Specialist agents should have clear authority to push back on Builder/Developer when tasks are outside their expertise or poorly specified.

### Zone of Indifference
Range of instructions agents will execute without critical evaluation. Too wide = agents do harmful things uncritically. Too narrow = constant pushback on valid requests.

**Yo-Go implication:** Define explicit boundaries for each agent where they MUST question/refuse vs. execute.

### Contract-First Decomposition
Only delegate a task if you can verify its completion. If you can't write acceptance criteria, the task isn't ready for delegation.

**Yo-Go implication:** Builder should require explicit verification criteria in every task specification before delegating.

### Checkpoint Artifacts
Serialize partial work so another agent can resume mid-task. Enables:
- Mid-execution agent swaps when specialists fail
- Recovery from rate limits, crashes, context overflow
- Parallel work with periodic sync points

**Yo-Go implication:** Standardize checkpoint format beyond current builder-state.json to include work artifacts, not just status.

### Delegation Capability Tokens
Attenuated authorization that restricts scope:
- Read-only vs. read-write
- Specific files/directories only
- Time-limited permissions
- Restriction chaining (delegatee can't expand permissions)

**Yo-Go implication:** Current delegation is binary (all or nothing). Could implement scope tokens for safer delegation.

### Span of Control
Cognitive/bandwidth limits on how many agents one orchestrator can effectively manage. Beyond this, coordination overhead dominates.

**Yo-Go implication:** Builder managing 40+ specialists may exceed effective span of control. Consider sub-orchestrators.

## Alignment Assessment: Yo-Go vs. Paper Framework

| Concept | Paper Recommends | Yo-Go Status |
|---------|-----------------|--------------|
| Task Decomposition | Hierarchical, verifiable | ✅ Builder → Developer → Specialists |
| Clear Roles | Explicit boundaries, identity locks | ✅ Strong agent boundaries |
| Monitoring | Observable state, heartbeat | ✅ Builder state, heartbeat |
| Verifiable Completion | Contract-first, explicit criteria | ⚠️ Partial - tests exist, but criteria not always explicit |
| Trust/Reputation | Track success rates, inform decisions | ❌ Not implemented |
| Dynamic Reassignment | Mid-execution fallback, retry with alternatives | ❌ Not implemented |
| Checkpoint Serialization | Standardized format for agent swaps | ⚠️ Partial - builder-state.json exists but limited |
| Scope Attenuation | Capability tokens, minimum permissions | ❌ Binary delegation |
| Authority Gradient Awareness | Encourage pushback from specialists | ⚠️ Identity locks help, but no explicit pushback protocol |

## Recommended PRDs

Based on gaps identified, these PRDs would bring yo-go closer to the paper's framework:

1. **Dynamic Reassignment** (High Priority)
   - Mid-execution fallback when specialists fail
   - Automatic retry with different specialist
   - Escalation protocols

2. **Agent Trust & Reputation System** (Medium Priority)
   - Track agent success/failure rates
   - Capability confidence scores
   - Inform future delegation decisions

3. **Verifiable Task Completion** (Medium Priority)
   - Contract-first task specifications
   - Explicit verification criteria before delegation
   - Acceptance tests defined upfront

4. **Delegation Capability Tokens** (Medium Priority)
   - Scope attenuation (read-only, specific files, time-limited)
   - Restriction chaining in delegation chains

5. **Checkpoint & State Serialization** (Medium Priority)
   - Standardized checkpoint format for mid-task swaps
   - Include work artifacts, not just status
   - Enable partial work recovery

## References

- Paper: https://arxiv.org/abs/2602.11865
- Related yo-go files:
  - `agents/builder.md` - Delegation orchestrator
  - `agents/developer.md` - Task executor
  - `skills/builder-state/SKILL.md` - Current state management
  - `schemas/builder-state.schema.json` - State schema
