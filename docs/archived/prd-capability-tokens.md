# PRD Draft: Delegation Capability Tokens

**Status:** Draft  
**Priority:** Medium  
**Source:** Intelligent AI Delegation paper (arXiv:2602.11865)

## Introduction

The paper introduces "Delegation Capability Tokens" — attenuated authorization that restricts what a delegatee can do. Currently, yo-go delegation is binary: agents either have full access or no access. This creates unnecessary risk when specialists only need limited permissions.

## Problem Statement

1. **Binary permissions** — Specialists get full tool access even when they only need read or write to specific files
2. **No scope attenuation** — Can't say "only modify files in src/components/"
3. **No restriction chaining** — Sub-delegates inherit full permissions
4. **Blast radius uncontrolled** — A misbehaving specialist can modify anything

## Goals

- Define capability tokens with scoped permissions
- Restrict specialists to minimum necessary access
- Chain restrictions through delegation hierarchy
- Provide clear audit trail of permission grants

## Proposed Solution

### Capability Token Schema

```json
{
  "token": "cap_abc123",
  "grantedTo": "react-dev",
  "grantedBy": "builder",
  "scope": {
    "files": {
      "read": ["**/*"],
      "write": ["src/components/**/*.tsx", "src/components/**/*.css"],
      "create": ["src/components/**/*"],
      "delete": []
    },
    "commands": {
      "allow": ["npm test", "npm run lint"],
      "deny": ["rm -rf", "git push --force"]
    },
    "tools": {
      "allow": ["read", "write", "edit", "bash"],
      "deny": ["task"]  // Can't delegate further
    }
  },
  "expires": "2026-02-28T12:00:00Z",
  "constraints": {
    "maxTokensGenerated": 50000,
    "maxTimeMinutes": 30
  }
}
```

### Scope Types

| Scope | Description | Example |
|-------|-------------|---------|
| files.read | Glob patterns for readable files | `["src/**/*", "!src/secrets/**"]` |
| files.write | Glob patterns for writable files | `["src/components/**/*.tsx"]` |
| files.create | Where new files can be created | `["src/components/new/"]` |
| files.delete | Which files can be deleted | `[]` (none) |
| commands.allow | Allowed bash commands | `["npm test", "npm run lint"]` |
| commands.deny | Explicitly blocked commands | `["rm -rf", "git push --force"]` |
| tools.allow | Allowed Claude tools | `["read", "write", "edit"]` |
| tools.deny | Blocked Claude tools | `["task"]` |

### Restriction Chaining

When a delegatee delegates further, permissions can only narrow:

```
Builder grants: write to ["src/**/*"]
    ↓
Developer grants to react-dev: write to ["src/components/**/*"]
    ↓
react-dev CANNOT grant: write to ["src/api/**/*"]  // Outside their scope
```

### Enforcement

How do we actually enforce these restrictions?

**Option A: Trust-based (documentation only)**
- Tokens are advisory
- Agents documented to respect them
- No hard enforcement

**Option B: Wrapper enforcement**
- Custom tool wrappers that check permissions before execution
- More reliable but more complex

**Option C: Prompt injection**
- Include permissions in specialist prompt
- Rely on model to self-enforce
- Can be circumvented but simple to implement

## Open Questions

1. **How do we enforce restrictions technically?**
   - Claude tools don't have built-in permission systems
   - May need wrapper layer or rely on prompt compliance
   - Paper acknowledges this is hard for LLM systems

2. **What happens when a specialist tries to exceed scope?**
   - Block the action and notify?
   - Escalate to delegator?
   - Log and proceed (audit-only)?

3. **Is this worth the complexity?**
   - Current system works without restrictions
   - Adds cognitive overhead to delegation
   - May be solving theoretical rather than actual problems

4. **How do tokens interact with tool configurations?**
   - Agent frontmatter already has `tools:` section
   - Tokens would need to layer on top

5. **Who manages token lifecycle?**
   - Creation, expiration, revocation
   - Where are active tokens stored?

## User Stories

### US-001: Define capability tokens in delegation

**Acceptance Criteria:**
- [ ] Builder can specify scope when delegating to specialist
- [ ] Scope includes file patterns, commands, and tool restrictions
- [ ] Scope is passed to specialist in prompt
- [ ] Specialist is instructed to respect scope

### US-002: Log scope violations

**Acceptance Criteria:**
- [ ] If specialist attempts action outside scope, log it
- [ ] Include what was attempted and why it was blocked/flagged
- [ ] Surface to user for review
- [ ] Don't silently fail

### US-003: Chain restrictions through delegation

**Acceptance Criteria:**
- [ ] Sub-delegates receive narrower scope than delegator
- [ ] Delegatee cannot expand permissions
- [ ] Scope constraints are cumulative down the chain

## Technical Considerations

- **Enforcement complexity:** Hard to enforce without custom tooling
- **Performance:** Checking permissions on every action adds latency
- **Compatibility:** Must work with existing agent system
- **Auditability:** Need to log permission grants and checks

## Dependencies

- May require changes to how agents invoke tools
- Could benefit from Dynamic Reassignment (escalate on scope violation)

## Risk Assessment

This PRD has the highest implementation complexity of the paper-inspired improvements:
- No built-in permission system in Claude tools
- Would require significant architecture changes
- Benefits are theoretical (we haven't had blast radius incidents)

**Recommendation:** Consider this for a future version, after Dynamic Reassignment and Verifiable Completion prove valuable.

## Success Metrics

- Reduced blast radius of specialist errors
- Clear audit trail of permission grants
- No incidents caused by specialists exceeding intended scope

## Credential & Service Access Plan

No external credentials required for this PRD.
