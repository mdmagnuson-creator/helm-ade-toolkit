# Terraform Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Formatting

- All code must be `terraform fmt` formatted. No exceptions.

## Naming

- Use `snake_case` for all resource names, variables, outputs, locals, and modules.
- Resource names should be meaningful and describe what the resource is, not its type: `main` or `primary` for a single instance, `this` if there's only one of a kind in the module, or a descriptive name for multiples (e.g. `public`, `private` for subnets).
- Do not repeat the resource type in the name. Use `aws_instance.web`, not `aws_instance.web_instance`.

## Variables and Locals

- Use `variable` blocks for values that change between environments (region, instance size, CIDR blocks, feature flags).
- Use `locals` for computed or derived values (constructed names, merged maps, conditional expressions).
- Every `variable` must have a `description`. Include a `type` constraint. Add `validation` blocks where input correctness matters.
- Set sensible `default` values where appropriate. Variables without defaults are required inputs — that should be intentional.

## Outputs

- Every `output` must have a `description`.
- Output values that downstream consumers or other state files will need (IDs, ARNs, endpoints).

## Modules

- Use modules to encapsulate reusable infrastructure patterns. A module should represent a logical unit (e.g. a VPC, an ECS service, a database).
- Pin module versions. For registry modules: `version = "~> 3.0"`. For git sources: use a `ref` tag.
- Keep the root module thin — it should primarily compose modules and pass variables.
- Modules should have a `README.md` with usage examples if they are shared.

## Providers

- Pin provider versions in `required_providers` with `~>` constraints.
- Do not put provider configuration in reusable modules. Let the calling root module configure providers.

## State Management

- Use remote state. Our standard is S3 backend with S3-native locking.
- Keep state files scoped per-service and per-environment. Do not put unrelated infrastructure in the same state.
- Use `terraform_remote_state` data sources to read outputs from other state files when cross-referencing infrastructure.

## Data Sources

- Use `data` sources to reference existing infrastructure (VPCs, AMIs, IAM policies, ACM certificates). Do not hardcode IDs, ARNs, or account numbers.
- Prefer data source lookups by tags or names over hardcoded identifiers.

## Resource Creation Patterns

- Use `for_each` for creating multiple similar resources. Prefer `for_each` over `count` because it uses map keys as identifiers, making additions and removals predictable.
- Use `count` only for simple conditional creation (`count = var.enable_feature ? 1 : 0`).

## Tagging

- Tag all resources that support tags. At minimum include:
  - `Environment` — the deployment environment (e.g. `dev`, `staging`, `production`)
  - `Service` or `Project` — the service or project that owns the resource
- Use `default_tags` in the provider block for tags that apply to everything. Add resource-specific tags inline.

## Plan and Apply

- Always run `terraform plan` and review the output before applying.
- Never use `-auto-approve` in production environments.
- Destructive changes (replacements, deletions) must be reviewed carefully. Use `lifecycle { prevent_destroy = true }` on critical resources.

## File Organization

- `main.tf` — primary resources and module calls.
- `variables.tf` — all input variables.
- `outputs.tf` — all outputs.
- `providers.tf` or `versions.tf` — provider configuration and required versions.
- `locals.tf` — local values (if there are enough to warrant a separate file).
- `data.tf` — data source lookups (if there are enough to warrant a separate file).
- Split into additional files by logical grouping when `main.tf` gets large (e.g. `networking.tf`, `iam.tf`).
- `backends/{tenant}.backend` - tenant-specific backend information, eg `backends/prod.backend`
- `vars/{tenant}.tfvars` - tenant-specific variables, eg `vars/dev.tfvars`

## General

- Use `terraform validate` to catch syntax and type errors before planning.
- Use `moved` blocks for refactoring resource addresses instead of manual state surgery.
- Avoid `provisioner` blocks (especially `local-exec` and `remote-exec`). Use native resource types, cloud-init, or configuration management tools instead.
- Do not store secrets in Terraform state or variable defaults. Use secret management tools (Secrets Manager, SSM Parameter Store) and reference them via data sources.
