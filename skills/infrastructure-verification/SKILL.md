---
name: infrastructure-verification
description: "Verify infrastructure deployments (migrations, IaC, functions) after developer creates infrastructure files. Diagnose infrastructure-first when runtime errors occur. Triggers on: migration created, infrastructure file detected, table not found, resource not found, deployment verification."
---

# Infrastructure Verification Skill

> **Purpose:** Prevent the pattern where Builder marks a story complete after @developer creates infrastructure files (migrations, IaC templates, API routes) without verifying the infrastructure was actually deployed. Also provides infrastructure-first diagnostic ordering when runtime errors occur.

---

## Section 1: Infrastructure File Detection

After @developer returns from a delegation, check if any created/modified files match infrastructure patterns.

### Detection Algorithm

```
function detectInfrastructureFiles(changedFiles):
  infraFiles = []
  
  for file in changedFiles:
    for pattern, category in INFRA_PATTERNS:
      if globMatch(file, pattern):
        infraFiles.push({ file, category, pattern })
        break  # One match per file is enough
  
  return infraFiles
```

### Infrastructure File Patterns

| Category | File Patterns | Description |
|----------|---------------|-------------|
| `migration` | `**/migrations/**`, `**/migrate/**`, `**/db/migrate/**`, `**/prisma/migrations/**`, `**/supabase/migrations/**`, `**/drizzle/**/*.sql`, `**/knex/migrations/**` | Database migration files |
| `iac-cloudformation` | `**/cloudformation/**`, `**/cfn/**`, `**/*.template.json`, `**/*.template.yaml` | CloudFormation templates |
| `iac-cdk` | `**/cdk/**`, `**/lib/*-stack.ts`, `**/lib/*-stack.js` | AWS CDK stacks |
| `iac-terraform` | `**/terraform/**`, `**/*.tf`, `**/*.tfvars` | Terraform files |
| `iac-serverless` | `serverless.yml`, `serverless.ts`, `**/serverless/**` | Serverless Framework |
| `functions` | `**/functions/**`, `**/lambdas/**`, `**/edge-functions/**`, `**/supabase/functions/**` | Serverless functions |
| `api-routes` | `**/api/**/*.ts`, `**/api/**/*.js`, `**/routes/**/*.ts`, `**/routes/**/*.js` | API route definitions |
| `rls-policies` | `**/*.sql` (containing `CREATE POLICY` or `ALTER POLICY`) | Row-Level Security policies |
| `seed-data` | `**/seeds/**`, `**/seed/**`, `**/fixtures/**` | Database seed files |

### Skip Detection For

These patterns look like infrastructure but don't need deployment verification:

- `**/migrations/**/*.test.*` — Migration test files
- `**/migrations/**/README*` — Migration docs
- `**/__mocks__/**` — Mock files
- `**/types/**` — Type definitions only

---

## Section 2: Infrastructure Verification Pipeline

When infrastructure files are detected, run the verification pipeline before proceeding to test-flow.

### Pipeline Flow

```
@developer returns successfully
    │
    ▼
Detect infrastructure files in changedFiles
    │
    ├─── No infrastructure files found ──► Skip to test-flow (normal pipeline)
    │
    └─── Infrastructure files detected ──► Run verification pipeline
              │
              ▼
         Read project.json → infrastructure config
              │
              ├─── Config exists ──► Use configured CLI commands
              │
              └─── No config ──► Use best-effort detection (see Section 2.2)
              │
              ▼
         For each infrastructure category detected:
              │
              ▼
         ┌──────────────────────────────────────────────┐
         │ Step 1: Check deployment status               │
         │   Run statusCli or verifyCommand              │
         │                                               │
         │ Step 2: If not deployed:                       │
         │   Check autoDeployOnVerify config              │
         │   ├── true  → Deploy automatically            │
         │   └── false → Warn and prompt user             │
         │                                               │
         │ Step 3: Verify deployment                      │
         │   Run verifyCommand to confirm resource exists │
         │                                               │
         │ Step 4: Report result                          │
         │   ├── Deployed ✅ → Continue                   │
         │   ├── Deploy failed ❌ → STOP pipeline         │
         │   └── User skipped ⏭️ → Continue with warning │
         └──────────────────────────────────────────────┘
              │
              ▼
         All infrastructure verified ──► Continue to test-flow
```

### 2.1 Using project.json Configuration

When `project.json` → `infrastructure` is configured:

```json
{
  "infrastructure": {
    "migrations": {
      "path": "supabase/migrations/",
      "deployCli": "supabase db push",
      "statusCli": "supabase migration list",
      "verifyCommand": "supabase db push --dry-run",
      "autoDeployOnVerify": true
    },
    "functions": {
      "path": "supabase/functions/",
      "deployCli": "supabase functions deploy",
      "statusCli": "supabase functions list",
      "verifyCommand": null,
      "autoDeployOnVerify": false
    }
  }
}
```

**For each detected infrastructure category:**

1. Look up the matching config key (e.g., `infrastructure.migrations`)
2. Run `verifyCommand` (or `statusCli`) to check deployment status
3. Parse output to determine if deployed:
   - Exit code 0 + no pending items → Deployed ✅
   - Exit code 0 + pending items listed → Not deployed ⚠️
   - Exit code non-zero → Check failed (treat as not deployed)
4. If not deployed and `autoDeployOnVerify: true`:
   - Run `deployCli`
   - Re-run `verifyCommand` to confirm
5. If not deployed and `autoDeployOnVerify: false`:
   - Show warning and prompt user (see Section 2.3)

### 2.2 Best-Effort Detection (No Config)

When `project.json` → `infrastructure` is not configured, use common patterns:

| Category | Heuristic Detection | Verification Approach |
|----------|--------------------|-----------------------|
| `migration` (Supabase) | File in `supabase/migrations/` | Check: `supabase db push --dry-run` (if `supabase` CLI available) |
| `migration` (Prisma) | File in `prisma/migrations/` | Check: `npx prisma migrate status` |
| `migration` (Drizzle) | File in `drizzle/` | Check: `npx drizzle-kit push` (dry-run) |
| `iac-terraform` | `.tf` files | Check: `terraform plan -detailed-exitcode` |
| `iac-cloudformation` | `.template.json/yaml` | Check: `aws cloudformation describe-stacks` |
| `functions` (Supabase) | File in `supabase/functions/` | Check: `supabase functions list` |

**Best-effort behavior:**
- If the CLI is available → run the check and report
- If the CLI is NOT available → show a warning only (do not block)

```
⚠️ INFRASTRUCTURE FILES DETECTED — DEPLOYMENT NOT VERIFIED

The following infrastructure files were created but could not be verified:

  📁 supabase/migrations/20260322120000_create_project_dashboard_layouts.sql
     Category: migration (Supabase)
     Status: ❓ Cannot verify — 'supabase' CLI not available

Recommendation:
  • Deploy manually: supabase db push
  • Or configure infrastructure verification in project.json:
    
    "infrastructure": {
      "migrations": {
        "path": "supabase/migrations/",
        "deployCli": "supabase db push",
        "verifyCommand": "supabase db push --dry-run",
        "autoDeployOnVerify": true
      }
    }

Proceeding to test-flow — runtime errors may indicate undeployed infrastructure.
```

### 2.3 User Prompt (When autoDeployOnVerify is false)

```
═══════════════════════════════════════════════════════════════════════
                 ⚠️ INFRASTRUCTURE NOT DEPLOYED
═══════════════════════════════════════════════════════════════════════

The following infrastructure was created but not yet deployed:

  📁 supabase/migrations/20260322120000_create_project_dashboard_layouts.sql
     Category: Database migration
     Status: Not applied

Options:
  [D] Deploy now — run: supabase db push
  [S] Skip — continue without deploying (may cause runtime errors)
  [A] Abort — stop and fix manually

> _
═══════════════════════════════════════════════════════════════════════
```

### 2.4 Verification Report

After verification completes, include a summary in the pipeline output:

```
Infrastructure Verification:
  ✅ Migration: supabase/migrations/20260322_create_layouts.sql — deployed
  ⚠️ Function: supabase/functions/sync-layout/ — skipped (user chose [S])
```

This report is included in the "TASK COMPLETE" dashboard (test-flow Section 5).

---

## Section 3: Infrastructure-Error Diagnostic Priority

When a runtime error occurs during test-flow or verification, check for infrastructure causes **BEFORE** debugging application code.

### Diagnostic Priority Order

```
Runtime error detected
    │
    ▼
Step 1: Check infrastructure error patterns (fast, CLI-based)
    │
    ├─── Matches infra pattern ──► Run infra diagnostic
    │         │
    │         ├── Infra issue confirmed ──► Deploy/fix infrastructure
    │         └── Infra looks fine ──► Continue to Step 2
    │
    └─── No pattern match ──► Continue to Step 2
    │
    ▼
Step 2: Normal application debugging (code analysis, delegation to @explore)
```

### Infrastructure Error Patterns

| Error Pattern | Regex | Likely Cause | First Diagnostic |
|---------------|-------|-------------|------------------|
| Missing table | `relation ".*" does not exist`, `PGRST205`, `table .* not found`, `no such table` | Migration not applied | Check migration status |
| Missing column | `column ".*" does not exist`, `PGRST116`, `Unknown column` | Migration not applied or outdated | Check migration status |
| Permission denied | `PGRST301`, `permission denied for table`, `RLS.*blocked` | RLS policy not applied | Check migration status (policies are often in migrations) |
| Resource not found | `ResourceNotFoundException`, `NoSuchBucket`, `NoSuchKey` | Cloud resource not created | Check IaC deployment status |
| Function not found | `FunctionNotFound`, `function .* not found`, `Edge Function .* not found` | Function not deployed | Check function deployment |
| Stack not found | `Stack .* does not exist`, `stack not found` | CloudFormation/CDK not deployed | Check stack status |
| 404 on known endpoint | `404` on endpoint matching `api/` pattern | Route/function not deployed | Check deployment status |
| Empty results | Empty array/null where data expected + recent migration files exist | Table exists but empty, or missing | Verify table exists first |
| Connection refused | `ECONNREFUSED`, `connection refused` on known service ports | Service not started/deployed | Check service status |

### Diagnostic Commands

When an infrastructure error pattern matches, run the fast diagnostic:

```
function runInfraDiagnostic(errorPattern, project):
  config = project.infrastructure  # May be null
  
  switch errorPattern.likelyCause:
    case "migration-not-applied":
      if config?.migrations?.verifyCommand:
        run(config.migrations.verifyCommand)
      else:
        # Best-effort: detect migration tool from project
        if exists("supabase/migrations/"):
          run("supabase db push --dry-run")
        elif exists("prisma/"):
          run("npx prisma migrate status")
        elif exists("drizzle/"):
          run("npx drizzle-kit push --dry-run")
      
    case "function-not-deployed":
      if config?.functions?.statusCli:
        run(config.functions.statusCli)
      else:
        if exists("supabase/functions/"):
          run("supabase functions list")
    
    case "cloud-resource-missing":
      if config?.iac?.statusCli:
        run(config.iac.statusCli)
      else:
        # Try common tools
        if exists("*.tf"):
          run("terraform plan -detailed-exitcode")
```

### Diagnostic Output

When infrastructure is confirmed as the root cause:

```
═══════════════════════════════════════════════════════════════════════
               🔧 INFRASTRUCTURE ISSUE DETECTED
═══════════════════════════════════════════════════════════════════════

Error: relation "project_dashboard_layouts" does not exist (PGRST205)

Root cause: Migration not applied
  📁 supabase/migrations/20260322120000_create_project_dashboard_layouts.sql
  Status: Pending (not deployed to database)

Fix:
  [D] Deploy now — run: supabase db push
  [M] Deploy manually — I'll wait while you handle it
  [I] Ignore — continue debugging as application issue

> _
═══════════════════════════════════════════════════════════════════════
```

**After deployment succeeds:** Re-run the failed test/verification automatically — do NOT re-analyze or re-delegate to @developer.

---

## Section 4: Integration with Builder Pipeline

### Where This Runs in the Story Processing Pipeline

```
Step 1: Set story status → in_progress
Step 2: Delegate implementation → @developer
Step 2.5: Verify infrastructure deployments ← THIS SKILL
Step 3: Run test-flow (with infra-error diagnostic priority)
Step 4: Auto-commit
Step 4.5: Execute postChangeActions
Step 5: Update story status → completed
Step 6: Advance to next story
```

### Loading Strategy

Builder loads this skill **on demand** when:

1. **After @developer returns:** Scan `changedFiles` for infrastructure patterns. If found → load skill, run Section 2.
2. **During test-flow error diagnosis:** When runtime error matches infrastructure patterns → load skill, run Section 3.

**Do NOT load this skill eagerly** — only when infrastructure files are detected or infrastructure errors occur.

### Skill Size Budget

- Expected size: ~8KB (~2K tokens)
- Loaded only when infrastructure files detected or infrastructure errors occur
- Does not replace test-flow — supplements it with a pre-check and diagnostic priority

---

## Section 5: Configuration Reference

### project.json → infrastructure

```json
{
  "infrastructure": {
    "migrations": {
      "path": "string — path to migration files (e.g., 'supabase/migrations/')",
      "deployCli": "string — command to deploy migrations (e.g., 'supabase db push')",
      "statusCli": "string — command to check migration status (e.g., 'supabase migration list')",
      "verifyCommand": "string|null — command to verify deployment (e.g., 'supabase db push --dry-run')",
      "autoDeployOnVerify": "boolean — auto-deploy when verification fails (default: false)"
    },
    "functions": {
      "path": "string — path to function definitions",
      "deployCli": "string — command to deploy functions",
      "statusCli": "string — command to list deployed functions",
      "verifyCommand": "string|null — verification command",
      "autoDeployOnVerify": "boolean (default: false)"
    },
    "iac": {
      "tool": "string — 'terraform' | 'cloudformation' | 'cdk' | 'serverless'",
      "path": "string — path to IaC files",
      "deployCli": "string — command to deploy (e.g., 'terraform apply')",
      "statusCli": "string — command to check status",
      "verifyCommand": "string|null — verification command",
      "autoDeployOnVerify": "boolean (default: false)"
    }
  }
}
```

### Defaults When No Config

| Category | Auto-Deploy | Behavior |
|----------|-------------|----------|
| `migration` | `false` | Warn only — prompt user to deploy |
| `functions` | `false` | Warn only |
| `iac` | `false` | Warn only |

**Rationale:** Auto-deploy defaults to `false` because deploying infrastructure can have side effects (data loss, billing changes). Projects must explicitly opt in.
