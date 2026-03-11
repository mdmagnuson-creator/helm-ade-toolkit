# Proposed Examples for Agent Enrichment

This document contains proposed examples for agents that currently lack them. Review each section and approve/modify before implementation.

---

## Part 1: Critic Agents (20 agents)

### 1. aesthetic-critic.md

**Purpose:** Reviews UI styling against design system for visual consistency and dark mode correctness.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Hardcoded colors instead of design tokens

```tsx
// component.tsx:45
<div className="bg-[#1a1a2e] text-[#ffffff]">
```

**Why it's bad:** Hardcoded hex values bypass the design system. When the theme changes, this component won't update. Should use `bg-background text-foreground` or similar tokens.

### ❌ Bad: Missing dark mode variant

```tsx
// card.tsx:12
<div className="bg-white border-gray-200">
```

**Why it's bad:** No `dark:` variants means this will render as a bright white card in dark mode, breaking visual consistency and potentially causing eye strain.

### ✅ Good: Proper design token usage with dark mode

```tsx
// card.tsx:12
<div className="bg-card text-card-foreground border-border">
```

**Why it's good:** Uses semantic design tokens that automatically adapt to light/dark mode. The design system controls the actual colors.

### ✅ Good: Correct background layering hierarchy

```tsx
// layout.tsx
<div className="bg-background">           {/* Base layer */}
  <div className="bg-muted">              {/* Elevated surface */}
    <div className="bg-card">             {/* Card on surface */}
```

**Why it's good:** Creates visual depth through progressive layering. Each level is slightly different, providing subtle visual hierarchy.

### Example Review Output

```markdown
## Critical Issues

### src/components/PricingCard.tsx:23 — Hardcoded background color
**Category:** Color
**Severity:** Critical

The card uses `bg-[#0f172a]` instead of a design token. This bypasses the theme system and won't respond to dark mode changes.

**Design System Reference:** docs/design-system.md §Colors - "All background colors must use semantic tokens"

**Suggested fix:**
```tsx
- <div className="bg-[#0f172a]">
+ <div className="bg-card dark:bg-card">
```
```
```

---

### 2. api-critic.md

**Purpose:** Reviews API design for usability — confusing endpoints, inconsistent conventions.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Inconsistent naming conventions

```typescript
// routes/users.ts
GET  /api/users/:userId/orders     // camelCase userId
GET  /api/get-order-by-user        // verb in URL
POST /api/User/create              // PascalCase, verb in URL

// Existing endpoints use:
GET  /api/users/:user_id           // snake_case
```

**Why it's bad:** Three different naming conventions in the same API. Consumers have to remember which style each endpoint uses.

### ❌ Bad: Inconsistent response envelope

```typescript
// GET /api/users returns:
{ "data": [{ "id": 1, "name": "Alice" }] }

// GET /api/orders returns:
[{ "id": 1, "total": 100 }]  // No envelope

// GET /api/products returns:
{ "result": [{ "id": 1 }], "success": true }  // Different envelope
```

**Why it's bad:** Each endpoint returns a different shape. Clients need special handling for each endpoint instead of a consistent parse pattern.

### ✅ Good: Consistent REST conventions

```typescript
// All endpoints follow the same pattern:
GET    /api/users                  // List
GET    /api/users/:id              // Get one
POST   /api/users                  // Create
PUT    /api/users/:id              // Update
DELETE /api/users/:id              // Delete

GET    /api/users/:id/orders       // Nested resource
```

**Why it's good:** Predictable. A developer who knows one endpoint can guess all others.

### ✅ Good: Consistent error response format

```typescript
// All errors return:
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": {
      "field": "email",
      "constraint": "required"
    }
  }
}
```

**Why it's good:** Single error shape that clients can parse reliably. Actionable details about what went wrong.
```

---

### 3. security-critic.md

**Purpose:** Reviews code for security scan findings — CSP, CORS, CSRF, cookies, CVEs.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: CORS wildcard on authenticated endpoint

```typescript
// middleware/cors.ts:15
app.use(cors({
  origin: '*',
  credentials: true
}));
```

**Why it's bad:** Any website can make authenticated requests to this API. An attacker's site can steal user data by making requests with the user's cookies. Semgrep rule: `javascript.express.security.cors-wildcard`.

### ❌ Bad: Missing CSRF protection on state-changing endpoint

```typescript
// routes/settings.ts:42
app.post('/api/settings', async (req, res) => {
  await updateSettings(req.user.id, req.body);
  res.json({ success: true });
});
```

**Why it's bad:** No CSRF token validation. An attacker can create a form on their site that submits to this endpoint, modifying the user's settings when they visit the malicious page. OWASP A01:2021.

### ✅ Good: Strict CORS with allowlist

```typescript
// middleware/cors.ts
const allowedOrigins = ['https://app.example.com', 'https://admin.example.com'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
```

**Why it's good:** Only explicitly allowed origins can make credentialed requests. Unknown origins are rejected.

### ✅ Good: CSRF token validation

```typescript
// routes/settings.ts
app.post('/api/settings', csrfProtection, async (req, res) => {
  // CSRF token verified by middleware
  await updateSettings(req.user.id, req.body);
  res.json({ success: true });
});
```

**Why it's good:** CSRF middleware verifies the token before the handler runs. Requests without valid tokens are rejected.
```

---

### 4. frontend-critic.md

**Purpose:** Reviews frontend code for component design, performance, styling, best practices.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Stale closure capturing ref value

```tsx
// Dropdown.tsx:25-35
useEffect(() => {
  const element = dropdownRef.current;  // ❌ Captured at effect time
  
  const handleClickOutside = (e: MouseEvent) => {
    if (document.activeElement === element) {  // ❌ Stale reference
      closeDropdown();
    }
  };
  
  document.addEventListener('click', handleClickOutside);
  return () => document.removeEventListener('click', handleClickOutside);
}, []);
```

**Why it's bad:** React StrictMode double-mounts components. First mount's DOM element is replaced, so `element` becomes stale. Works in tests (no StrictMode), fails in browser.

### ❌ Bad: Props drilling through multiple layers

```tsx
// Page.tsx → Layout.tsx → Sidebar.tsx → MenuItem.tsx → Icon.tsx
<Page user={user}>
  <Layout user={user}>
    <Sidebar user={user}>
      <MenuItem user={user}>
        <Icon user={user} />  // 5 layers deep just to show user avatar
```

**Why it's bad:** Every component in the chain must accept and pass the `user` prop, even if it doesn't use it. Changes to the prop shape require updates to all intermediate components.

### ✅ Good: Read ref at event time

```tsx
// Dropdown.tsx:25-35
useEffect(() => {
  const handleClickOutside = (e: MouseEvent) => {
    const element = dropdownRef.current;  // ✅ Read at event time
    if (element && !element.contains(e.target as Node)) {
      closeDropdown();
    }
  };
  
  document.addEventListener('click', handleClickOutside);
  return () => document.removeEventListener('click', handleClickOutside);
}, []);
```

**Why it's good:** Reading `ref.current` inside the handler gets the current DOM element, not a stale one from mount time.

### ✅ Good: Context for cross-cutting data

```tsx
// UserContext.tsx
const UserContext = createContext<User | null>(null);

// Page.tsx
<UserProvider user={user}>
  <Layout>
    <Sidebar>
      <MenuItem />
        <Icon />  // Can access user via useUser() hook

// Icon.tsx
const { user } = useUser();  // Direct access, no prop drilling
```

**Why it's good:** Components access user data directly via context. Intermediate components don't need to know about or pass the prop.
```

---

### 5. exploit-critic.md

**Purpose:** Adversarial review — finds injection, auth bypass, privilege escalation, data exfiltration paths.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: SQL injection via string concatenation

```go
// handlers/user.go:42
func GetUser(w http.ResponseWriter, r *http.Request) {
    userID := r.URL.Query().Get("id")
    query := "SELECT * FROM users WHERE id = " + userID
    rows, _ := db.Query(query)
}
```

**Attack scenario:**
1. Attacker sends: `GET /api/user?id=1 OR 1=1`
2. Query becomes: `SELECT * FROM users WHERE id = 1 OR 1=1`
3. All users returned, not just user 1
4. Attacker can also use `UNION SELECT` to read other tables

### ❌ Bad: Broken access control (IDOR)

```typescript
// routes/documents.ts:58
app.delete('/api/documents/:id', async (req, res) => {
  await Document.deleteOne({ _id: req.params.id });
  res.json({ deleted: true });
});
```

**Attack scenario:**
1. User A creates document with ID `abc123`
2. User B sends: `DELETE /api/documents/abc123`
3. Document deleted — no ownership check
4. Attacker can iterate through IDs to delete all documents

### ✅ Good: Parameterized query

```go
// handlers/user.go:42
func GetUser(w http.ResponseWriter, r *http.Request) {
    userID := r.URL.Query().Get("id")
    query := "SELECT * FROM users WHERE id = $1"
    rows, _ := db.Query(query, userID)  // Parameterized
}
```

**Why it's good:** User input is passed as a parameter, not concatenated into the query. The database driver handles escaping.

### ✅ Good: Ownership check before mutation

```typescript
// routes/documents.ts:58
app.delete('/api/documents/:id', async (req, res) => {
  const doc = await Document.findOne({ 
    _id: req.params.id,
    ownerId: req.user.id  // Must belong to requesting user
  });
  
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }
  
  await doc.deleteOne();
  res.json({ deleted: true });
});
```

**Why it's good:** Query includes ownership constraint. Users can only delete their own documents.
```

---

### 6. comment-critic.md

**Purpose:** Reviews comments and removes noise — flags obvious comments that restate the code.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Comment restates the code

```typescript
// Set the user name
user.name = name;
```

**Why it's bad:** The code is `user.name = name`. The comment says "set the user name." Zero information added.

### ❌ Bad: Narrating obvious control flow

```go
// Check if the user is nil
if user == nil {
    return nil, ErrUserNotFound
}
```

**Why it's bad:** Any developer can read `if user == nil`. The comment adds noise without explaining *why* we check this.

### ❌ Bad: Redundant doc comment

```typescript
/**
 * Gets a user by ID
 */
function getUserById(id: string): User {
```

**Why it's bad:** The function name already says "get user by ID". The doc comment just repeats it. Either add useful information (what errors it throws, side effects) or delete it.

### ✅ Good: Comment explains why

```typescript
// DynamoDB limits batch writes to 25 items, so we chunk the input
const chunks = chunkArray(items, 25);
```

**Why it's good:** The code shows *what* (chunking by 25). The comment explains *why* (DynamoDB limit). Future developers won't wonder about the magic number.

### ✅ Good: Warning about consequences

```go
// Do not reorder these calls — the parser depends on this exact sequence
initTokenizer()
initGrammar()
initParser()
```

**Why it's good:** Prevents future developers from "cleaning up" the code and breaking it. The order matters, but isn't obvious from the code alone.
```

---

### 7. network-critic.md

**Purpose:** Reviews code making network requests for resilience, blocking behavior, locks-during-IO.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Lock held during HTTP call

```go
// service/cache.go:67
func (c *Cache) Refresh(key string) {
    c.mutex.Lock()
    defer c.mutex.Unlock()
    
    // HTTP call while holding lock!
    resp, err := http.Get("https://api.example.com/data/" + key)
    if err != nil {
        return
    }
    c.data[key] = parseResponse(resp)
}
```

**Why it's bad:** If the HTTP call takes 30 seconds (or hangs), all other goroutines waiting for this mutex are blocked. Network IO + locks = deadlock risk.

### ❌ Bad: Missing timeout on network call

```typescript
// services/api.ts:23
async function fetchUserData(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}
```

**Why it's bad:** No timeout. If the server hangs, this request hangs forever, potentially exhausting connection pools or blocking user interactions.

### ✅ Good: Network call outside lock

```go
// service/cache.go:67
func (c *Cache) Refresh(key string) {
    // Fetch BEFORE acquiring lock
    resp, err := http.Get("https://api.example.com/data/" + key)
    if err != nil {
        return
    }
    data := parseResponse(resp)
    
    // Only hold lock for the write
    c.mutex.Lock()
    c.data[key] = data
    c.mutex.Unlock()
}
```

**Why it's good:** Network IO happens outside the critical section. The lock is only held for the fast in-memory operation.

### ✅ Good: Timeout and retry with backoff

```typescript
// services/api.ts:23
async function fetchUserData(userId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(`/api/users/${userId}`, {
      signal: controller.signal
    });
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

**Why it's good:** 5-second timeout prevents hanging. AbortController allows cancellation if the caller gives up.
```

---

### 8. prompt-critic.md

**Purpose:** Reviews AI agent prompts for clarity, ambiguity, and failure modes.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Ambiguous instruction

```markdown
Review the code and fix any issues as needed.
```

**Why it's bad:** "As needed" is undefined. What triggers a fix vs. a report? What severity threshold? The agent will make unpredictable decisions.

### ❌ Bad: Contradictory instructions

```markdown
## Output Rules
Never modify files directly.

## Your Task
3. Write your review to `docs/review.md`.
```

**Why it's bad:** "Never modify files" contradicts "write to docs/review.md". The agent may oscillate between behaviors or fail entirely.

### ✅ Good: Explicit threshold with examples

```markdown
## When to Auto-Fix

Fix issues automatically ONLY when ALL conditions are met:
1. The fix is mechanical (import statement, typo, formatting)
2. The fix cannot break functionality
3. The fix is <5 lines

Examples of auto-fixable issues:
- Missing import statement
- Unused import removal
- Obvious typo in string literal

Examples that require manual review:
- Logic changes
- API modifications
- Anything affecting behavior
```

**Why it's good:** Clear criteria with concrete examples. The agent knows exactly when to auto-fix vs. report.

### ✅ Good: Explicit failure handling

```markdown
## Error Handling

If a tool call fails:
1. Log the failure to your response
2. Continue with remaining files
3. Do not ask the user for help
4. Do not stop the review
5. In your summary, note which files could not be reviewed and why
```

**Why it's good:** Every failure mode has explicit instructions. The agent won't get stuck asking "what should I do now?"
```

---

### 9. dx-critic.md

**Purpose:** Reviews exported/public package APIs for testability, consistency, and developer experience.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Hard-coded dependencies prevent testing

```typescript
// lib/email.ts
export async function sendWelcomeEmail(user: User) {
  const ses = new AWS.SES();  // Hard-coded AWS client
  await ses.sendEmail({
    to: user.email,
    subject: 'Welcome!',
    body: '...'
  });
}
```

**Why it's bad:** Tests cannot mock the SES client. Every test will try to send real emails or require complex AWS credential mocking.

### ❌ Bad: Inconsistent async patterns

```typescript
// lib/data.ts
export function getUser(id: string): Promise<User> { ... }
export function getUsers(): User[] { ... }  // Sync!
export async function getOrders(): Promise<Order[]> { ... }
export function getProduct(id: string, callback: (p: Product) => void) { ... }  // Callback!
```

**Why it's bad:** Four different patterns (Promise, sync, async, callback) for similar operations. Consumers must remember which pattern each function uses.

### ✅ Good: Dependency injection for testability

```typescript
// lib/email.ts
export interface EmailClient {
  send(to: string, subject: string, body: string): Promise<void>;
}

export function createEmailService(client: EmailClient) {
  return {
    async sendWelcomeEmail(user: User) {
      await client.send(user.email, 'Welcome!', '...');
    }
  };
}
```

**Why it's good:** Tests can inject a mock email client. Production code injects the real SES client. Same API, different implementations.

### ✅ Good: Consistent async pattern

```typescript
// lib/data.ts
export async function getUser(id: string): Promise<User> { ... }
export async function getUsers(): Promise<User[]> { ... }
export async function getOrders(): Promise<Order[]> { ... }
export async function getProduct(id: string): Promise<Product> { ... }
```

**Why it's good:** All functions use async/await. Consumers can use the same pattern everywhere.
```

---

### 10. backend-critic-ts.md

**Purpose:** Reviews backend TypeScript code for API design, async patterns, error handling, best practices.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Swallowing errors silently

```typescript
// services/user.ts:45
async function updateUser(id: string, data: UpdateUserDto) {
  try {
    await db.users.update(id, data);
  } catch (error) {
    console.log('Update failed');  // Logged and ignored!
  }
}
```

**Why it's bad:** The caller thinks the update succeeded. No error propagated, no return value indicating failure. Data inconsistency will follow.

### ❌ Bad: Unhandled promise rejection

```typescript
// routes/webhook.ts:23
app.post('/webhook', (req, res) => {
  processWebhook(req.body);  // Not awaited!
  res.json({ received: true });
});
```

**Why it's bad:** If `processWebhook` throws, it's an unhandled promise rejection. The client got success response but processing failed.

### ✅ Good: Explicit error propagation

```typescript
// services/user.ts:45
async function updateUser(id: string, data: UpdateUserDto): Promise<User> {
  const updated = await db.users.update(id, data);
  if (!updated) {
    throw new NotFoundError(`User ${id} not found`);
  }
  return updated;
}
```

**Why it's good:** Errors propagate to the caller. The caller decides how to handle them (return 404, retry, etc.).

### ✅ Good: Await and handle async operations

```typescript
// routes/webhook.ts:23
app.post('/webhook', async (req, res, next) => {
  try {
    await processWebhook(req.body);
    res.json({ received: true });
  } catch (error) {
    next(error);  // Let error middleware handle it
  }
});
```

**Why it's good:** Async operation is awaited. Errors are caught and passed to Express error middleware.
```

---

### 11. backend-critic-go.md

**Purpose:** Reviews backend Go code for API design, concurrency, error handling, best practices.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Ignoring returned error

```go
// handlers/user.go:34
func CreateUser(w http.ResponseWriter, r *http.Request) {
    user, _ := parseUserRequest(r)  // Error ignored!
    db.Create(user)
    json.NewEncoder(w).Encode(user)
}
```

**Why it's bad:** If parsing fails, `user` is nil or zero-value. We try to create an invalid user and return garbage to the client.

### ❌ Bad: Data race with shared state

```go
// server/stats.go:15
var requestCount int  // Package-level mutable state

func IncrementStats() {
    requestCount++  // Not atomic, race condition!
}
```

**Why it's bad:** Multiple goroutines incrementing `requestCount` concurrently. Some increments will be lost. Run with `-race` flag to detect.

### ✅ Good: Explicit error handling

```go
// handlers/user.go:34
func CreateUser(w http.ResponseWriter, r *http.Request) {
    user, err := parseUserRequest(r)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    if err := db.Create(user); err != nil {
        http.Error(w, "Failed to create user", http.StatusInternalServerError)
        return
    }
    
    json.NewEncoder(w).Encode(user)
}
```

**Why it's good:** Every error is checked. Client gets appropriate error responses. Invalid state is rejected early.

### ✅ Good: Atomic operations or mutex for shared state

```go
// server/stats.go:15
var requestCount atomic.Int64

func IncrementStats() {
    requestCount.Add(1)  // Atomic, safe for concurrent access
}
```

**Why it's good:** `atomic.Int64` is safe for concurrent access. No mutex needed for simple counter.
```

---

### 12. backend-critic-java.md

**Purpose:** Reviews backend Java code for API design, concurrency, error handling, best practices (Netty, Lambda).

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Blocking call on Netty event loop

```java
// handler/UserHandler.java:45
@Override
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    User user = userService.fetchFromDatabase(userId);  // Blocking IO!
    ctx.writeAndFlush(new Response(user));
}
```

**Why it's bad:** `fetchFromDatabase` blocks the event loop thread. One slow query blocks all connections handled by this thread. Netty event loops must never block.

### ❌ Bad: Unclosed resources in Lambda

```java
// handler/S3Handler.java:23
public String handleRequest(S3Event event, Context context) {
    AmazonS3 s3 = AmazonS3ClientBuilder.defaultClient();
    S3Object obj = s3.getObject(bucket, key);
    return IOUtils.toString(obj.getObjectContent());
    // S3Object never closed!
}
```

**Why it's bad:** `S3Object` holds an HTTP connection. Not closing it leaks connections. Lambda functions that leak will eventually fail.

### ✅ Good: Offload blocking work in Netty

```java
// handler/UserHandler.java:45
private final EventExecutorGroup blockingGroup = new DefaultEventExecutorGroup(16);

@Override
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    blockingGroup.execute(() -> {
        User user = userService.fetchFromDatabase(userId);
        ctx.writeAndFlush(new Response(user));
    });
}
```

**Why it's good:** Database call runs on a separate thread pool. Event loop returns immediately to handle other connections.

### ✅ Good: Try-with-resources for Lambda

```java
// handler/S3Handler.java:23
public String handleRequest(S3Event event, Context context) {
    try (S3Client s3 = S3Client.create();
         ResponseInputStream<GetObjectResponse> stream = 
             s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())) {
        return new String(stream.readAllBytes());
    }
}
```

**Why it's good:** Try-with-resources ensures both `S3Client` and `ResponseInputStream` are closed, even on exception.
```

---

### 13. backend-aws-critic.md

**Purpose:** Reviews code calling AWS services for unhandled failure modes, missing permissions, SDK misuse.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Not handling DynamoDB conditional check failure

```typescript
// services/inventory.ts:34
async function decrementStock(productId: string, quantity: number) {
  await dynamodb.updateItem({
    TableName: 'products',
    Key: { productId },
    UpdateExpression: 'SET stock = stock - :qty',
    ConditionExpression: 'stock >= :qty',
    ExpressionAttributeValues: { ':qty': quantity }
  });
}
```

**Why it's bad:** If stock < quantity, DynamoDB throws `ConditionalCheckFailedException`. This code doesn't handle it — the error bubbles up as a generic 500.

### ❌ Bad: Assuming S3 getObject always succeeds

```typescript
// services/files.ts:56
async function getFileContent(bucket: string, key: string): Promise<string> {
  const response = await s3.getObject({ Bucket: bucket, Key: key });
  return response.Body.transformToString();
}
```

**Why it's bad:** S3 returns `NoSuchKey` if the object doesn't exist. This code treats it as an unexpected error instead of a valid "not found" case.

### ✅ Good: Handle expected DynamoDB failures

```typescript
// services/inventory.ts:34
async function decrementStock(productId: string, quantity: number): Promise<boolean> {
  try {
    await dynamodb.updateItem({
      TableName: 'products',
      Key: { productId },
      UpdateExpression: 'SET stock = stock - :qty',
      ConditionExpression: 'stock >= :qty',
      ExpressionAttributeValues: { ':qty': quantity }
    });
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return false;  // Insufficient stock is a valid business case
    }
    throw error;  // Re-throw unexpected errors
  }
}
```

**Why it's good:** Conditional check failure is handled as a business case (return false), not an error. Unexpected errors still propagate.

### ✅ Good: Handle S3 NoSuchKey explicitly

```typescript
// services/files.ts:56
async function getFileContent(bucket: string, key: string): Promise<string | null> {
  try {
    const response = await s3.getObject({ Bucket: bucket, Key: key });
    return response.Body.transformToString();
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return null;  // File doesn't exist is valid
    }
    throw error;
  }
}
```

**Why it's good:** `NoSuchKey` returns null instead of throwing. Callers can distinguish "file doesn't exist" from "S3 error".
```

---

### 14. cloudformation-critic.md

**Purpose:** Reviews CloudFormation templates for security, best practices, operational safety.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: S3 bucket without encryption

```yaml
# template.yaml
Resources:
  DataBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-data-bucket
      # No encryption configuration!
```

**Why it's bad:** Data at rest is unencrypted. Security scans will flag this. Compliance (SOC2, HIPAA) requires encryption.

### ❌ Bad: Lambda with wildcard permissions

```yaml
# template.yaml
MyLambdaRole:
  Type: AWS::IAM::Role
  Properties:
    Policies:
      - PolicyName: FullAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action: '*'
              Resource: '*'
```

**Why it's bad:** Lambda can do anything in the AWS account. If compromised, attacker has full access. Violates principle of least privilege.

### ✅ Good: S3 with SSE-S3 encryption

```yaml
# template.yaml
Resources:
  DataBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-data-bucket
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
```

**Why it's good:** All objects encrypted at rest with AWS-managed keys. Meets compliance requirements.

### ✅ Good: Least-privilege Lambda permissions

```yaml
# template.yaml
MyLambdaRole:
  Type: AWS::IAM::Role
  Properties:
    Policies:
      - PolicyName: MinimalAccess
        PolicyDocument:
          Statement:
            - Effect: Allow
              Action:
                - dynamodb:GetItem
                - dynamodb:PutItem
              Resource: !GetAtt MyTable.Arn
```

**Why it's good:** Lambda can only read/write to one specific DynamoDB table. Compromise limits blast radius.
```

---

### 15. ansible-critic.md

**Purpose:** Reviews Ansible roles and playbooks for idempotency, security, best practices.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Non-idempotent command

```yaml
# playbook.yml
- name: Create user
  command: useradd -m {{ username }}
```

**Why it's bad:** Running twice fails because user already exists. Ansible's `command` module doesn't know if the user exists. Use the `user` module instead.

### ❌ Bad: Secret in plain text

```yaml
# playbook.yml
- name: Set database password
  lineinfile:
    path: /etc/app/config.yml
    line: "db_password: SuperSecret123"
```

**Why it's bad:** Password visible in playbook, version control, and Ansible logs. Use `ansible-vault` or a secrets manager.

### ✅ Good: Idempotent user creation

```yaml
# playbook.yml
- name: Create user
  user:
    name: "{{ username }}"
    state: present
    create_home: yes
```

**Why it's good:** Ansible's `user` module checks if user exists. Running twice is safe — second run changes nothing.

### ✅ Good: Secrets via vault

```yaml
# playbook.yml
- name: Set database password
  lineinfile:
    path: /etc/app/config.yml
    line: "db_password: {{ db_password }}"
  no_log: true

# vars/secrets.yml (encrypted with ansible-vault)
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  ...
```

**Why it's good:** Password stored encrypted. `no_log: true` prevents it from appearing in output.
```

---

### 16. tailwind-critic.md

**Purpose:** Reviews Tailwind CSS usage for project-specific design system patterns and dark mode conventions.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Using arbitrary values instead of scale

```tsx
<div className="p-[13px] mt-[27px] text-[15px]">
```

**Why it's bad:** Arbitrary values bypass the spacing scale. Results in inconsistent spacing across the app. Should use `p-3`, `mt-7`, `text-sm`.

### ❌ Bad: Inconsistent dark mode approach

```tsx
// Component A uses dark: prefix
<div className="bg-white dark:bg-gray-800">

// Component B uses class-based
<div className="bg-white theme-dark:bg-gray-800">

// Component C forgets dark mode entirely
<div className="bg-white">  
```

**Why it's bad:** Three different patterns for dark mode. Some components break in dark mode. Project should use ONE approach consistently.

### ✅ Good: Using design system scale

```tsx
<div className="p-4 mt-6 text-base">
```

**Why it's good:** Uses Tailwind's built-in scale. Consistent with other components. Responsive variants work as expected.

### ✅ Good: Consistent dark mode with semantic tokens

```tsx
<div className="bg-background text-foreground">
```

**Why it's good:** Semantic tokens adapt automatically. No need for `dark:` prefix everywhere. Design system controls the actual colors.
```

---

### 17. requirements-critic.md

**Purpose:** Reviews code for decisions that will complicate or conflict with implementing remaining requirements.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Hardcoded single-tenant assumption

```typescript
// models/user.ts
export interface User {
  id: string;
  email: string;
  // No tenantId - assumes single tenant
}

// queries/users.ts
async function getUsers() {
  return db.users.findMany();  // Gets ALL users, no tenant filter
}
```

**Why it's problematic:** PRD-005 (Multi-tenancy) requires tenant isolation. This model and query will need significant changes. Add `tenantId` now even if single-tenant initially.

### ❌ Bad: Synchronous job processing blocking future scale

```typescript
// routes/export.ts
app.post('/api/export', async (req, res) => {
  const result = await generateExport(req.body);  // Takes 30 seconds
  res.json(result);
});
```

**Why it's problematic:** PRD-012 (Background Jobs) plans for async processing. This endpoint will time out with large exports. Build for async now: return job ID immediately, poll for result.

### ✅ Good: Tenant-aware from the start

```typescript
// models/user.ts
export interface User {
  id: string;
  tenantId: string;  // Ready for multi-tenancy
  email: string;
}

// queries/users.ts
async function getUsers(tenantId: string) {
  return db.users.findMany({ where: { tenantId } });
}
```

**Why it's good:** When multi-tenancy PRD starts, the foundation is already there. No retrofitting required.

### ✅ Good: Async-ready from the start

```typescript
// routes/export.ts
app.post('/api/export', async (req, res) => {
  const jobId = await queue.enqueue('generate-export', req.body);
  res.json({ jobId, status: 'processing' });
});

app.get('/api/export/:jobId', async (req, res) => {
  const job = await queue.getJob(req.params.jobId);
  res.json({ status: job.status, result: job.result });
});
```

**Why it's good:** Already async. Background jobs PRD can enhance the queue without changing the API contract.
```

---

### 18. oddball-critic.md

**Purpose:** Reviews code for consistency with existing codebase — flags patterns that look different from established conventions.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Different error handling pattern

```typescript
// Existing codebase uses Result type:
function existingFn(): Result<User, Error> {
  return { ok: true, value: user };
}

// New code throws instead:
function newFn(): User {
  if (error) throw new Error('Failed');  // Oddball!
  return user;
}
```

**Why it's bad:** Rest of codebase uses Result type for error handling. This function throws, forcing callers to mix try/catch with Result checking.

### ❌ Bad: Different naming convention

```typescript
// Existing codebase uses camelCase:
const getUserById = async (id) => { ... }
const createOrder = async (data) => { ... }

// New code uses different style:
const get_user_preferences = async (id) => { ... }  // snake_case oddball
const FetchDashboardData = async () => { ... }       // PascalCase oddball
```

**Why it's bad:** Developers must remember different naming rules for new functions. Inconsistency creates cognitive load.

### ✅ Good: Following established error pattern

```typescript
// Matches existing codebase pattern:
function newFn(): Result<User, Error> {
  if (error) {
    return { ok: false, error: new Error('Failed') };
  }
  return { ok: true, value: user };
}
```

**Why it's good:** Same pattern as existing code. Callers handle errors consistently.

### ✅ Good: Following established naming convention

```typescript
// Matches existing codebase:
const getUserPreferences = async (id) => { ... }  // camelCase like existing
const fetchDashboardData = async () => { ... }    // camelCase like existing
```

**Why it's good:** Consistent with existing patterns. No special cases to remember.
```

---

### 19. public-page-critic.md

**Purpose:** Reviews public-facing pages for conversion optimization, accessibility, mobile UX, brand consistency.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: CTA below the fold with no urgency

```tsx
// pages/pricing.tsx
<div className="mt-96">  {/* Way below fold */}
  <button className="text-sm text-gray-500">
    Learn More
  </button>
</div>
```

**Why it's bad:** Users must scroll extensively to find the CTA. "Learn More" is weak — no clear value proposition or urgency. Conversion will suffer.

### ❌ Bad: Missing accessibility on interactive element

```tsx
<div onClick={handleClick} className="cursor-pointer">
  Sign Up
</div>
```

**Why it's bad:** Div is not focusable via keyboard. Screen readers don't announce it as a button. Users without a mouse can't activate it.

### ✅ Good: CTA above fold with clear value

```tsx
// pages/pricing.tsx
<div className="mt-8">
  <button className="btn-primary text-lg">
    Start Free Trial — No Credit Card
  </button>
  <p className="text-muted mt-2">Join 10,000+ teams</p>
</div>
```

**Why it's good:** CTA visible immediately. Clear value (free trial). Social proof (10,000+ teams). Strong visual hierarchy.

### ✅ Good: Accessible interactive element

```tsx
<button onClick={handleClick} className="btn-primary">
  Sign Up
</button>
```

**Why it's good:** Native button is keyboard accessible. Screen readers announce it correctly. Focus states work by default.
```

---

### 20. copy-critic.md

**Purpose:** Reviews marketing copy for clarity, target market fit, feature accuracy, brand voice consistency.

**Proposed Examples:**

```markdown
## Examples

### ❌ Bad: Jargon-heavy copy

```markdown
Leverage our AI-powered synergistic platform to optimize your 
cross-functional workflows and drive stakeholder alignment.
```

**Why it's bad:** Buzzword soup. No concrete value. Reader doesn't know what the product actually does.

### ❌ Bad: Feature-focused instead of benefit-focused

```markdown
Our platform has:
- 256-bit AES encryption
- 99.99% SLA guarantee
- GraphQL API with subscriptions
```

**Why it's bad:** Lists technical features, not benefits. Users don't care about encryption algorithms — they care about "your data is secure."

### ✅ Good: Clear, benefit-focused copy

```markdown
Save 10 hours a week on reporting.

Stop building spreadsheets. Our automated reports deliver 
the insights your team needs — without the manual work.
```

**Why it's good:** Leads with concrete benefit (10 hours saved). Addresses pain point (spreadsheets). Clear value proposition.

### ✅ Good: Technical features translated to benefits

```markdown
**Enterprise-grade security**
Your data is protected with bank-level encryption.

**Always available**
99.99% uptime so your team is never blocked.

**Developer-friendly**
Build custom integrations with our modern API.
```

**Why it's good:** Each technical feature is paired with a human benefit. Accessible to non-technical buyers.
```

---

## Part 2: Tester Agents (2 agents)

### 21. go-tester.md

**Purpose:** Writes Go tests using testify and httptest for comprehensive test coverage.

**Proposed Examples:**

```markdown
## Examples

### Example Test File Structure

```go
// user_test.go
package user_test

import (
    "testing"
    "net/http"
    "net/http/httptest"
    
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/require"
    "github.com/stretchr/testify/mock"
)

func TestGetUser_Success(t *testing.T) {
    // Arrange
    repo := new(MockUserRepository)
    repo.On("FindByID", "123").Return(&User{ID: "123", Name: "Alice"}, nil)
    
    service := NewUserService(repo)
    
    // Act
    user, err := service.GetUser("123")
    
    // Assert
    require.NoError(t, err)
    assert.Equal(t, "Alice", user.Name)
    repo.AssertExpectations(t)
}

func TestGetUser_NotFound(t *testing.T) {
    // Arrange
    repo := new(MockUserRepository)
    repo.On("FindByID", "999").Return(nil, ErrUserNotFound)
    
    service := NewUserService(repo)
    
    // Act
    user, err := service.GetUser("999")
    
    // Assert
    assert.Nil(t, user)
    assert.ErrorIs(t, err, ErrUserNotFound)
}
```

### Example HTTP Handler Test

```go
func TestCreateUserHandler(t *testing.T) {
    // Arrange
    handler := NewUserHandler(mockService)
    
    body := `{"name": "Alice", "email": "alice@example.com"}`
    req := httptest.NewRequest("POST", "/users", strings.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    rec := httptest.NewRecorder()
    
    // Act
    handler.ServeHTTP(rec, req)
    
    // Assert
    assert.Equal(t, http.StatusCreated, rec.Code)
    
    var response User
    err := json.Unmarshal(rec.Body.Bytes(), &response)
    require.NoError(t, err)
    assert.Equal(t, "Alice", response.Name)
}
```

### Example Table-Driven Test

```go
func TestValidateEmail(t *testing.T) {
    tests := []struct {
        name    string
        email   string
        wantErr bool
    }{
        {"valid email", "user@example.com", false},
        {"missing @", "userexample.com", true},
        {"missing domain", "user@", true},
        {"empty string", "", true},
        {"unicode local part", "用户@example.com", false},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateEmail(tt.email)
            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.NoError(t, err)
            }
        })
    }
}
```
```

---

### 22. jest-tester.md

**Purpose:** Writes backend Jest tests in TypeScript for comprehensive test coverage.

**Proposed Examples:**

```markdown
## Examples

### Example Test File Structure

```typescript
// user.service.test.ts
import { UserService } from './user.service';
import { UserRepository } from './user.repository';

jest.mock('./user.repository');

describe('UserService', () => {
  let service: UserService;
  let mockRepo: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockRepo = new UserRepository() as jest.Mocked<UserRepository>;
    service = new UserService(mockRepo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUser', () => {
    it('should return user when found', async () => {
      // Arrange
      const expectedUser = { id: '123', name: 'Alice' };
      mockRepo.findById.mockResolvedValue(expectedUser);

      // Act
      const result = await service.getUser('123');

      // Assert
      expect(result).toEqual(expectedUser);
      expect(mockRepo.findById).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundError when user does not exist', async () => {
      // Arrange
      mockRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getUser('999'))
        .rejects
        .toThrow(NotFoundError);
    });
  });
});
```

### Example API Endpoint Test

```typescript
// users.route.test.ts
import request from 'supertest';
import { app } from '../app';

describe('POST /api/users', () => {
  it('should create user and return 201', async () => {
    const newUser = { name: 'Alice', email: 'alice@example.com' };

    const response = await request(app)
      .post('/api/users')
      .send(newUser)
      .expect(201);

    expect(response.body).toMatchObject({
      id: expect.any(String),
      name: 'Alice',
      email: 'alice@example.com',
    });
  });

  it('should return 400 when email is missing', async () => {
    const invalidUser = { name: 'Alice' };

    const response = await request(app)
      .post('/api/users')
      .send(invalidUser)
      .expect(400);

    expect(response.body.error).toContain('email');
  });
});
```

### Example Edge Case Test

```typescript
describe('calculateDiscount', () => {
  it.each([
    [100, 0, 100],           // No discount
    [100, 10, 90],           // 10% discount
    [100, 100, 0],           // Full discount
    [0, 50, 0],              // Zero amount
    [99.99, 10, 89.99],      // Decimal handling
  ])('amount %d with %d%% discount should be %d', (amount, percent, expected) => {
    expect(calculateDiscount(amount, percent)).toBe(expected);
  });

  it('should throw for negative discount', () => {
    expect(() => calculateDiscount(100, -10)).toThrow('Discount cannot be negative');
  });

  it('should throw for discount over 100%', () => {
    expect(() => calculateDiscount(100, 150)).toThrow('Discount cannot exceed 100%');
  });
});
```
```

---

## Part 3: Operational Agents (7 agents)

### 23. debugger.md

**Purpose:** Investigates production issues by pulling ticket context, searching logs, identifying likely defect areas.

**Proposed Examples:**

```markdown
## Examples

### Example Investigation Workflow

```
Ticket: PROD-1234 "Users getting 500 error on checkout"

1. CONTEXT GATHERING
   - Read ticket: 500 errors on /api/checkout since 2pm
   - Related commits: abc123 deployed at 1:45pm
   - Affected users: ~50 reports in last hour

2. LOG SEARCH
   Query: level:error path:/api/checkout timestamp:>2pm
   
   Found pattern:
   > TypeError: Cannot read property 'id' of undefined
   > at CheckoutService.processOrder (checkout.service.ts:145)
   > at OrderController.createOrder (order.controller.ts:67)

3. CODE ANALYSIS
   Commit abc123 changed:
   - checkout.service.ts: Added new discount logic
   - Line 145: `const discountId = order.discount.id`
   
   Bug: `order.discount` can be undefined when no discount applied.
   Previous code: `const discountId = order.discount?.id`
   New code removed the optional chaining.

4. ROOT CAUSE
   Commit abc123 introduced regression by removing null-safe access.
   Orders without discounts crash at line 145.

5. SUGGESTED FIX
   Restore optional chaining: `order.discount?.id`
   Or add guard: `if (order.discount) { ... }`
```

### Example Log Pattern Recognition

```
[ERROR] 14:02:15 checkout.service - Cannot read property 'id' of undefined
[ERROR] 14:02:18 checkout.service - Cannot read property 'id' of undefined
[ERROR] 14:03:01 checkout.service - Cannot read property 'id' of undefined
[INFO]  14:03:15 checkout.service - Order 12345 processed successfully

Pattern: 75% failure rate. Successful orders have discount codes.
Hypothesis: Bug only affects orders WITHOUT discount codes.
```
```

---

### 24. felix.md

**Purpose:** Watches a PR for feedback and build failures.

**Proposed Examples:**

```markdown
## Examples

### Example PR Watch Cycle

```
PR #423: Add user preferences feature

CYCLE 1 (Initial)
─────────────────
Build: ✅ Passed
Lint:  ✅ Passed  
Tests: ✅ Passed
Review: Pending

CYCLE 2 (After review)
──────────────────────
New comments detected:

@reviewer: "This function is getting long. Consider extracting 
the validation logic."

→ Delegating to @hammer to address review feedback
→ @hammer commits: "refactor: Extract validation to separate function"

CYCLE 3 (After fix)
───────────────────
Build: ✅ Passed
Lint:  ✅ Passed
Tests: ❌ FAILED
  - user.service.test.ts: Expected 'valid' but got 'invalid'

→ Test regression detected
→ Delegating to @hammer to fix failing test
→ @hammer commits: "fix: Update test expectation for new validation"

CYCLE 4 (Final)
───────────────
Build: ✅ Passed
Lint:  ✅ Passed
Tests: ✅ Passed
Review: ✅ Approved

PR ready to merge.
```

### Example Build Failure Response

```
Build Failed: TypeScript compilation error

Error: src/services/user.ts:45:12 - error TS2345: 
Argument of type 'string' is not assignable to parameter of type 'number'.

→ Identified: Type mismatch in function call
→ Delegating to @hammer with context:
   "Fix TypeScript error on line 45 - userId should be string, not number"
```
```

---

### 25. qa-explorer.md

**Purpose:** Explores web applications to find bugs through adversarial testing.

**Proposed Examples:**

```markdown
## Examples

### Example Bug Discovery Report

```markdown
## Exploration Session: User Settings Page

### Bugs Found

#### BUG-001: Form submits with empty required field
**Severity:** High
**Steps to reproduce:**
1. Go to /settings
2. Clear the "Display Name" field
3. Click Save

**Expected:** Validation error shown
**Actual:** Form submits, display name becomes empty string

**Screenshot:** settings-empty-name-bug.png

#### BUG-002: No loading state on slow network
**Severity:** Medium
**Steps to reproduce:**
1. Open DevTools, set network to "Slow 3G"
2. Click any action button

**Expected:** Loading indicator shown
**Actual:** Button appears clickable but unresponsive for 5+ seconds

#### BUG-003: Back button loses form data
**Severity:** Medium
**Steps to reproduce:**
1. Fill in settings form
2. Click a link to another page
3. Press browser Back button

**Expected:** Form data preserved
**Actual:** All fields reset to original values
```

### Example Adversarial Test Cases

```
Testing: Login Form

BOUNDARY TESTS:
- Empty username: ✅ Shows "Username required"
- Empty password: ✅ Shows "Password required"  
- 256-char username: ✅ Accepts (max is 255 — BUG: should reject)
- SQL injection in username: ✅ Properly escaped
- XSS in username: ✅ Properly escaped
- Unicode username: ✅ Handles correctly

FOUND: Max length validation missing for username field
```
```

---

### 26. screenshot-maintainer.md

**Purpose:** Maintains product screenshots used in marketing pages and support articles.

**Proposed Examples:**

```markdown
## Examples

### Example Screenshot Maintenance Report

```markdown
## Screenshot Audit: Marketing Pages

### Outdated Screenshots (3)

#### /public/images/dashboard-overview.png
**Used in:** Homepage, Features page
**Current state:** Shows old sidebar design
**Action needed:** Recapture with new navigation

#### /public/images/settings-panel.png  
**Used in:** Settings documentation
**Current state:** Missing new "Dark Mode" toggle
**Action needed:** Recapture after enabling dark mode feature

#### /public/images/mobile-view.png
**Used in:** Mobile features section
**Current state:** Shows deprecated mobile layout
**Action needed:** Recapture with new responsive design

### Up-to-date Screenshots (12)
- pricing-table.png ✅
- login-screen.png ✅
- ...
```

### Example Capture Instructions

```
Screenshot: Dashboard Overview
─────────────────────────────
Page: /dashboard
Viewport: 1440x900 (desktop)
Auth: Required (test user: demo@example.com)
Theme: Light mode

Pre-capture setup:
1. Ensure sample data loaded
2. Collapse sidebar notification panel
3. Set date range to "Last 30 days"

Capture area: Full page
Output: public/images/dashboard-overview.png

Post-capture:
- Optimize file size (target: <200KB)
- Add alt text to usage locations
```
```

---

### 27. docs-writer.md

**Purpose:** Creates and updates support documentation for user-facing features.

**Proposed Examples:**

```markdown
## Examples

### Example Documentation Structure

```markdown
# Creating Your First Project

Learn how to create and configure a new project in [ProductName].

## Prerequisites

Before you begin, make sure you have:
- An active account ([sign up here](/signup) if needed)
- At least one team member invited (for team projects)

## Steps

### 1. Open the Projects Dashboard

From the main navigation, click **Projects** → **New Project**.

![New Project Button](/images/new-project-button.png)

### 2. Choose a Template

Select a template that matches your use case:

| Template | Best For |
|----------|----------|
| Blank | Starting from scratch |
| Marketing | Campaign planning |
| Engineering | Sprint management |

### 3. Configure Settings

Fill in the required fields:

- **Project Name**: A descriptive name (e.g., "Q1 Launch Campaign")
- **Visibility**: Public (anyone can view) or Private (team only)
- **Start Date**: When the project begins

### 4. Invite Collaborators

Add team members who should have access:

1. Click **Add People**
2. Enter email addresses
3. Select their role (Admin, Editor, Viewer)

## Next Steps

- [Set up your first task](/docs/creating-tasks)
- [Connect integrations](/docs/integrations)
- [Customize your workspace](/docs/customization)
```

### Example API Documentation

```markdown
# Create User

Creates a new user account.

## Endpoint

```
POST /api/users
```

## Request

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer token |
| Content-Type | Yes | application/json |

### Body

```json
{
  "email": "alice@example.com",
  "name": "Alice Smith",
  "role": "member"
}
```

## Response

### Success (201 Created)

```json
{
  "id": "usr_abc123",
  "email": "alice@example.com",
  "name": "Alice Smith",
  "role": "member",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Errors

| Status | Code | Description |
|--------|------|-------------|
| 400 | INVALID_EMAIL | Email format is invalid |
| 409 | EMAIL_EXISTS | User with this email already exists |
```
```

---

### 28. support-article-writer.md

**Purpose:** Writes and updates support articles with screenshots for product documentation.

**Proposed Examples:**

```markdown
## Examples

### Example Troubleshooting Article

```markdown
# Can't Log In to Your Account

Having trouble accessing your account? Follow these steps to resolve common login issues.

## Quick Fixes

### 1. Check Your Email Address

Make sure you're using the email address associated with your account. If you signed up with Google, use your Google email.

### 2. Reset Your Password

1. Go to [app.example.com/login](https://app.example.com/login)
2. Click **Forgot Password**
3. Enter your email and click **Send Reset Link**
4. Check your inbox (and spam folder) for the reset email

![Password Reset Screen](/support/images/password-reset.png)

### 3. Clear Browser Cache

Sometimes cached data causes login issues:

**Chrome:** Settings → Privacy → Clear Browsing Data → Cookies and Cached Images

**Safari:** Safari Menu → Clear History → All History

### 4. Try Incognito Mode

Open a private/incognito window and try logging in. If this works, a browser extension may be interfering.

## Still Having Issues?

If you've tried all the above and still can't log in:

1. [Contact Support](/support/contact) with:
   - Your account email
   - Browser and version
   - Screenshot of any error message

We typically respond within 2 hours during business hours.
```

### Example Feature Guide

```markdown
# Setting Up Two-Factor Authentication

Add an extra layer of security to your account with two-factor authentication (2FA).

## What You'll Need

- Your account credentials
- A mobile phone with an authenticator app ([Google Authenticator](https://...) or [Authy](https://...))

## Setup Steps

### Step 1: Enable 2FA in Settings

1. Go to **Settings** → **Security**
2. Find **Two-Factor Authentication** 
3. Click **Enable**

![2FA Settings](/support/images/2fa-settings.png)

### Step 2: Scan the QR Code

1. Open your authenticator app
2. Tap **+** or **Add Account**
3. Scan the QR code shown on screen

![QR Code Screen](/support/images/2fa-qr.png)

### Step 3: Enter Verification Code

1. Your authenticator app will show a 6-digit code
2. Enter this code in the verification field
3. Click **Verify**

### Step 4: Save Backup Codes

⚠️ **Important:** Save these backup codes somewhere safe. You'll need them if you lose access to your authenticator app.

## Troubleshooting

### Code Not Working?

- Make sure your phone's time is set to automatic
- Try the next code (they refresh every 30 seconds)
- Check you're scanning the right account's code
```
```

---

### 29. tools-writer.md

**Purpose:** Creates and updates AI agent tools when features change.

**Proposed Examples:**

```markdown
## Examples

### Example Tool Definition

```json
{
  "name": "create_project",
  "description": "Creates a new project with the specified name and settings. Use this when the user wants to start a new project or workspace.",
  "parameters": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "The project name. Must be 1-100 characters."
      },
      "template": {
        "type": "string",
        "enum": ["blank", "marketing", "engineering"],
        "description": "The project template to use. Defaults to 'blank'."
      },
      "visibility": {
        "type": "string",
        "enum": ["public", "private"],
        "description": "Who can see this project. Defaults to 'private'."
      }
    },
    "required": ["name"]
  }
}
```

### Example Tool Update (Feature Change)

```markdown
## Tool Update: create_project

### Change
New "team" parameter added to allow creating team projects.

### Before
```json
{
  "required": ["name"]
}
```

### After
```json
{
  "properties": {
    "team_id": {
      "type": "string",
      "description": "The team to create the project under. If omitted, creates a personal project."
    }
  },
  "required": ["name"]
}
```

### Description Update
Old: "Creates a new project with the specified name and settings."
New: "Creates a new project with the specified name and settings. Can create personal projects or team projects."
```

### Example Error Response Documentation

```json
{
  "name": "create_project",
  "errors": [
    {
      "code": "PROJECT_LIMIT_REACHED",
      "description": "User has reached their project limit. Returned when free users try to create more than 3 projects."
    },
    {
      "code": "INVALID_TEAM",
      "description": "The specified team_id does not exist or user is not a member."
    },
    {
      "code": "NAME_TAKEN",
      "description": "A project with this name already exists in the same scope (personal or team)."
    }
  ]
}
```
```

---

## Part 4: E2E/Review Agents (3 agents)

### 30. e2e-reviewer.md

**Purpose:** Reviews UI changes and identifies all modified areas for E2E testing.

**Proposed Examples:**

```markdown
## Examples

### Example Change Analysis

```markdown
## UI Changes Detected

### PR #456: Add User Preferences Panel

**Files Changed:**
- src/components/PreferencesPanel.tsx (new)
- src/pages/Settings.tsx (modified)
- src/styles/settings.css (modified)

**UI Areas Affected:**

1. **Settings Page** — New preferences section added
   - Route: /settings
   - Test needed: Verify panel renders correctly
   
2. **Preferences Form** — New interactive component
   - Contains: Toggle switches, dropdowns, save button
   - Tests needed:
     - Form submission
     - Validation feedback
     - Success/error states

3. **Navigation** — Settings may have new sub-nav
   - Test needed: Verify navigation to preferences section

**Recommended E2E Tests:**

```typescript
// preferences.spec.ts
describe('User Preferences', () => {
  it('should display preferences panel on settings page');
  it('should save preferences successfully');
  it('should show validation error for invalid input');
  it('should persist changes after page reload');
});
```
```

### Example No-Test-Needed Analysis

```markdown
## UI Changes Detected

### PR #457: Update Footer Copyright Year

**Files Changed:**
- src/components/Footer.tsx (modified)

**Change Summary:**
Single line change: `© 2024` → `© 2025`

**UI Areas Affected:**
- Footer component (static text only)

**E2E Testing:** ⚠️ Not recommended

Justification: This is a static text change with no interactivity 
or logic. Visual verification is sufficient.
```
```

---

### 31. prd.md

**Purpose:** Generates Product Requirements Documents for new features.

**Proposed Examples:**

```markdown
## Examples

### Example PRD Structure

```markdown
---
id: prd-user-preferences
title: User Preferences
status: draft
priority: high
createdAt: 2024-01-15
---

# PRD: User Preferences

## Problem Statement

Users cannot customize their experience. Everyone sees the same 
default settings regardless of their needs. Power users have 
requested control over notifications, display density, and keyboard shortcuts.

## Goals

1. Allow users to customize notification preferences
2. Support compact/comfortable display density
3. Enable power users to configure keyboard shortcuts
4. Persist preferences across sessions and devices

## Non-Goals

- User themes (separate PRD)
- Admin-controlled forced preferences
- Preference templates/presets

## User Stories

### US-001: Notification Preferences

**As a** user
**I want to** control which notifications I receive
**So that** I'm not overwhelmed by irrelevant alerts

**Acceptance Criteria:**
- [ ] Toggle for email notifications (on/off)
- [ ] Toggle for push notifications (on/off)
- [ ] Dropdown for notification frequency (instant/hourly/daily)
- [ ] Changes save immediately with confirmation

### US-002: Display Density

**As a** power user
**I want to** see more content on screen
**So that** I can work more efficiently

**Acceptance Criteria:**
- [ ] Radio buttons: Comfortable / Compact
- [ ] Compact mode reduces spacing and font size
- [ ] Preference persists across sessions
```

### Example Clarifying Questions

```markdown
Before writing the PRD, I have some clarifying questions:

1. **Scope:** Should preferences sync across devices, or are they local to each browser?

2. **Permissions:** Can admins restrict which preferences users can change?

3. **Defaults:** Should new users get opinionated defaults or neutral ones?

4. **Migration:** Are there existing user settings that should be migrated?

Please answer these so I can draft a complete PRD.
```
```

---

### 32. prd-impact-analyzer.md

**Purpose:** Analyzes impact of completed PRDs on other PRDs in the backlog.

**Proposed Examples:**

```markdown
## Examples

### Example Impact Analysis

```markdown
## PRD Impact Analysis

### Completed PRD: prd-user-preferences

**Summary:** Added user preferences system with settings panel, 
preferences API, and storage layer.

### Impact on Backlog PRDs

#### prd-notification-system (HIGH IMPACT)
**Status:** Draft
**Impact:** 
- Now depends on preferences API for notification settings
- US-003 (notification frequency) can use existing preferences storage
- Estimate reduced: preferences infrastructure already built

**Recommended changes:**
- Add dependency on prd-user-preferences
- Remove "build preferences storage" story (already done)
- Update US-003 to integrate with existing preferences API

#### prd-dark-mode (MEDIUM IMPACT)
**Status:** Ready
**Impact:**
- Theme preference can leverage existing preferences panel
- Storage mechanism already exists
- Add "theme" field to preferences schema

**Recommended changes:**
- Add story: "Add theme toggle to existing preferences panel"
- Remove duplicate storage implementation

#### prd-mobile-app (LOW IMPACT)
**Status:** Backlog
**Impact:**
- Mobile app will need to consume same preferences API
- No immediate changes needed
- Note: Ensure API is mobile-friendly

### No Impact

These PRDs are unaffected:
- prd-billing-improvements (unrelated domain)
- prd-admin-dashboard (different user type)
```

### Example Dependency Graph

```markdown
## Updated Dependency Graph

After completing prd-user-preferences:

```
prd-user-preferences (COMPLETE)
    │
    ├── prd-notification-system (blocked → unblocked)
    │   └── prd-email-digests (still blocked by notifications)
    │
    ├── prd-dark-mode (can start integration)
    │
    └── prd-mobile-app (informational dependency)
```

**Newly unblocked:** prd-notification-system
**Ready to integrate:** prd-dark-mode
**No change:** prd-mobile-app, prd-billing-improvements
```
```

---

## Part 5: Implementation Agents (9 agents)

### 33-41. *-dev agents (aws-dev, docker-dev, go-dev, java-dev, playwright-dev, public-page-dev, python-dev, react-dev, terraform-dev)

These agents already have `❌` anti-patterns. They need `✅` positive examples showing the correct patterns. Here's a template that applies to all:

**Pattern for all implementation agents:**

```markdown
## Examples

### ✅ Good: Following project conventions

When the project's CONVENTIONS.md specifies a pattern, follow it exactly:

```typescript
// CONVENTIONS.md says: "Use zod for validation"
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

// NOT: Manual validation or other libraries
```

### ✅ Good: Proper error handling per project stack

```typescript
// Following established error pattern
export async function getUser(id: string): Promise<Result<User, AppError>> {
  try {
    const user = await db.users.findById(id);
    if (!user) {
      return err(new NotFoundError('User not found'));
    }
    return ok(user);
  } catch (e) {
    return err(new DatabaseError('Failed to fetch user', e));
  }
}
```

### ✅ Good: Test accompanies implementation

```typescript
// user.service.ts
export function calculateDiscount(amount: number, percent: number): number {
  if (percent < 0 || percent > 100) {
    throw new Error('Invalid discount percentage');
  }
  return amount * (1 - percent / 100);
}

// user.service.test.ts
describe('calculateDiscount', () => {
  it('applies percentage correctly', () => {
    expect(calculateDiscount(100, 10)).toBe(90);
  });
  
  it('throws for invalid percentage', () => {
    expect(() => calculateDiscount(100, -5)).toThrow();
    expect(() => calculateDiscount(100, 150)).toThrow();
  });
});
```
```

---

## Summary Statistics

| Category | Agents | Examples Proposed |
|----------|--------|-------------------|
| Critics | 20 | 80+ (4 per agent) |
| Testers | 2 | 6 (3 per agent) |
| Operational | 7 | 28+ (4 per agent) |
| E2E/Review | 3 | 12 (4 per agent) |
| Implementation | 9 | 27 (3 per agent, positive only) |
| **Total** | 41 | **153+** |
