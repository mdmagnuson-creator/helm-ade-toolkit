# PRD: Multi-Platform App Support & Electron Testing

## Introduction

Extend the project.json schema to properly model multi-platform applications (desktop, mobile, web) and add an Electron-specific E2E testing skill. This enables Builder and Planner to understand when projects target multiple platforms and automatically suggest or load appropriate testing skills.

Currently, the `apps` structure only supports `type` values like `frontend`, `backend`, `fullstack`. There's no way to express:
- An app that runs on desktop (Electron, Tauri)
- An app that runs on mobile (React Native, Flutter, Capacitor)
- An app that runs on multiple platforms (Electron for desktop + mobile)
- Platform-specific metadata (bundle IDs, app store info, signing/notarization)
- Platform-specific testing requirements

## Goals

- Enable `project.json` to fully describe multi-platform applications
- Allow Builder/Planner to detect when Electron testing is needed
- Create `e2e-electron` skill for Playwright Electron testing patterns
- Provide future extensibility for mobile testing (React Native, Flutter)
- Keep the schema backwards-compatible with existing projects
- Create centralized skill-mapping for framework→skill lookups

## Scope Considerations

- permissions: not relevant (toolkit-internal change)
- support-docs: not relevant (internal agents/schema)
- ai-tools: not relevant

## User Stories

### US-001: Extend apps schema with platforms array

**Description:** As a toolkit maintainer, I need the `apps` schema to support a `platforms` array so projects can declare which platforms each app targets.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Add `platforms` property to app schema (array of platform identifiers)
- [ ] Define platform enum: `browser`, `server`, `macos`, `windows`, `linux`, `ios`, `android`, `tvos`, `watchos`
- [ ] Add `platformMetadata` object for platform-specific config (bundle IDs, signing, notarization, etc.)
- [ ] Existing projects without `platforms` continue to work (backwards compatible)
- [ ] Schema validates correctly with `ajv` or equivalent

### US-002: Add desktop and mobile app types

**Description:** As a toolkit maintainer, I need new `type` values for desktop and mobile apps so the schema can distinguish them from web apps.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Add `desktop` and `mobile` to `type` enum
- [ ] Add framework enum values for desktop: `electron`, `tauri`, `neutralino`
- [ ] Add framework enum values for mobile: `react-native`, `flutter`, `expo`, `capacitor`, `ionic`
- [ ] Add framework enum values for native: `swift`, `kotlin`, `swiftui`
- [ ] Add `runtime` field for mobile apps (e.g., `hermes`, `jsc` for React Native)
- [ ] Schema validates projects with new types correctly

### US-003: Add per-app testing configuration

**Description:** As a toolkit maintainer, I need apps to declare their testing framework per-platform so Builder knows which testing skill to load.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Add `testing` object to app schema with `framework` and `testDir` properties
- [ ] Testing framework enum includes: `playwright`, `playwright-electron`, `detox`, `maestro`, `appium`, `xcuitest`, `espresso`
- [ ] Builder can read `apps[*].testing.framework` to determine skill to load
- [ ] Falls back to project-level `testing` config if app-level not specified

### US-004: Add platform metadata for signing and notarization

**Description:** As a toolkit maintainer, I need platform metadata to include signing and notarization configuration so agents can understand app distribution requirements.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] macOS metadata includes: `bundleId`, `teamId`, `category`, `entitlements`, `notarize` (boolean), `signingIdentity`
- [ ] Windows metadata includes: `appId`, `certificateSubject`, `signTool`
- [ ] Linux metadata includes: `appId`, `category`, `desktop` (freedesktop entry fields)
- [ ] iOS metadata includes: `bundleId`, `teamId`, `provisioningProfile`, `capabilities`
- [ ] Android metadata includes: `packageName`, `keystoreAlias`, `minSdkVersion`, `targetSdkVersion`
- [ ] Schema validates all platform metadata correctly

### US-005: Create skill-mapping.json and schema

**Description:** As a toolkit maintainer, I need a centralized skill-mapping file so agents can look up which skills apply to which frameworks/platforms without duplicating logic.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `data/skill-mapping.json` with framework→skill mappings
- [ ] Create `schemas/skill-mapping.schema.json` to validate the mapping file
- [ ] Include `platformSkills` section mapping frameworks to their testing skills
- [ ] Include `testingFrameworkSkills` section mapping testing frameworks to skills
- [ ] Include `detectBy` hints for each mapping (e.g., `["framework", "package.json"]`)
- [ ] Agents can read this file at runtime to determine skill loading

### US-006: Create e2e-electron skill

**Description:** As a tester agent, I need an `e2e-electron` skill that teaches me how to write and run Playwright tests for Electron apps.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Create `skills/e2e-electron/SKILL.md` with Electron testing patterns
- [ ] Include setup instructions (Playwright Electron API)
- [ ] Include example test structure
- [ ] Include common gotchas (main process vs renderer, app lifecycle)
- [ ] Include launch configuration patterns
- [ ] Define triggers: `apps[*].framework === 'electron'` OR `apps[*].testing.framework === 'playwright-electron'`

### US-007: Update e2e-playwright agent to load electron skill

**Description:** As the e2e-playwright agent, I need to detect when I'm testing an Electron app and load the appropriate skill.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] e2e-playwright agent reads `data/skill-mapping.json` for skill lookup
- [ ] e2e-playwright agent checks `project.json` for Electron apps
- [ ] When Electron detected, load `e2e-electron` skill before writing tests
- [ ] Pass relevant app config (path, main entry, etc.) to skill context
- [ ] Works for both explicit config and fallback detection (electron in package.json)

### US-008: Update tester agent routing for platform-specific tests

**Description:** As the tester agent, I need to route to the correct testing sub-agent based on app platform and testing framework.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Tester reads `apps` from `project.json`
- [ ] Tester reads `data/skill-mapping.json` for routing decisions
- [ ] For Electron apps, route E2E requests to e2e-playwright with electron skill hint
- [ ] For mobile apps (future), route to appropriate agent (stub routing logic)
- [ ] Includes detection fallback: scan for `electron` in package.json if not in apps config

### US-009: Add skill suggestion capability to Builder/Planner

**Description:** As Builder or Planner, when I detect an app platform that has a matching skill not currently loaded, I should suggest adding it.

**Documentation:** No

**Tools:** No

**Considerations:** none

**Credentials:** none

**Acceptance Criteria:**

- [ ] Builder reads `data/skill-mapping.json` during startup
- [ ] Builder detects missing skill config during startup or E2E phase
- [ ] Builder outputs suggestion: "Detected Electron app. Consider adding `e2e-electron` skill for E2E testing."
- [ ] Planner reads `data/skill-mapping.json` when creating PRDs
- [ ] Planner includes skill recommendation in PRD when relevant platforms detected

## Functional Requirements

- FR-1: The `apps` schema must support a `platforms` array containing platform identifiers
- FR-2: Platform identifiers must be from a defined enum: `browser`, `server`, `macos`, `windows`, `linux`, `ios`, `android`, `tvos`, `watchos`
- FR-3: Apps must support `type` values: `frontend`, `backend`, `fullstack`, `cli`, `library`, `worker`, `desktop`, `mobile`
- FR-4: Apps must support platform-specific metadata including signing and notarization config
- FR-5: Apps must support per-app testing configuration with framework and testDir
- FR-6: Apps must support a `runtime` field for mobile platforms
- FR-7: A centralized `data/skill-mapping.json` file must define framework→skill mappings
- FR-8: The `e2e-electron` skill must document Playwright Electron testing patterns
- FR-9: The e2e-playwright agent must detect Electron apps and load the skill
- FR-10: The tester agent must route platform-specific test requests appropriately
- FR-11: Builder/Planner must suggest relevant skills when platform detected but skill not configured

## Non-Goals

- No mobile testing skills in this PRD (future work)
- No Tauri-specific skill (can use generic desktop patterns)
- No automatic skill installation (just suggestions)
- No changes to projects.json registry (only project.json schema)

## Technical Considerations

**Schema Changes:**
- `project.schema.json` in `/schemas/` directory
- Backwards compatible — new fields are optional
- Existing `type` enum expanded, not replaced

**New Files:**
- `data/skill-mapping.json` — framework→skill mappings
- `schemas/skill-mapping.schema.json` — validates skill-mapping.json

**Skill Location:**
- `skills/e2e-electron/SKILL.md`
- Resources in `skills/e2e-electron/` if needed

**Agent Updates:**
- `agents/e2e-playwright.md` — add skill loading logic using skill-mapping.json
- `agents/tester.md` — add routing logic using skill-mapping.json
- `agents/builder.md` — add skill suggestion output
- `agents/planner.md` — add skill recommendation in PRD

**Detection Logic:**
- Primary: Read `data/skill-mapping.json` for framework→skill lookup
- Secondary: `apps[*].framework === 'electron'` in project.json
- Tertiary: `apps[*].platforms` includes `macos|windows|linux`
- Fallback: `electron` in any `package.json` dependencies

## Design Considerations

**Platform Metadata Structure:**
```json
{
  "apps": {
    "desktop": {
      "path": "apps/desktop",
      "type": "desktop",
      "platforms": ["macos", "windows", "linux"],
      "framework": "electron",
      "platformMetadata": {
        "macos": {
          "bundleId": "com.example.app",
          "teamId": "XXXXXXXXXX",
          "category": "public.app-category.developer-tools",
          "entitlements": "build/entitlements.mac.plist",
          "notarize": true,
          "signingIdentity": "Developer ID Application: Example Inc"
        },
        "windows": {
          "appId": "com.example.app",
          "certificateSubject": "Example Inc",
          "signTool": "signtool"
        },
        "linux": {
          "appId": "com.example.app",
          "category": "Development"
        }
      },
      "testing": {
        "framework": "playwright-electron",
        "testDir": "e2e/desktop"
      }
    },
    "mobile": {
      "path": "apps/mobile",
      "type": "mobile",
      "platforms": ["ios", "android"],
      "framework": "react-native",
      "runtime": "hermes",
      "platformMetadata": {
        "ios": {
          "bundleId": "com.example.app",
          "teamId": "XXXXXXXXXX",
          "provisioningProfile": "AppStore_com.example.app",
          "capabilities": ["push-notifications", "associated-domains"]
        },
        "android": {
          "packageName": "com.example.app",
          "keystoreAlias": "release",
          "minSdkVersion": 24,
          "targetSdkVersion": 34
        }
      },
      "testing": {
        "framework": "detox",
        "testDir": "e2e/mobile"
      }
    }
  }
}
```

**skill-mapping.json Structure:**
```json
{
  "$schema": "https://opencode.ai/schemas/skill-mapping.json",
  "version": 1,
  "platformSkills": {
    "electron": {
      "e2e": "e2e-electron",
      "detectBy": ["framework", "package.json"]
    },
    "tauri": {
      "e2e": "e2e-playwright",
      "detectBy": ["framework", "package.json"]
    },
    "react-native": {
      "e2e": "e2e-detox",
      "detectBy": ["framework", "package.json"]
    },
    "flutter": {
      "e2e": "e2e-flutter",
      "detectBy": ["framework", "pubspec.yaml"]
    },
    "capacitor": {
      "e2e": "e2e-playwright",
      "detectBy": ["framework", "package.json"]
    }
  },
  "testingFrameworkSkills": {
    "playwright-electron": "e2e-electron",
    "playwright": "e2e-playwright",
    "detox": "e2e-detox",
    "maestro": "e2e-maestro",
    "appium": "e2e-appium",
    "xcuitest": "e2e-xcuitest",
    "espresso": "e2e-espresso"
  }
}
```

## Success Metrics

- helm-ade desktop app is properly detected by agents
- Electron testing skill is loaded when needed
- No breaking changes to existing project.json files
- Schema validates with ajv
- skill-mapping.json is the single source of truth for framework→skill lookups

## Definition of Done

- [ ] Schema extended with all new fields (US-001, US-002, US-003, US-004)
- [ ] skill-mapping.json and schema created (US-005)
- [ ] e2e-electron skill created and documented (US-006)
- [ ] e2e-playwright agent loads skill for Electron apps (US-007)
- [ ] tester agent routes correctly (US-008)
- [ ] Builder/Planner suggest skills when appropriate (US-009)
- [ ] All acceptance criteria verified
- [ ] Existing projects validate against updated schema
- [ ] helm-ade desktop app detected correctly (manual verification)

## Credential & Service Access Plan

No external credentials required for this PRD.
