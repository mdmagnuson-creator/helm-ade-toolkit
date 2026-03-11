# Domain-Specific Positive Examples for *-dev Agents

Each implementation agent already has ❌ anti-patterns. These are the ✅ positive examples to add.

---

## 1. aws-dev.md — CloudFormation

### ✅ Good: Following project conventions for resource naming

```yaml
# CONVENTIONS.md says: "Use {Service}{Environment}{Purpose} naming"
# project.json says: "environment: staging"

Resources:
  ApiStagingWebServer:
    Type: AWS::EC2::Instance
    Properties:
      Tags:
        - Key: Name
          Value: api-staging-webserver
        - Key: Environment
          Value: staging
```

**Why it's good:** Resource name follows the project's naming convention. Tags match the environment from project.json. Future developers can identify resources at a glance.

### ✅ Good: Using !Sub for readable string interpolation

```yaml
# Good: !Sub with explicit variable references
UserData:
  Fn::Base64:
    !Sub |
      #!/bin/bash
      aws s3 cp s3://${ArtifactsBucket}/app.zip /tmp/
      unzip /tmp/app.zip -d /var/www/
      systemctl start nginx

# Instead of: !Join with nested !Ref calls
```

**Why it's good:** !Sub is more readable than !Join with multiple !Ref calls. Variable references are clear inline.

### ✅ Good: Parameterized templates for reusability

```yaml
Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Description: Deployment environment
  
  DatabasePassword:
    Type: String
    NoEcho: true
    MinLength: 12
    Description: Database master password (not logged)

Resources:
  Database:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceIdentifier: !Sub "${AWS::StackName}-db"
      MasterUserPassword: !Ref DatabasePassword
      # Environment-specific sizing
      DBInstanceClass: !If [IsProd, db.r5.large, db.t3.medium]
```

**Why it's good:** Single template works across environments. Secrets use NoEcho. Conditional sizing reduces cost in non-prod.

---

## 2. docker-dev.md — Dockerfiles & Compose

### ✅ Good: Multi-stage build matching project stack

```dockerfile
# project.json says: "runtime: node", "version: 18"
# CONVENTIONS.md says: "Use slim images for production"

# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage (matches project convention: slim images)
FROM node:18-alpine AS runtime
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Why it's good:** Uses project's Node version from project.json. Multi-stage keeps image small. Non-root user follows security best practices.

### ✅ Good: .dockerignore matching project structure

```dockerignore
# Match project structure from project.json
node_modules
.next
.git
*.md
docs/
tests/
coverage/
.env*
*.log
```

**Why it's good:** Ignores directories that match project.json structure. Prevents copying development files into build context.

### ✅ Good: Compose file with proper health checks

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "${DEV_PORT:-3000}:3000"  # Uses project's devPort
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    depends_on:
      db:
        condition: service_healthy
```

**Why it's good:** Health check ensures container is actually serving. Depends_on with condition prevents startup race.

---

## 3. go-dev.md — Go Web Services

### ✅ Good: Error handling following project pattern

```go
// CONVENTIONS.md says: "Use custom error types with codes"
// Following the project's established pattern:

type AppError struct {
    Code    string
    Message string
    Err     error
}

func (e *AppError) Error() string {
    if e.Err != nil {
        return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.Err)
    }
    return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func GetUser(ctx context.Context, id string) (*User, error) {
    user, err := db.FindUser(ctx, id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, &AppError{Code: "NOT_FOUND", Message: "user not found"}
        }
        return nil, &AppError{Code: "DB_ERROR", Message: "failed to fetch user", Err: err}
    }
    return user, nil
}
```

**Why it's good:** Uses project's custom error type from CONVENTIONS.md. Wraps underlying errors with context. Returns typed errors for caller handling.

### ✅ Good: Handler with proper request/response types

```go
// Following project's handler pattern from existing code
type CreateUserRequest struct {
    Email string `json:"email" validate:"required,email"`
    Name  string `json:"name" validate:"required,min=1"`
}

type CreateUserResponse struct {
    ID        string    `json:"id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
}

func (h *UserHandler) Create(c *gin.Context) {
    var req CreateUserRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    user, err := h.service.CreateUser(c.Request.Context(), req)
    if err != nil {
        // Use project's error handling pattern
        h.handleError(c, err)
        return
    }
    
    c.JSON(http.StatusCreated, CreateUserResponse{
        ID:        user.ID,
        Email:     user.Email,
        Name:      user.Name,
        CreatedAt: user.CreatedAt,
    })
}
```

**Why it's good:** Uses typed request/response structs. Validates input with tags. Uses project's framework (Gin). Consistent error handling.

### ✅ Good: Test with table-driven pattern

```go
// Following project's test conventions
func TestUserService_CreateUser(t *testing.T) {
    tests := []struct {
        name    string
        input   CreateUserRequest
        want    *User
        wantErr string
    }{
        {
            name:  "valid user",
            input: CreateUserRequest{Email: "test@example.com", Name: "Test"},
            want:  &User{Email: "test@example.com", Name: "Test"},
        },
        {
            name:    "missing email",
            input:   CreateUserRequest{Name: "Test"},
            wantErr: "email is required",
        },
        {
            name:    "invalid email",
            input:   CreateUserRequest{Email: "notanemail", Name: "Test"},
            wantErr: "invalid email format",
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            svc := NewUserService(mockRepo)
            got, err := svc.CreateUser(context.Background(), tt.input)
            
            if tt.wantErr != "" {
                require.Error(t, err)
                assert.Contains(t, err.Error(), tt.wantErr)
                return
            }
            
            require.NoError(t, err)
            assert.Equal(t, tt.want.Email, got.Email)
        })
    }
}
```

**Why it's good:** Table-driven tests follow Go best practices. Tests both success and error cases. Uses testify assertions per project conventions.

---

## 4. java-dev.md — Netty & Lambda

### ✅ Good: Non-blocking handler with proper offloading

```java
// CONVENTIONS.md says: "Never block event loop, use blockingTaskExecutor"
private final EventExecutorGroup blockingExecutor;

@Override
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    Request request = (Request) msg;
    
    // Offload blocking database work to separate executor
    blockingExecutor.execute(() -> {
        try {
            User user = userRepository.findById(request.getUserId());
            
            // Write response back on event loop
            ctx.channel().eventLoop().execute(() -> {
                ctx.writeAndFlush(new Response(user));
            });
        } catch (Exception e) {
            ctx.channel().eventLoop().execute(() -> {
                ctx.writeAndFlush(new ErrorResponse(e.getMessage()));
            });
        }
    });
}
```

**Why it's good:** Database call happens off event loop. Response written back on event loop for thread safety. Follows project's blockingTaskExecutor pattern.

### ✅ Good: Proper ByteBuf handling with release

```java
@Override
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    ByteBuf buf = (ByteBuf) msg;
    try {
        // Process the buffer
        byte[] data = new byte[buf.readableBytes()];
        buf.readBytes(data);
        
        Request request = deserialize(data);
        processRequest(ctx, request);
    } finally {
        // Always release in finally block
        buf.release();
    }
}

// Or using ReferenceCountUtil for safety:
@Override
public void channelRead(ChannelHandlerContext ctx, Object msg) {
    try {
        ByteBuf buf = (ByteBuf) msg;
        // ... process
    } finally {
        ReferenceCountUtil.release(msg);
    }
}
```

**Why it's good:** ByteBuf is always released, even on exception. Uses try-finally for guaranteed cleanup. Prevents memory leaks.

### ✅ Good: Lambda handler with try-with-resources

```java
// Following AWS Lambda best practices
public class S3EventHandler implements RequestHandler<S3Event, String> {
    
    // Reuse client across invocations
    private final S3Client s3Client = S3Client.create();
    
    @Override
    public String handleRequest(S3Event event, Context context) {
        for (S3EventNotification.S3EventNotificationRecord record : event.getRecords()) {
            String bucket = record.getS3().getBucket().getName();
            String key = record.getS3().getObject().getKey();
            
            // Try-with-resources ensures stream is closed
            try (ResponseInputStream<GetObjectResponse> stream = 
                    s3Client.getObject(GetObjectRequest.builder()
                        .bucket(bucket)
                        .key(key)
                        .build())) {
                
                String content = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
                processContent(content);
                
            } catch (NoSuchKeyException e) {
                context.getLogger().log("Object not found: " + key);
                // Return gracefully, don't fail the Lambda
            }
        }
        return "Processed " + event.getRecords().size() + " records";
    }
}
```

**Why it's good:** S3 client reused across invocations (warm start). Try-with-resources closes streams. NoSuchKeyException handled gracefully.

---

## 5. playwright-dev.md — E2E Tests

### ✅ Good: Test using project's page objects

```typescript
// Following project's POM pattern from tests/pages/
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

test.describe('User Dashboard', () => {
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    
    // Use project's test user from environment
    await loginPage.goto();
    await loginPage.login(
      process.env.TEST_USER_EMAIL!,
      process.env.TEST_USER_PASSWORD!
    );
  });

  test('should display user stats correctly', async () => {
    await dashboardPage.goto();
    
    // Use semantic selectors per project conventions
    await expect(dashboardPage.statsCard).toBeVisible();
    await expect(dashboardPage.welcomeMessage).toContainText('Welcome');
  });
});
```

**Why it's good:** Uses project's existing page object pattern. Test credentials from environment. Semantic selectors match project conventions.

### ✅ Good: Resilient selectors following project patterns

```typescript
// CONVENTIONS.md says: "Prefer role > test-id > text > CSS"

// Good: Role-based selector (most resilient)
await page.getByRole('button', { name: 'Submit' }).click();

// Good: Test ID when role doesn't work
await page.getByTestId('user-menu').click();

// Good: Label for form fields
await page.getByLabel('Email address').fill('test@example.com');

// Avoid: CSS selectors that break easily
// await page.locator('.btn-primary').click();  // ❌
```

**Why it's good:** Role selectors survive UI refactors. Test IDs are explicit contracts. Matches project's selector hierarchy.

### ✅ Good: Test with proper waiting and assertions

```typescript
test('should show success message after form submission', async ({ page }) => {
  // Arrange
  const settingsPage = new SettingsPage(page);
  await settingsPage.goto();
  
  // Act
  await settingsPage.updateDisplayName('New Name');
  await settingsPage.clickSave();
  
  // Assert - wait for success state
  await expect(settingsPage.successToast).toBeVisible({ timeout: 5000 });
  await expect(settingsPage.successToast).toContainText('Settings saved');
  
  // Verify persistence
  await page.reload();
  await expect(settingsPage.displayNameInput).toHaveValue('New Name');
});
```

**Why it's good:** Uses page object methods. Explicit waits with timeouts. Verifies persistence by reloading. Clean Arrange/Act/Assert structure.

---

## 6. public-page-dev.md — Marketing Pages

### ✅ Good: Landing page following brand guidelines

```tsx
// docs/marketing/brand-voice.md says: "Clear, confident, no jargon"
// docs/design-system.md says: "Use space-y-24 between sections"

export default function LandingPage() {
  return (
    <main className="space-y-24">
      {/* Hero - value prop above fold */}
      <section className="pt-20 pb-16 text-center">
        <h1 className="text-5xl font-bold text-foreground">
          Ship faster with AI-powered reviews
        </h1>
        <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto">
          Get instant code reviews that catch bugs before your users do.
          No more waiting for teammates.
        </p>
        <div className="mt-10 flex gap-4 justify-center">
          <Button size="lg" asChild>
            <Link href="/signup">Start Free Trial</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/demo">Watch Demo</Link>
          </Button>
        </div>
      </section>
      
      {/* Social proof */}
      <section className="py-12 bg-muted">
        <p className="text-center text-muted-foreground">
          Trusted by 2,000+ engineering teams
        </p>
        <div className="mt-8 flex justify-center gap-12">
          {/* Customer logos */}
        </div>
      </section>
    </main>
  );
}
```

**Why it's good:** Headline is clear and benefit-focused (brand voice). CTA above fold. Social proof reinforces credibility. Uses design system spacing.

### ✅ Good: SEO meta tags following project patterns

```tsx
// Following project's metadata pattern from existing pages
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Code Review | ProductName',
  description: 'Get instant code reviews that catch bugs before production. Free trial, no credit card required.',
  openGraph: {
    title: 'AI Code Review | ProductName',
    description: 'Ship faster with AI-powered code reviews.',
    images: ['/og/landing.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Code Review | ProductName',
    description: 'Ship faster with AI-powered code reviews.',
  },
};
```

**Why it's good:** Title follows project's pattern. Description is under 160 chars with keywords. OG tags for social sharing.

### ✅ Good: Accessible and mobile-responsive

```tsx
<section className="px-4 md:px-8 lg:px-16">
  {/* Stack on mobile, grid on desktop */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
    {features.map((feature) => (
      <article 
        key={feature.id}
        className="p-6 rounded-lg bg-card"
      >
        {/* Icon with aria-hidden since decorative */}
        <feature.icon 
          className="w-12 h-12 text-primary" 
          aria-hidden="true" 
        />
        <h3 className="mt-4 text-lg font-semibold">
          {feature.title}
        </h3>
        <p className="mt-2 text-muted-foreground">
          {feature.description}
        </p>
      </article>
    ))}
  </div>
</section>
```

**Why it's good:** Responsive padding and grid. Proper heading hierarchy. Decorative icons hidden from screen readers.

---

## 7. python-dev.md — LangChain & AI/ML

### ✅ Good: RAG chain following project patterns

```python
# CONVENTIONS.md says: "Use LCEL for all chains"
# project.json says: "vectorstore: pinecone"

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from langchain_openai import ChatOpenAI
from langchain_pinecone import PineconeVectorStore

def create_rag_chain(vectorstore: PineconeVectorStore) -> Runnable:
    """Create a RAG chain for answering questions from documents."""
    
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 4}
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """Answer the question based only on the following context. 
If the context doesn't contain the answer, say "I don't have information about that."

Context: {context}"""),
        ("human", "{question}")
    ])
    
    model = ChatOpenAI(model="gpt-4", temperature=0)
    
    # LCEL chain composition
    chain = (
        {"context": retriever, "question": RunnablePassthrough()}
        | prompt
        | model
        | StrOutputParser()
    )
    
    return chain
```

**Why it's good:** Uses LCEL as specified in CONVENTIONS.md. Uses project's vectorstore. Clear docstring. Handles "no answer" case gracefully.

### ✅ Good: Custom tool with proper typing

```python
# Following project's tool definition pattern
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import Optional

class SearchInput(BaseModel):
    """Input schema for the search tool."""
    query: str = Field(description="The search query")
    max_results: int = Field(default=5, description="Maximum results to return")
    category: Optional[str] = Field(default=None, description="Filter by category")

@tool(args_schema=SearchInput)
def search_knowledge_base(query: str, max_results: int = 5, category: Optional[str] = None) -> str:
    """Search the knowledge base for relevant documents.
    
    Use this when you need to find information about products, policies, or procedures.
    """
    # Implementation using project's search service
    results = knowledge_base.search(
        query=query,
        limit=max_results,
        filter={"category": category} if category else None
    )
    
    if not results:
        return "No results found for your query."
    
    return "\n\n".join([
        f"**{r.title}**\n{r.snippet}" 
        for r in results
    ])
```

**Why it's good:** Pydantic schema for type safety. Docstring describes when to use the tool. Handles empty results gracefully.

### ✅ Good: Async chain with error handling

```python
# Following project's async patterns
import asyncio
from langchain_core.runnables import RunnableConfig

async def process_documents(
    documents: list[str],
    chain: Runnable,
    config: Optional[RunnableConfig] = None
) -> list[dict]:
    """Process multiple documents concurrently with error handling."""
    
    async def process_single(doc: str) -> dict:
        try:
            result = await chain.ainvoke(doc, config=config)
            return {"status": "success", "result": result}
        except Exception as e:
            # Log error but don't fail entire batch
            logger.error(f"Failed to process document: {e}")
            return {"status": "error", "error": str(e)}
    
    # Process with concurrency limit to avoid rate limits
    semaphore = asyncio.Semaphore(5)
    
    async def bounded_process(doc: str) -> dict:
        async with semaphore:
            return await process_single(doc)
    
    results = await asyncio.gather(*[bounded_process(doc) for doc in documents])
    return results
```

**Why it's good:** Async processing for throughput. Semaphore prevents rate limits. Individual failures don't break batch. Returns structured results.

---

## 8. react-dev.md — React Components

### ✅ Good: Component following project structure

```tsx
// Following project's component pattern from CONVENTIONS.md
// "Components have: types, component, exports in single file"

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// Types at top
interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
  isLoading?: boolean;
}

// Component
export function SearchBar({ 
  onSearch, 
  placeholder = 'Search...', 
  className,
  isLoading = false 
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };
  
  return (
    <form 
      onSubmit={handleSubmit}
      className={cn('flex gap-2', className)}
    >
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        disabled={isLoading}
      />
      <Button type="submit" disabled={isLoading || !query.trim()}>
        {isLoading ? 'Searching...' : 'Search'}
      </Button>
    </form>
  );
}
```

**Why it's good:** Types defined in same file per CONVENTIONS.md. Uses project's UI components. Proper disabled states. cn() for className merging.

### ✅ Good: Hook following project patterns

```tsx
// Following project's custom hook pattern
import { useState, useCallback } from 'react';
import { toast } from '@/components/ui/use-toast';

interface UseAsyncActionOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
}

export function useAsyncAction<T>(
  action: () => Promise<T>,
  options: UseAsyncActionOptions<T> = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);
  
  const execute = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await action();
      setData(result);
      options.onSuccess?.(result);
      
      if (options.successMessage) {
        toast({ description: options.successMessage });
      }
      
      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
      toast({ 
        description: error.message, 
        variant: 'destructive' 
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [action, options]);
  
  return { execute, isLoading, error, data };
}
```

**Why it's good:** Generic hook for reuse. Uses project's toast system. Proper TypeScript generics. Handles loading, error, and success states.

### ✅ Good: Form with validation following project patterns

```tsx
// Using project's form library (react-hook-form + zod)
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(50),
  email: z.string().email('Invalid email address'),
  bio: z.string().max(200).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfileForm({ defaultValues, onSubmit }: ProfileFormProps) {
  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues,
  });
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Name</FormLabel>
              <Input {...field} />
              <FormMessage />
            </FormItem>
          )}
        />
        {/* More fields... */}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </Form>
  );
}
```

**Why it's good:** Uses project's form stack (react-hook-form + zod). Zod schema defines validation. FormMessage shows errors. Proper loading state.

---

## 9. terraform-dev.md — Infrastructure

### ✅ Good: Module following project conventions

```hcl
# Following project's module structure from existing infra/
# CONVENTIONS.md says: "All resources must have project and environment tags"

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_s3_bucket" "data" {
  bucket = "${var.project_name}-${var.environment}-data"
  
  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-data"
  })
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  
  versioning_configuration {
    status = "Enabled"
  }
}
```

**Why it's good:** Variables have descriptions and validation. Common tags defined once in locals. Resources use consistent naming. Versioning enabled for data protection.

### ✅ Good: Output design for composition

```hcl
# Outputs for use by other modules
output "bucket_id" {
  description = "ID of the data bucket"
  value       = aws_s3_bucket.data.id
}

output "bucket_arn" {
  description = "ARN of the data bucket for IAM policies"
  value       = aws_s3_bucket.data.arn
}

output "bucket_domain_name" {
  description = "Domain name for bucket access"
  value       = aws_s3_bucket.data.bucket_domain_name
}

# Sensitive outputs marked appropriately
output "connection_string" {
  description = "Database connection string"
  value       = "postgres://${aws_db_instance.main.username}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive   = true
}
```

**Why it's good:** Each output has description. Only needed values exported. Sensitive data marked. Enables module composition.

### ✅ Good: Data sources for cross-reference

```hcl
# Reference existing resources without hardcoding
data "aws_vpc" "main" {
  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-vpc"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.main.id]
  }
  
  filter {
    name   = "tag:Tier"
    values = ["private"]
  }
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project_name}-${var.environment}-api"
  # ... other config
  
  vpc_config {
    subnet_ids         = data.aws_subnets.private.ids
    security_group_ids = [aws_security_group.lambda.id]
  }
}
```

**Why it's good:** Data sources find resources by tag, not hardcoded ID. Works across environments. VPC and subnet IDs derived dynamically.

---

## Summary

Each *-dev agent now has 3 domain-specific positive examples showing:
1. How to follow project conventions (CONVENTIONS.md / project.json)
2. How to handle the domain's specific patterns correctly
3. How to write tests or ensure quality for that domain

Total: 9 agents × 3 examples = 27 new ✅ Good examples
