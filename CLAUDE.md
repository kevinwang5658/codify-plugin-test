# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@codifycli/plugin-test`, a testing framework for Codify plugins. It provides utilities to test plugin lifecycle operations (initialize, validate, plan, apply, import, destroy) by spawning plugin processes and communicating via IPC messages.

## Build and Test Commands

```bash
# Run tests
npm test

# Build the project
npm run prepublishOnly

# Start the project (for testing)
npm start
```

### Running Single Tests

Tests use Vitest. To run a specific test file:
```bash
npx vitest src/test-utils.test.ts
```

To run tests matching a pattern:
```bash
npx vitest --grep "pattern"
```

## Architecture

### Core Components

**PluginTester** (`src/plugin-tester.ts`)
- Main API for testing plugins end-to-end
- `fullTest()`: Executes complete plugin lifecycle (validate → plan → apply → import → modify → destroy)
- `install()`: Tests only installation flow (validate → plan → apply)
- `uninstall()`: Tests destroy operations
- Automatically filters configs by OS using `ResourceConfig.os` field
- Handles multiple configs by adding unique names when needed

**PluginProcess** (`src/plugin-process.ts`)
- Manages individual plugin process lifecycle
- Spawns plugin using `fork()` with tsx loader (`--import tsx/esm`)
- Handles bidirectional IPC communication
- Responds to plugin requests: `COMMAND_REQUEST`, `PRESS_KEY_TO_CONTINUE_REQUEST`, `CODIFY_CREDENTIALS_REQUEST`
- Methods mirror plugin API: `initialize()`, `validate()`, `plan()`, `apply()`, `import()`
- Debug mode: Set `DEBUG` env var to enable `--inspect-brk=9221`

**Spawn Utilities** (`src/spawn.ts`)
- `testSpawn()`: Execute commands interactively in PTY (for testing)
- `spawnSafe()`: Low-level command execution with security checks
- Blocks direct `sudo` usage (must use `requiresRoot` option)
- Strips ANSI codes from output
- Supports stdin passthrough, custom env vars, cwd

**TestUtils** (`src/test-utils.ts`)
- `sendMessageAndAwaitResponse()`: Helper for IPC request/response pattern
- Shell utilities: Detects bash/zsh, provides shell rc paths and source commands
- Platform helpers: `isMacOS()`, `isLinux()`
- Prerequisite installers: `ensureHomebrewInstalledOnMacOs()`, `ensureXcodeInstalledOnMacOs()`

### IPC Communication Flow

1. Test creates `PluginProcess` which forks plugin with IPC enabled
2. Test sends IPC messages (e.g., `{cmd: 'plan', data: {...}, requestId: '...'}`
3. Plugin processes request and may send request messages back (e.g., `COMMAND_REQUEST`)
4. `PluginProcess` intercepts requests, executes via `spawnSafe()`, sends response
5. Plugin completes and sends final response matching original `requestId`

### Plugin Testing Pattern

Typical test structure:
```typescript
// Filter configs by OS automatically
const configs: ResourceConfig[] = [
  { type: 'my-resource', param: 'value', os: [ResourceOs.MACOS] }
];

await PluginTester.fullTest('/path/to/plugin', configs, {
  validatePlan: (plans) => {
    // Custom assertions on plan results
  },
  validateApply: (plans) => {
    // Custom assertions after apply
  },
  testModify: {
    modifiedConfigs: [/* updated configs */],
    validateModify: (plans) => {
      // Verify modify operation
    }
  }
});
```

### OS Filtering

Tests automatically filter configs by OS:
- Configs with `os: [ResourceOs.MACOS]` only run on macOS
- Configs with `os: [ResourceOs.LINUX]` only run on Linux
- No `os` field means runs on all platforms
- Implemented in `PluginTester.fullTest()` using `getPlatformOs()`

## Key Technical Details

- **Module System**: ESM with NodeNext module resolution
- **TypeScript**: Strict mode with decorators support
- **Output**: Compiled to `dist/` directory
- **Node Version**: Requires Node 18+ (configured via `codify.json` for NVM)
- **IPC Validation**: All messages validated against schemas from `@codifycli/schemas` using AJV
- **Security**: Plugins spawned without direct sudo access; must request via `COMMAND_REQUEST`
- **PTY Support**: Uses `@homebridge/node-pty-prebuilt-multiarch` for interactive command execution
- **Shell History**: Commands run with `HISTORY_IGNORE` (bash) or `HISTIGNORE` (zsh) set

## Dependencies

Runtime dependencies (`@codifycli/schemas`, validation libraries, PTY) vs dev dependencies (`@codifycli/plugin-core` for development).

## Environment Variables

- `DEBUG`: Enable plugin debug mode with breakpoint
- `VITE_CODIFY_TEST_JWT`: Required for tests that need Codify credentials