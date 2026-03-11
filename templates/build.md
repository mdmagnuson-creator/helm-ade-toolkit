# Build System

All projects use a Makefile as the standard interface for building, testing, and deploying. Always use `make {target}` to perform these operations. Do not attempt to determine or run the underlying commands directly.

## Targets

| Target | Purpose |
|---|---|
| `make build` | Compile or transpile the project source code. |
| `make package` | Package the built artifact for deployment (e.g., Docker image, zip archive, apt package). |
| `make publish` | Push the packaged artifact to a remote registry or host (e.g., ECR, S3, remote server). |
| `make deploy` | Update a remote environment with the published artifact. |
| `make lint` | Run static analysis and linting tools. |
| `make test` | Run unit tests. |
| `make run` | Run the project locally (typically via docker-compose). |
| `make regressions` | Run Playwright end-to-end/regression tests. |

## Notes

- Some targets accept environment variables or arguments. Check the project's Makefile for specifics.
- Not every project implements every target. If a target is missing, it is not supported for that project.
