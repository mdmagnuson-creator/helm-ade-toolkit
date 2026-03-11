# Task Spec: {{title}}

## Summary

{{summary}}

**Original Request:** {{originalRequest}}

**Analysis Confidence:** {{confidence}} (High/Medium/Low)

**Scope:** {{scope}} (Small/Medium/Large)

## Understanding

{{understanding}}

## Affected Files

{{#each affectedFiles}}
- `{{this}}`
{{/each}}

## Downstream Consequences

{{#each consequences}}
- **{{severity}}:** {{description}}
{{/each}}

## Stories

### TSK-001: {{storyTitle}}

**Description:** {{storyDescription}}

**Acceptance Criteria:**

- [ ] {{criterion1}}
- [ ] {{criterion2}}
- [ ] {{criterion3}}

---

## Alternatives Considered

{{#if alternatives}}
{{#each alternatives}}
### Option {{@index}}: {{name}}

{{description}}

**Pros:**
{{#each pros}}
- {{this}}
{{/each}}

**Cons:**
{{#each cons}}
- {{this}}
{{/each}}

**Complexity:** {{complexity}}

{{/each}}

**Recommendation:** {{recommendation}}
{{else}}
No significant alternative approaches identified.
{{/if}}

---

## Implementation Notes

{{#if notes}}
{{notes}}
{{else}}
_None_
{{/if}}

---

## Metadata

| Field | Value |
|-------|-------|
| **Task ID** | {{taskId}} |
| **Created** | {{createdAt}} |
| **Status** | {{status}} |
| **Stories** | {{storyCount}} |
