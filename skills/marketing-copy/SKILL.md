---
name: marketing-copy
description: "Generate marketing copy from product documentation and PRDs. Use when you need to write headlines, value propositions, feature descriptions, CTAs, or other marketing text derived from the product. Triggers on: write marketing copy, generate headlines, create tagline, feature benefits, value proposition."
---

# Marketing Copy Skill

Generate marketing copy derived from product documentation, PRDs, and feature analysis.

---

## The Job

1. Understand what copy is needed
2. Gather context from product documentation
3. Generate copy following brand voice guidelines
4. Review with @copy-critic
5. Iterate if needed
6. Return the final copy

---

## Step 1: Understand the Request

Determine what type of copy is needed:

| Copy Type | Purpose | Typical Length |
|-----------|---------|----------------|
| **Headline** | Grab attention, convey main benefit | 5-12 words |
| **Subheadline** | Support headline, add detail | 10-25 words |
| **Value Proposition** | Core product benefit statement | 1-3 sentences |
| **Feature Description** | Explain what a feature does and why it matters | 2-4 sentences |
| **Benefit Statement** | Focus on user outcome, not feature | 1-2 sentences |
| **CTA** | Drive specific action | 2-5 words |
| **Tagline** | Memorable brand phrase | 3-8 words |
| **Meta Description** | SEO summary for search results | 150-160 characters |

If the request is ambiguous, ask one clarifying question.

---

## Step 2: Gather Context

**First, check for project context:**

```bash
cat docs/project.json 2>/dev/null || echo "NO_PROJECT_JSON"
```

If `docs/project.json` exists, extract:
- `context.brandVoice` — Path to brand voice document
- `context.productName` — Product name to use in copy
- `projectName` — Fallback if no productName set

**Then read reference documents (if they exist):**

From `project.json` context paths OR standard locations:
```
docs/marketing/brand-voice.md        # Tone and messaging guidelines
docs/marketing/target-personas.md    # User profiles and pain points
docs/marketing/feature-matrix.md     # Feature descriptions and benefits
docs/prd.md                          # Product details
docs/prd-*.md                        # Any PRD files
```

### Key Information to Extract

From **brand-voice.md**:
- Tone (professional, friendly, authoritative, etc.)
- Words to use / words to avoid
- Writing style guidelines

From **target-personas.md**:
- Primary audience
- Pain points
- Language they use
- What they care about

From **feature-matrix.md** or **PRD**:
- Feature capabilities
- User benefits
- Differentiators from competitors

---

## Step 3: Generate Copy

Follow these principles:

### 1. Lead with Benefits, Not Features

❌ "Our calendar supports multi-resource scheduling"
✅ "See your entire crew's availability at a glance"

### 2. Be Specific

❌ "Save time with our powerful tools"
✅ "Schedule a week of installs in under 10 minutes"

### 3. Use Active Voice

❌ "Jobs are automatically assigned to crews"
✅ "Assign jobs to your crews with one click"

### 4. Match the Persona's Language

For a flooring contractor:
- ❌ "Optimize your resource allocation paradigm"
- ✅ "Know which crew is available, when"

### 5. Create Urgency Without Being Pushy

- ✅ "Start scheduling smarter today"
- ✅ "Your free trial is waiting"
- ❌ "ACT NOW! LIMITED TIME ONLY!"

---

## Step 4: Copy Formulas

### Headlines

**Problem-Solution:**
> "Stop [pain point]. Start [benefit]."
> Example: "Stop double-booking crews. Start scheduling with confidence."

**How-To:**
> "How [persona] [achieves benefit]"
> Example: "How flooring pros schedule 30% more installs"

**Question:**
> "[Question about pain point]?"
> Example: "Still juggling schedules on paper?"

**Benefit-Focused:**
> "[Achieve outcome] with [minimal effort]"
> Example: "Schedule your entire week in minutes"

### Value Propositions

**Format:**
> For [target customer] who [pain point], [Product] is a [category] that [key benefit]. Unlike [alternative], we [differentiator].

**Example:**
> For flooring businesses who struggle with scheduling chaos, Example Scheduler is a business management platform that puts your entire operation in one place. Unlike paper calendars and spreadsheets, we show your crews, jobs, and availability in a single view.

### CTAs

| Goal | Examples |
|------|----------|
| Start trial | "Start Free Trial", "Try It Free" |
| See product | "See How It Works", "Watch Demo" |
| Contact | "Talk to Sales", "Get a Quote" |
| Learn more | "Learn More", "See Features" |

---

## Step 5: Review

Invoke @copy-critic to review the generated copy:

```
@copy-critic: Review this marketing copy.

Copy type: [headline / value prop / feature description / etc.]
Target audience: [persona from target-personas.md]
Copy:
---
[the generated copy]
---

Check for: clarity, target market fit, accuracy, brand voice alignment.
```

Address any Critical Issues or Warnings before finalizing.

---

## Output Format

Return copy in a structured format:

```markdown
## Marketing Copy

### [Copy Type]

**Primary option:**
> [The recommended copy]

**Alternatives:**
1. [Alternative 1]
2. [Alternative 2]

**Rationale:**
- [Why this copy works for the target audience]
- [What pain point or benefit it addresses]

**Usage notes:**
- [Where this copy should be used]
- [Any variations needed for different contexts]
```

---

## Examples

### Example 1: Feature Headline

**Request:** Write a headline for the scheduling calendar feature

**Context gathered:**
- Target: Small flooring businesses (5-20 employees)
- Pain point: Double-booking crews, missed appointments
- Feature: Visual calendar with drag-and-drop scheduling

**Output:**

```markdown
## Marketing Copy

### Feature Headline

**Primary option:**
> See every job, every crew, every day—at a glance

**Alternatives:**
1. Your entire schedule, one simple view
2. No more double-booking. No more missed installs.
3. Drag, drop, done. Scheduling made simple.

**Rationale:**
- Addresses the "where is everyone?" pain point
- "At a glance" emphasizes speed and ease
- Uses concrete terms (job, crew, day) that resonate with trades

**Usage notes:**
- Use on features/scheduling page hero
- Alternative 2 works well for problem-aware visitors
- Alternative 3 emphasizes the UI interaction
```

### Example 2: Homepage Value Proposition

**Request:** Write the main value proposition for the homepage

**Context gathered:**
- Product: Example Scheduler
- Target: Flooring retailers and contractors
- Key benefit: All-in-one scheduling and business management
- Differentiator: Built specifically for flooring businesses

**Output:**

```markdown
## Marketing Copy

### Value Proposition

**Primary option:**
> Run your flooring business from one place.
> Schedule crews, track jobs, and keep customers happy—without the paperwork.

**Alternatives:**
1. The scheduling tool built for flooring pros.
2. From estimate to install, manage it all in one app.
3. Stop juggling spreadsheets. Start running your business.

**Rationale:**
- "One place" addresses the fragmentation pain point
- Lists three concrete benefits (schedule, track, customers)
- "Without the paperwork" speaks to manual process pain
- Uses "flooring business" for relevance/SEO

**Usage notes:**
- Pair with a CTA like "Start Free Trial" or "See How It Works"
- Hero section with product screenshot
- Alternative 3 works well if targeting spreadsheet users specifically
```

### Example 3: CTA Variations

**Request:** Generate CTAs for the pricing page

**Output:**

```markdown
## Marketing Copy

### CTAs - Pricing Page

**Primary CTA (main plan):**
> Start Free Trial

**Secondary CTA (enterprise):**
> Talk to Sales

**Alternatives:**
1. Get Started Free / Contact Us
2. Try It Free / Get a Custom Quote
3. Start Scheduling Today / Let's Talk

**Rationale:**
- "Start Free Trial" is clear, low-commitment
- "Talk to Sales" appropriate for enterprise inquiries
- Avoid generic "Sign Up" or "Buy Now"

**Usage notes:**
- Primary CTA should be prominent, high-contrast button
- Secondary CTA can be text link or outline button
- Keep CTA text under 4 words
```

---

## Integration with Other Skills

### With public-page skill

The public-page skill invokes this skill when it needs copy for a new page. After receiving copy, it implements the page using @public-page-dev.

### With screenshot skill

Marketing copy often accompanies screenshots. Coordinate to ensure copy and visuals tell a cohesive story.

---

## When to Escalate

If you cannot generate appropriate copy because:

1. **No brand voice defined** — Suggest creating `docs/marketing/brand-voice.md`
2. **No target personas** — Suggest creating `docs/marketing/target-personas.md`
3. **Feature not documented** — Ask for clarification or point to PRD gaps
4. **Conflicting guidance** — Highlight the conflict and ask for direction
