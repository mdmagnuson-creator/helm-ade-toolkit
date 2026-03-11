# CloudFormation Coding Guidelines

Follow the project's existing patterns first. These guidelines apply where the project has no established convention.

## Format

- Use YAML for all CloudFormation templates. Never JSON.
- Use `AWSTemplateFormatVersion: '2010-09-09'` at the top of every template.
- Always include a `Description` for the stack that explains what it provisions.

## Naming

- Use PascalCase for all logical resource names (`WebAppSecurityGroup`, `PrimaryDatabase`, `ApiGatewayRestApi`).
- Names should be meaningful and describe what the resource is, not just its type.

## Parameters

- Use `Parameters` for any value that changes between environments or deployments (account IDs, instance types, CIDR ranges, feature flags).
- Always include `Description` on every parameter.
- Use `AllowedValues` to constrain inputs where a finite set of valid values exists.
- Set `Default` values where a sensible default exists.
- Use `AllowedPattern` and `ConstraintDescription` for free-form string inputs that must match a format.
- Use `Type: AWS::SSM::Parameter::Value<String>` to reference SSM parameters directly.

## Mappings

- Use `Mappings` for static lookups that vary by a known key (e.g. AMI IDs per region, CIDR blocks per environment).
- Access values with `!FindInMap [MapName, Key, SubKey]`.
- Do not use Mappings for values that should be Parameters.

## Conditions

- Use `Conditions` to control whether resources are created, or to toggle resource properties.
- Define conditions from parameter values: `IsProduction: !Equals [!Ref Environment, production]`.
- Apply with `Condition:` on resources, or `!If` in property values.

## Intrinsic Functions

- Prefer `!Sub` over `!Join` for string construction. `!Sub` is more readable.
  ```yaml
  # Prefer this
  !Sub 'arn:aws:s3:::${BucketName}/*'

  # Over this
  !Join ['', ['arn:aws:s3:::', !Ref BucketName, '/*']]
  ```
- Use `!Ref` to reference parameter values and resource logical IDs.
- Use `!GetAtt` to access resource attributes (`!GetAtt MyBucket.Arn`).
- Use `!Select` and `!Split` sparingly — if you find yourself chaining these, reconsider the approach.

## Tagging

- Tag all taggable resources with a consistent set of standard tags.
- At minimum include: `Environment`, `Project`/`Application`, and `ManagedBy: CloudFormation`.
- Use a `Tags` property on every resource that supports it. Do not rely on tag propagation alone.

## Outputs

- Use `Outputs` to expose important values: ARNs, endpoints, resource IDs, DNS names.
- Include `Description` on every output.
- Use `Export` with `!Sub '${AWS::StackName}-OutputName'` for values consumed by other stacks.
- Only export values that are actually referenced cross-stack. Unnecessary exports create coupling.

## Stateful Resources

- Set `DeletionPolicy: Retain` on stateful resources (RDS instances, DynamoDB tables, S3 buckets, EFS file systems).
- Set `UpdateReplacePolicy: Retain` on the same resources to prevent data loss during updates that require replacement.
- Use `DeletionPolicy: Snapshot` on RDS and EBS resources where a final snapshot is acceptable instead of full retention.

## Template Organization

- Keep templates focused on a single logical concern (networking, compute, database, etc.).
- Break large stacks into nested stacks using `AWS::CloudFormation::Stack`. Pass values between them via parameters and outputs.
- Order template sections consistently: `AWSTemplateFormatVersion`, `Description`, `Metadata`, `Parameters`, `Mappings`, `Conditions`, `Resources`, `Outputs`.

## Validation

- Validate templates with `cfn-lint` before deploying. Fix all errors and warnings.
- Use `aws cloudformation validate-template` as an additional check, but note it only catches syntax errors, not best-practice violations.
