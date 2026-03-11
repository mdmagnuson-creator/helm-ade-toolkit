# Add Desktop App E2E Testing Configuration

Configure `executablePath` and optional `devLaunchArgs` for your desktop application to enable Playwright-based E2E testing.

## What to do

1. Open `docs/project.json`
2. Find your desktop app entry (e.g., `apps.desktop`)
3. Add or update the `testing` section:

```json
{
  "apps": {
    "desktop": {
      "type": "desktop",
      "framework": "electron",
      "testing": {
        "framework": "playwright-electron",
        "testDir": "e2e/desktop",
        "executablePath": {
          "macos": "/Applications/YourApp.app/Contents/MacOS/YourApp",
          "windows": "C:\\Program Files\\YourApp\\YourApp.exe",
          "linux": "/usr/local/bin/yourapp"
        },
        "devLaunchArgs": [".", "--enable-logging"]
      }
    }
  }
}
```

4. Adjust paths for your specific application

## Files affected

- `docs/project.json`

## Why

The new `executablePath` field tells Playwright where to find your built application binary for E2E testing. Without this, Playwright cannot launch your desktop app.

The optional `devLaunchArgs` field specifies arguments to pass when launching in development mode.

## Verification

Run this command to verify the configuration:

```bash
jq '.apps | to_entries[] | select(.value.type == "desktop") | .value.testing' docs/project.json
```

Expected output should show your `executablePath` configuration.
