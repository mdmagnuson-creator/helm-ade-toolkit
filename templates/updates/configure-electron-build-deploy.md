# Configure Electron Build-Deploy Cycle

Configure `buildDeploy` for your Electron desktop app to automate the build → kill → copy → relaunch cycle before Playwright verification. This ensures Playwright tests verify freshly-built code, not stale code.

## What to do

1. Open `docs/project.json`
2. Find your desktop app entry (e.g., `apps.desktop`)
3. Add a `buildDeploy` section:

```json
{
  "apps": {
    "desktop": {
      "type": "desktop",
      "framework": "electron",
      "buildDeploy": {
        "buildCommand": "pnpm build",
        "buildOutputApp": "apps/desktop/dist/mac-universal/YourApp.app",
        "testApp": "/Applications/YourApp Preview.app",
        "autoDeployAfterStory": true,
        "buildTimeoutMs": 300000,
        "triggerPaths": [
          "apps/desktop/electron/**",
          "apps/desktop/package.json"
        ]
      }
    }
  }
}
```

4. Configure each field:

| Field | What to set | Example |
|-------|-------------|---------|
| `buildCommand` | Your Electron build command | `"pnpm build"`, `"npm run build:electron"` |
| `buildOutputApp` | Path to the built `.app` bundle (relative to project root) | `"apps/desktop/dist/mac-universal/MyApp.app"` |
| `testApp` | Absolute path to the installed test app on macOS | `"/Applications/MyApp Preview.app"` |
| `autoDeployAfterStory` | Auto-deploy after each story/task (default: `true`) | `true` |
| `buildTimeoutMs` | Build timeout in ms (default: 300000 = 5 min) | `300000` |
| `triggerPaths` | Glob patterns for files that trigger a rebuild | See below |

5. Set `triggerPaths` based on your app architecture:

**Bundled webContent** (desktop bundles its own UI):
```json
"triggerPaths": [
  "apps/desktop/electron/**",
  "apps/desktop/src/**",
  "packages/ui/src/**",
  "apps/desktop/package.json"
]
```

**Remote webContent** (desktop loads a URL, UI changes don't need rebuild):
```json
"triggerPaths": [
  "apps/desktop/electron/**",
  "apps/desktop/preload/**",
  "apps/desktop/package.json"
]
```

Only include paths that require an Electron rebuild. For remote webContent apps, UI-only changes (React components, styles, etc.) don't need a rebuild — only main process and preload changes do.

## Files affected

- `docs/project.json`

## Why

Without `buildDeploy`, Builder declares "TASK COMPLETE" after source changes without rebuilding or deploying to the test app. Playwright then tests stale code, making E2E results meaningless. The `buildDeploy` configuration enables test-flow to automatically rebuild and redeploy before Playwright runs.

## Verification

Run this command to verify the configuration:

```bash
jq '.apps | to_entries[] | select(.value.type == "desktop") | .value.buildDeploy' docs/project.json
```

Expected output should show your `buildDeploy` configuration with all required fields (`buildCommand`, `buildOutputApp`, `testApp`, `triggerPaths`).
