# Conventions

> This document describes the coding conventions and patterns used in {{PROJECT_NAME}}.
> AI agents should follow these patterns to maintain consistency.

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `UserProfile.tsx` |
| Hooks | camelCase with `use` prefix | `useAuth.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Types | PascalCase | `User.ts` or inline |
| Constants | SCREAMING_SNAKE_CASE | `API_ENDPOINTS.ts` |
| Test files | Same as source + `.test` | `UserProfile.test.tsx` |

<!-- 
BOOTSTRAP NOTE: Update this table to match your project's conventions.
Delete rows that don't apply.
-->

## Directory Conventions

### Component Organization

```
components/
├── ui/                     # Base UI components (design system)
│   ├── Button.tsx
│   ├── Input.tsx
│   └── index.ts           # Barrel export
├── features/              # Feature-specific components
│   └── calendar/
│       ├── CalendarView.tsx
│       ├── EventCard.tsx
│       └── index.ts
└── layouts/               # Layout components
    ├── Header.tsx
    └── Sidebar.tsx
```

<!-- 
BOOTSTRAP NOTE: Show your actual component organization pattern.
-->

### Co-location vs Centralization

**This project uses:** {{COLOCATION_STRATEGY}}

<!-- 
Options:
- "Co-location: tests, styles, and types live next to components"
- "Centralized: tests in __tests__, types in types/, styles in styles/"
- "Hybrid: components co-located, shared types centralized"
-->

## Component Patterns

### Basic Component Structure

```{{LANGUAGE}}
{{COMPONENT_TEMPLATE}}
```

<!-- 
BOOTSTRAP NOTE: Provide a template showing your standard component structure.

Example for React + TypeScript:

```tsx
import { type FC } from 'react'
import { cn } from '@/lib/utils'

interface ComponentNameProps {
  className?: string
  children: React.ReactNode
}

export const ComponentName: FC<ComponentNameProps> = ({ 
  className,
  children 
}) => {
  return (
    <div className={cn('base-styles', className)}>
      {children}
    </div>
  )
}
```
-->

### Prop Patterns

- **Required vs Optional:** {{PROP_PATTERN}}
- **Event Handlers:** {{EVENT_HANDLER_PATTERN}}
- **Render Props:** {{RENDER_PROP_PATTERN}}

<!-- 
BOOTSTRAP NOTE: Document your prop conventions.

Examples:
- "Required props first, optional props with defaults last"
- "Event handlers named onVerbNoun (onClick, onSubmitForm)"
- "Prefer composition over render props"
-->

## Styling

### Framework: {{STYLING_FRAMEWORK}}

### Class Naming

{{CLASS_NAMING_CONVENTION}}

<!-- 
Examples:
- "Use Tailwind utility classes directly, extract to @apply only for repeated patterns"
- "BEM naming: block__element--modifier"
- "CSS Modules with camelCase class names"
-->

### Dark Mode

**Strategy:** {{DARK_MODE_STRATEGY}}

```{{LANGUAGE}}
{{DARK_MODE_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Show how to handle dark mode.

Example for Tailwind class strategy:
```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  Content adapts to theme
</div>
```
-->

### Responsive Design

**Breakpoints:** {{BREAKPOINTS}}

**Approach:** {{RESPONSIVE_APPROACH}}

<!-- 
Examples:
- "Mobile-first: start with mobile styles, add md: and lg: for larger screens"
- "Desktop-first: start with desktop, use max-md: for smaller screens"
-->

## State Management

### Local State

{{LOCAL_STATE_PATTERN}}

<!-- 
Example:
- "useState for simple component state"
- "useReducer for complex state with multiple sub-values"
-->

### Global State

{{GLOBAL_STATE_PATTERN}}

<!-- 
Examples:
- "React Context for auth and theme"
- "Zustand for complex global state (cart, filters)"
- "Server state via React Query, no global store"
-->

### Server State

{{SERVER_STATE_PATTERN}}

<!-- 
Examples:
- "React Query for caching and synchronization"
- "SWR for data fetching with revalidation"
- "Server Components for read, Server Actions for write"
-->

## Data Fetching

### Pattern: {{DATA_FETCHING_PATTERN}}

```{{LANGUAGE}}
{{DATA_FETCHING_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Show your standard data fetching pattern.

Example for Server Components:
```tsx
// In a Server Component
async function Page() {
  const data = await db.query.users.findMany()
  return <UserList users={data} />
}
```

Example for Client with React Query:
```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then(r => r.json())
})
```
-->

## Error Handling

### API Errors

{{API_ERROR_PATTERN}}

```{{LANGUAGE}}
{{API_ERROR_EXAMPLE}}
```

### UI Errors

{{UI_ERROR_PATTERN}}

<!-- 
Examples:
- "Error boundaries for component-level errors"
- "Toast notifications for user-facing errors"
- "Inline error messages for form validation"
-->

## Form Handling

### Library: {{FORM_LIBRARY}}

### Validation: {{VALIDATION_LIBRARY}}

```{{LANGUAGE}}
{{FORM_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Show your standard form pattern.

Example with react-hook-form + Zod:
```tsx
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

const form = useForm<z.infer<typeof schema>>({
  resolver: zodResolver(schema)
})
```
-->

## API Design

### Route Naming

{{API_ROUTE_NAMING}}

<!-- 
Examples:
- "RESTful: /api/users, /api/users/:id, /api/users/:id/posts"
- "Action-based: /api/user.create, /api/user.update"
-->

### Response Format

```json
{{API_RESPONSE_FORMAT}}
```

<!-- 
Example:
```json
{
  "data": { ... },
  "error": null,
  "meta": { "page": 1, "total": 100 }
}
```
-->

### Error Response Format

```json
{{API_ERROR_FORMAT}}
```

## Testing

### Unit Tests

**Framework:** {{UNIT_TEST_FRAMEWORK}}
**Location:** {{UNIT_TEST_LOCATION}}

```{{LANGUAGE}}
{{UNIT_TEST_EXAMPLE}}
```

### Integration Tests

**Framework:** {{INTEGRATION_TEST_FRAMEWORK}}

### E2E Tests

**Framework:** {{E2E_TEST_FRAMEWORK}}
**Location:** {{E2E_TEST_LOCATION}}

```{{LANGUAGE}}
{{E2E_TEST_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Show your testing conventions.
Include what to mock, how to structure tests, naming conventions.
-->

## Git Conventions

### Branch Naming

{{BRANCH_NAMING}}

<!-- 
Examples:
- "feature/TICKET-123-short-description"
- "fix/bug-description"
- "chore/update-dependencies"
-->

### Commit Messages

{{COMMIT_MESSAGE_FORMAT}}

<!-- 
Examples:
- "Conventional Commits: feat: add user registration"
- "Imperative mood: Add user registration flow"
- "Ticket reference: [PROJ-123] Add user registration"
-->

### PR Guidelines

{{PR_GUIDELINES}}

## Import Order

```{{LANGUAGE}}
{{IMPORT_ORDER_EXAMPLE}}
```

<!-- 
Example:
```tsx
// 1. React/framework imports
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 2. External libraries
import { format } from 'date-fns'
import { toast } from 'sonner'

// 3. Internal absolute imports (aliases)
import { Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

// 4. Relative imports
import { LocalComponent } from './LocalComponent'

// 5. Types (if separate)
import type { User } from '@/types'
```
-->

## Comments

### When to Comment

{{COMMENT_GUIDELINES}}

<!-- 
Examples:
- "Comment WHY, not WHAT - code should be self-documenting"
- "JSDoc for public APIs and complex functions"
- "TODO format: // TODO(username): description"
-->

### Documentation Comments

```{{LANGUAGE}}
{{DOC_COMMENT_EXAMPLE}}
```

## Type Conventions

### Type vs Interface

{{TYPE_VS_INTERFACE}}

<!-- 
Examples:
- "Use `type` for unions and primitives, `interface` for objects"
- "Use `interface` everywhere for consistency and extension"
- "Use `type` everywhere for consistency"
-->

### Naming

{{TYPE_NAMING}}

<!-- 
Examples:
- "Suffix Props types: ButtonProps, UserCardProps"
- "Prefix interfaces with I: IUser, IPost (NOT recommended)"
- "Use descriptive names without prefixes/suffixes"
-->

## Things to Avoid

- ❌ {{AVOID_1}}
- ❌ {{AVOID_2}}
- ❌ {{AVOID_3}}
- ❌ {{AVOID_4}}
- ❌ {{AVOID_5}}

<!-- 
BOOTSTRAP NOTE: List anti-patterns and things to avoid.

Examples:
- "❌ Inline styles (use Tailwind classes)"
- "❌ any type (use unknown and narrow)"
- "❌ console.log in production code (use logger)"
- "❌ Direct DOM manipulation (use refs if needed)"
- "❌ Mutating props or state directly"
-->

## React Patterns (StrictMode Awareness)

> **Important:** React StrictMode double-mounts components in development to detect side effects. This can cause subtle bugs that work in tests but fail in the browser.

### Stale Closure Prevention

When writing components with DOM event listeners (especially `document` or `window` level):

| Pattern | Status | Why |
|---------|--------|-----|
| `const el = ref.current; handler(() => { if (el === ...) })` | ❌ Bad | Closure captures first-mount element |
| `handler(() => { if (ref.current === ...) })` | ✅ Good | Reads ref at event time |

### Common Pitfall: Document Event Listeners

```typescript
// ❌ BAD: Captures ref value at effect time
useEffect(() => {
  const element = textareaRef.current;
  
  const handleSelection = () => {
    // This captures the first-mount element
    // After StrictMode remount, this points to unmounted DOM
    if (document.activeElement === element) {
      // ...
    }
  };
  
  document.addEventListener('selectionchange', handleSelection);
  return () => document.removeEventListener('selectionchange', handleSelection);
}, []);

// ✅ GOOD: Reads ref at event time
useEffect(() => {
  const handleSelection = () => {
    // Always reads current ref value
    if (document.activeElement === textareaRef.current) {
      // ...
    }
  };
  
  document.addEventListener('selectionchange', handleSelection);
  return () => document.removeEventListener('selectionchange', handleSelection);
}, []);
```

### When to Suspect StrictMode Issues

- Feature works in E2E tests but not in user's browser
- Feature works after HMR (hot reload) but not on fresh page load
- `document.activeElement === capturedElement` returns false unexpectedly
- Event listeners seem to "stop working" randomly

### Rule of Thumb

**Never capture `ref.current` in a variable used inside an event handler closure.** Always read `ref.current` at the moment you need it.

## Examples in Codebase

When unsure about conventions, reference these exemplary files:

| Pattern | Example File |
|---------|--------------|
| Component | `{{EXAMPLE_COMPONENT}}` |
| Hook | `{{EXAMPLE_HOOK}}` |
| API Route | `{{EXAMPLE_API_ROUTE}}` |
| Test | `{{EXAMPLE_TEST}}` |

<!-- 
BOOTSTRAP NOTE: Point to real files in your codebase that exemplify good patterns.
This helps agents learn by example.
-->

---

# Infrastructure & Integration Conventions

The following sections provide conventions for cross-cutting concerns that multiple agents reference. Fill in the sections relevant to your stack.

## Network & HTTP Conventions

> Used by: network-critic, backend critics, dev agents

### HTTP Client Wrapper

**Standard HTTP Client:** {{HTTP_CLIENT_WRAPPER}}

<!-- 
BOOTSTRAP NOTE: If your project has a standard HTTP client wrapper with built-in retries,
timeouts, and circuit breakers, document it here so network-critic doesn't flag correct usage.

Example:
"Use `lib/http/client.ts` which provides:
- 30s connect timeout, 60s read timeout by default
- Exponential backoff retry (3 attempts) for 5xx and network errors
- Circuit breaker that opens after 5 consecutive failures
- All external API calls must use this client"
-->

### Timeout Conventions

| Operation Type | Connect Timeout | Read Timeout | Notes |
|---------------|-----------------|--------------|-------|
| Internal APIs | {{INTERNAL_CONNECT_TIMEOUT}} | {{INTERNAL_READ_TIMEOUT}} | |
| External APIs | {{EXTERNAL_CONNECT_TIMEOUT}} | {{EXTERNAL_READ_TIMEOUT}} | |
| Database | {{DB_TIMEOUT}} | {{DB_TIMEOUT}} | |
| Redis/Cache | {{CACHE_TIMEOUT}} | {{CACHE_TIMEOUT}} | |

### Retry Policy

{{RETRY_POLICY}}

<!-- 
BOOTSTRAP NOTE: Document your retry conventions.

Example:
"Retry on: 5xx errors, network timeouts, DNS failures, connection resets
Do NOT retry: 4xx errors (except 429 with backoff), SSL errors
Backoff: exponential with jitter, starting at 100ms, max 3 attempts
Use: `withRetry()` wrapper from lib/http/retry.ts"
-->

### Circuit Breaker

{{CIRCUIT_BREAKER_PATTERN}}

<!-- 
BOOTSTRAP NOTE: If your project uses circuit breakers, document the pattern.

Example:
"All external service calls use CircuitBreaker from lib/http/circuit.ts
- Opens after 5 consecutive failures
- Half-open after 30 seconds
- Closes after 2 successful requests"
-->

### Connection Pooling

{{CONNECTION_POOL_PATTERN}}

<!-- 
BOOTSTRAP NOTE: Document connection pool management.

Example:
"HTTP: Global http.Agent with keepAlive=true, maxSockets=50
Database: pgBouncer handles pooling, max connections per service = 10
Redis: ioredis with connection pool, autoReconnect=true"
-->

## Security Conventions

> Used by: security-critic, exploit-critic, backend critics

### Authentication Middleware

**Pattern:** {{AUTH_MIDDLEWARE_PATTERN}}

```{{LANGUAGE}}
{{AUTH_MIDDLEWARE_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document how authentication is handled.

Example:
"All API routes use `withAuth()` middleware from `lib/auth/middleware.ts`
- Validates JWT from Authorization header or cookie
- Populates `req.user` with decoded claims
- Returns 401 for invalid/expired tokens
- Protected routes: /api/* except /api/auth/*, /api/public/*"
-->

### CSRF Protection

**Pattern:** {{CSRF_PATTERN}}

<!-- 
BOOTSTRAP NOTE: Document CSRF protection approach.

Example:
"Double-submit cookie pattern via `csrf-csrf` middleware
- CSRF token in `x-csrf-token` header on state-changing requests
- Cookie uses SameSite=Strict, Secure, HttpOnly
- All POST/PUT/DELETE routes protected by default"
-->

### CORS Configuration

**Pattern:** {{CORS_PATTERN}}

```{{LANGUAGE}}
{{CORS_CONFIG_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document CORS configuration.

Example:
"Configured in `apps/api/middleware/cors.ts`
- Production: origin restricted to *.example.com
- Development: localhost:3000, localhost:3001 allowed
- Credentials: true
- Exposed headers: X-Request-Id"
-->

### Security Headers

**Header Configuration:** {{SECURITY_HEADERS_LOCATION}}

| Header | Value | Notes |
|--------|-------|-------|
| Content-Security-Policy | {{CSP_VALUE}} | |
| Strict-Transport-Security | {{HSTS_VALUE}} | |
| X-Content-Type-Options | nosniff | |
| X-Frame-Options | {{X_FRAME_VALUE}} | |
| Referrer-Policy | {{REFERRER_POLICY}} | |

<!-- 
BOOTSTRAP NOTE: Document security header configuration.

Example:
"Security headers set in `next.config.js` / `middleware.ts`
CSP: script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
See SECURITY.md for full policy details"
-->

### Input Validation

**Validation Library:** {{VALIDATION_LIBRARY}}
**Pattern:** {{INPUT_VALIDATION_PATTERN}}

```{{LANGUAGE}}
{{VALIDATION_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document input validation approach.

Example:
"All API inputs validated with Zod schemas
- Schema defined alongside route handler
- Validation errors return 400 with field-level details
- File uploads: type allowlist, size limit (10MB), content verification"
-->

### Secrets Management

**Pattern:** {{SECRETS_PATTERN}}

<!-- 
BOOTSTRAP NOTE: Document how secrets are handled.

Example:
"Environment variables for runtime secrets
- Production: AWS Secrets Manager via `lib/secrets.ts`
- Development: .env.local (gitignored)
- Never hardcode secrets; never log secrets
- Rotate API keys quarterly"
-->

## AWS Conventions

> Used by: backend-aws-critic, dev agents working with AWS

### AWS Client Wrapper

**Standard Client:** {{AWS_CLIENT_WRAPPER}}

```{{LANGUAGE}}
{{AWS_CLIENT_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: If you have standard AWS client wrappers with retry/error handling,
document them here so backend-aws-critic doesn't flag correct usage.

Example:
"Use `lib/aws/dynamo.ts` for DynamoDB operations:
- Built-in retry for throttling (exponential backoff)
- Automatic handling of partial batch failures
- Strongly consistent reads by default for important queries
- All clients configured from `lib/aws/config.ts`"
-->

### Error Handling

**Throttling:** {{AWS_THROTTLING_PATTERN}}
**Partial Failures:** {{AWS_PARTIAL_FAILURE_PATTERN}}
**Conditional Failures:** {{AWS_CONDITIONAL_FAILURE_PATTERN}}

<!-- 
BOOTSTRAP NOTE: Document how AWS errors are handled.

Example:
"Throttling: Caught by client wrapper, exponential backoff up to 5 attempts
Partial failures (BatchWrite): Wrapper retries unprocessed items automatically
Conditional failures: Let caller handle ConditionalCheckFailedException
Use: error type guards from `lib/aws/errors.ts`"
-->

### IAM Best Practices

{{IAM_CONVENTIONS}}

<!-- 
BOOTSTRAP NOTE: Document IAM patterns.

Example:
"- Principle of least privilege: specific actions, specific resources
- No Resource: '*' except for logs and metrics
- Service roles in `infrastructure/iam/` with CDK
- Cross-account access via assume role, not shared credentials"
-->

### Service-Specific Patterns

**DynamoDB:** {{DYNAMODB_PATTERN}}
**S3:** {{S3_PATTERN}}
**SQS:** {{SQS_PATTERN}}
**Lambda:** {{LAMBDA_PATTERN}}

<!-- 
BOOTSTRAP NOTE: Document service-specific conventions.

Example:
"DynamoDB: Always use Query over Scan; use GSI for access patterns
S3: Set Content-Type on upload; use presigned URLs for client uploads
SQS: Dead-letter queue for all queues; visibility timeout = 6x max processing time
Lambda: Initialize clients outside handler; use structured logging"
-->

## API Design Conventions

> Used by: api-critic, backend critics, dev agents

### URL Naming

**Pattern:** {{API_URL_PATTERN}}
**Versioning:** {{API_VERSIONING}}

<!-- 
BOOTSTRAP NOTE: Document API URL conventions.

Example:
"RESTful resource-based URLs
- Collection: /api/v1/users
- Resource: /api/v1/users/:userId
- Nested: /api/v1/users/:userId/orders
- No verbs in URLs; HTTP method conveys action
- Versioning: /api/v1/, /api/v2/"
-->

### Request/Response Envelope

**Request Format:**
```json
{{API_REQUEST_ENVELOPE}}
```

**Success Response:**
```json
{{API_SUCCESS_ENVELOPE}}
```

**Error Response:**
```json
{{API_ERROR_ENVELOPE}}
```

<!-- 
BOOTSTRAP NOTE: Document API envelope conventions.

Example:
"Success: { data: <payload>, meta?: { page, total } }
Error: { error: { code: string, message: string, details?: [...] } }
All responses include X-Request-Id header"
-->

### Pagination

**Style:** {{PAGINATION_STYLE}}
**Parameters:** {{PAGINATION_PARAMS}}

```json
{{PAGINATION_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document pagination conventions.

Example:
"Cursor-based pagination for all list endpoints
- Request: ?cursor=xxx&limit=20
- Response: { data: [...], meta: { nextCursor: xxx | null } }
- Default limit: 20, max limit: 100"
-->

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| {{ERROR_CODE_1}} | {{ERROR_STATUS_1}} | {{ERROR_DESC_1}} |
| {{ERROR_CODE_2}} | {{ERROR_STATUS_2}} | {{ERROR_DESC_2}} |
| {{ERROR_CODE_3}} | {{ERROR_STATUS_3}} | {{ERROR_DESC_3}} |

<!-- 
BOOTSTRAP NOTE: Document standard error codes.

Example:
"| validation_error | 400 | Request validation failed |
| unauthorized | 401 | Missing or invalid authentication |
| forbidden | 403 | Authenticated but not authorized |
| not_found | 404 | Resource does not exist |
| conflict | 409 | Resource state conflict |
| rate_limited | 429 | Too many requests |"
-->

## Documentation System

> Used by: docs-writer, support-article-writer

### System Type

**Documentation System:** {{DOCS_SYSTEM_TYPE}}

<!-- 
Options:
- "markdown" - Static markdown files in docs/
- "docusaurus" - Docusaurus static site
- "database" - Database-backed articles (Supabase, etc.)
- "notion" - Notion-based docs
- "none" - No documentation system configured
-->

### Locations

**User-facing docs:** {{USER_DOCS_LOCATION}}
**Support articles:** {{SUPPORT_ARTICLES_LOCATION}}
**API docs:** {{API_DOCS_LOCATION}}

### Database Schema (if applicable)

```sql
{{DOCS_SCHEMA}}
```

<!-- 
BOOTSTRAP NOTE: If using database-backed documentation, provide the schema.

Example:
"Support articles in `support_articles` table:
- id, category_id, title, slug, excerpt, content (markdown), tags[], status, display_order
- Categories in `support_categories` table
- Rendered with react-markdown"
-->

### Writing Style

{{DOCS_WRITING_STYLE}}

<!-- 
BOOTSTRAP NOTE: Document writing conventions.

Example:
"- Second person ('you')
- Present tense
- Active voice
- Bold for UI elements: **Click Save**
- Code for values: `enabled`
- Screenshots for complex flows"
-->

## AI Tools System

> Used by: tools-writer

### System Type

**AI Tool System:** {{AI_TOOLS_SYSTEM}}

<!-- 
Options:
- "openai-functions" - OpenAI function calling
- "langchain" - LangChain tools
- "mcp" - Model Context Protocol
- "custom" - Custom tool system
- "none" - No AI tools
-->

### Tool Definition Location

**Schema file:** {{TOOLS_SCHEMA_LOCATION}}
**Implementation file:** {{TOOLS_IMPL_LOCATION}}
**Types file:** {{TOOLS_TYPES_LOCATION}}

### Tool Patterns

```{{LANGUAGE}}
{{TOOL_DEFINITION_EXAMPLE}}
```

```{{LANGUAGE}}
{{TOOL_IMPLEMENTATION_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Provide example tool definition and implementation.

Example for OpenAI function calling:
"Schema in `lib/ai-agent/tools.ts`:
{
  type: 'function',
  function: {
    name: 'list_events',
    description: 'Lists events for a calendar',
    parameters: { ... }
  }
}

Implementation in `lib/ai-agent/executor.ts`:
async function listEventsHandler(args, user): Promise<ToolResult>"
-->

### Tool Naming

{{TOOL_NAMING_CONVENTION}}

<!-- 
BOOTSTRAP NOTE: Document tool naming conventions.

Example:
"snake_case names
Verb + noun pattern: list_events, create_calendar, search_articles
Specific names: get_event_details (not just get_event)"
-->

## E2E Testing Conventions

> Used by: ui-tester-playwright, ui-test-reviewer, qa agents

### Test Framework

**Framework:** {{E2E_FRAMEWORK}}
**Config:** {{E2E_CONFIG_LOCATION}}

### Test Organization

**Location:** {{E2E_TESTS_LOCATION}}
**Structure:**
```
{{E2E_STRUCTURE}}
```

<!-- 
BOOTSTRAP NOTE: Document E2E test organization.

Example:
"apps/web/e2e/
├── auth.spec.ts
├── dashboard/
│   ├── overview.spec.ts
│   └── settings.spec.ts
├── fixtures/
│   ├── auth.ts
│   └── test-data.ts
└── playwright.config.ts"
-->

### Authentication in Tests

**Pattern:** {{E2E_AUTH_PATTERN}}

```{{LANGUAGE}}
{{E2E_AUTH_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document how tests authenticate.

Example:
"Use storageState for authenticated tests
- Global setup creates auth state in setup/auth.ts
- Tests use `test.use({ storageState: 'auth.json' })`
- For unauthenticated tests, use `test.use({ storageState: undefined })`"
-->

### API Mocking

**Pattern:** {{E2E_MOCK_PATTERN}}

```{{LANGUAGE}}
{{E2E_MOCK_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document API mocking conventions.

Example:
"Mock APIs for deterministic tests:
- page.route('**/api/endpoint', handler)
- Use fixtures for consistent mock data
- Real API for smoke tests only (tagged @smoke)"
-->

### Selectors

**Priority:** {{E2E_SELECTOR_PRIORITY}}

<!-- 
BOOTSTRAP NOTE: Document selector conventions.

Example:
"Selector priority:
1. getByRole() - semantic, accessible
2. getByTestId() - explicit test anchors
3. getByText() - for content verification
Avoid: CSS selectors, class names, XPath"
-->

## Unit/Integration Testing Conventions

> Used by: all tester agents

### Test Command

**Run tests:** `{{TEST_COMMAND}}`
**Run specific test:** `{{TEST_SPECIFIC_COMMAND}}`

### Test Organization

**Location:** {{UNIT_TESTS_LOCATION}}
**Naming:** {{TEST_FILE_NAMING}}

<!-- 
BOOTSTRAP NOTE: Document test organization.

Example:
"Co-located with source files:
- src/lib/utils.ts → src/lib/utils.test.ts
- Test naming: describe('functionName', () => { it('should...') })"
-->

### Mocking Conventions

**What to mock:** {{MOCK_TARGETS}}
**What NOT to mock:** {{NO_MOCK_TARGETS}}

```{{LANGUAGE}}
{{MOCK_EXAMPLE}}
```

<!-- 
BOOTSTRAP NOTE: Document mocking conventions.

Example:
"Mock: External HTTP APIs (use nock/msw), time (jest.useFakeTimers)
Do NOT mock: Database (use test database), AWS (use local services)
Pattern: Prefer dependency injection over module mocking"
-->

### Test Utilities

**Helpers:** {{TEST_HELPERS_LOCATION}}
**Fixtures:** {{TEST_FIXTURES_LOCATION}}

<!-- 
BOOTSTRAP NOTE: Point to test utilities.

Example:
"Helpers: test/helpers/ - createTestUser(), mockApiResponse(), etc.
Fixtures: test/fixtures/ - JSON test data files
Database: test/setup.ts - seeds test database before each suite"
-->

---

*Last updated: {{DATE}}*
*Auto-generated by project-bootstrap, please expand with project-specific details.*
