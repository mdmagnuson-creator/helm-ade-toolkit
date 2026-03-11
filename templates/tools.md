# Tool Usage

## Cross-Service Blast Radius Search

Use semantic code search tooling when available to discover how projects and services communicate. This is critical for understanding downstream and upstream consequences.

If semantic search tooling is unavailable, fall back to repository-native search (`grep`, project indexes, dependency maps).

Before modifying any of the following, run a blast-radius search to find all affected services:

- API endpoints or request/response schemas
- Event schemas and message formats
- Shared contracts, interfaces, or types
- Inter-service communication (REST calls, queue messages, shared databases)

Do not assume you know the full blast radius of a change. Search first.
