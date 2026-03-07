# @codifycli/plugin-test

A comprehensive testing framework for Codify plugins. This package provides utilities to test the complete lifecycle of Codify plugins including initialization, validation, planning, applying, importing, and destroying resources.

## Installation

```bash
npm install --save-dev @codifycli/plugin-test
```

## Quick Start

```typescript
import { PluginTester } from '@codifycli/plugin-test';
import { ResourceConfig, ResourceOs } from '@codifycli/schemas';

// Define the resources you want to test
const configs: ResourceConfig[] = [
  {
    type: 'homebrew',
    os: [ResourceOs.MACOS]
  }
];

// Run a full lifecycle test
await PluginTester.fullTest('/path/to/your/plugin/index.js', configs, {
  validatePlan: (plans) => {
    // Assert that the plan is correct
    expect(plans[0].operation).toBe('create');
  },
  validateApply: (plans) => {
    // Verify the resource was created successfully
  }
});
```

## Features

- **Complete Lifecycle Testing**: Test all plugin operations (initialize, validate, plan, apply, import, destroy)
- **IPC Communication**: Spawns plugins as child processes and communicates via IPC, just like the Codify CLI
- **OS Filtering**: Automatically filters and runs tests based on OS compatibility
- **Interactive Command Execution**: Execute commands in PTY for realistic testing
- **Security Testing**: Validates that plugins properly request elevated permissions
- **Modify Testing**: Test resource modification scenarios

## API Reference

### PluginTester

The main API for testing plugins.

#### `PluginTester.fullTest(pluginPath, configs, options?)`

Runs a complete plugin lifecycle test including validate, plan, apply, import, modify (optional), and destroy.

**Parameters:**
- `pluginPath` (string): Absolute path to the plugin entry point
- `configs` (ResourceConfig[]): Array of resource configurations to test
- `options` (object, optional):
  - `skipUninstall` (boolean): Skip the destroy phase
  - `skipImport` (boolean): Skip the import phase
  - `validatePlan` (function): Callback to validate plan results
  - `validateApply` (function): Callback to validate apply results
  - `validateDestroy` (function): Callback to validate destroy results
  - `validateImport` (function): Callback to validate import results
  - `testModify` (object): Configuration for testing modifications
    - `modifiedConfigs` (ResourceConfig[]): Modified configurations
    - `validateModify` (function): Callback to validate modify results

**Example:**
```typescript
await PluginTester.fullTest('/path/to/plugin', configs, {
  validatePlan: (plans) => {
    expect(plans).toHaveLength(1);
    expect(plans[0].operation).toBe('create');
  },
  testModify: {
    modifiedConfigs: [
      { type: 'my-resource', newParam: 'updated-value' }
    ],
    validateModify: (plans) => {
      expect(plans[0].operation).toBe('modify');
    }
  }
});
```

#### `PluginTester.install(pluginPath, configs)`

Tests only the installation flow (validate → plan → apply).

**Parameters:**
- `pluginPath` (string): Absolute path to the plugin entry point
- `configs` (ResourceConfig[]): Array of resource configurations to install

**Example:**
```typescript
await PluginTester.install('/path/to/plugin', [
  { type: 'homebrew', os: [ResourceOs.MACOS] }
]);
```

#### `PluginTester.uninstall(pluginPath, configs, options?)`

Tests the destroy operation for resources.

**Parameters:**
- `pluginPath` (string): Absolute path to the plugin entry point
- `configs` (ResourceConfig[]): Array of resource configurations to destroy
- `options` (object, optional):
  - `validateDestroy` (function): Callback to validate destroy results

**Example:**
```typescript
await PluginTester.uninstall('/path/to/plugin', configs, {
  validateDestroy: (plans) => {
    expect(plans[0].operation).toBe('destroy');
  }
});
```

### PluginProcess

Low-level API for managing individual plugin processes.

**Example:**
```typescript
import { PluginProcess } from '@codifycli/plugin-test';

const plugin = new PluginProcess('/path/to/plugin');

try {
  // Initialize the plugin
  const initResult = await plugin.initialize();

  // Validate configs
  const validateResult = await plugin.validate({
    configs: [{ core: { type: 'my-resource' }, parameters: {} }]
  });

  // Create a plan
  const plan = await plugin.plan({
    core: { type: 'my-resource' },
    desired: { param: 'value' },
    isStateful: false,
    state: undefined
  });

  // Apply the plan
  await plugin.apply({ planId: plan.planId });
} finally {
  plugin.kill();
}
```

### TestUtils

Utility functions for common testing scenarios.

#### `TestUtils.sendMessageAndAwaitResponse(process, message)`

Sends an IPC message to a plugin process and waits for the response.

#### Shell Utilities

- `TestUtils.getShell()`: Returns the current shell ('bash' or 'zsh')
- `TestUtils.getPrimaryShellRc()`: Returns the path to the primary shell RC file
- `TestUtils.getSourceCommand()`: Returns the source command for the shell RC file
- `TestUtils.getShellCommand(command)`: Returns a command that sources the shell RC file first
- `TestUtils.getInteractiveCommand(command)`: Returns an interactive shell command

#### Platform Utilities

- `TestUtils.isMacOS()`: Returns true if running on macOS
- `TestUtils.isLinux()`: Returns true if running on Linux

#### Prerequisite Utilities

- `TestUtils.ensureHomebrewInstalledOnMacOs(pluginPath)`: Ensures Homebrew is installed
- `TestUtils.ensureXcodeInstalledOnMacOs(pluginPath)`: Ensures Xcode tools are installed

### Spawn Utilities

#### `testSpawn(command, options?)`

Execute a command interactively in a PTY (for testing).

**Parameters:**
- `command` (string): Command to execute
- `options` (object, optional):
  - `cwd` (string): Working directory
  - `env` (object): Environment variables
  - `interactive` (boolean): Run in interactive mode (default: true)
  - `requiresRoot` (boolean): Run with sudo
  - `stdin` (boolean): Enable stdin passthrough
  - `throws` (boolean): Throw on non-zero exit code

**Example:**
```typescript
import { testSpawn } from '@codifycli/plugin-test';

const result = await testSpawn('which brew');
if (result.status === SpawnStatus.SUCCESS) {
  console.log('Homebrew is installed at:', result.data);
}
```

## Testing Patterns

### OS-Specific Tests

Tests automatically filter by OS using the `os` field:

```typescript
const configs = [
  { type: 'homebrew', os: [ResourceOs.MACOS] },  // Only runs on macOS
  { type: 'apt', os: [ResourceOs.LINUX] },       // Only runs on Linux
  { type: 'git' }                                 // Runs on all platforms
];

await PluginTester.fullTest('/path/to/plugin', configs);
```

### Testing Modifications

Test that your plugin properly handles resource modifications:

```typescript
await PluginTester.fullTest('/path/to/plugin', [
  { type: 'my-resource', version: '1.0.0' }
], {
  testModify: {
    modifiedConfigs: [
      { type: 'my-resource', version: '2.0.0' }
    ],
    validateModify: (plans) => {
      expect(plans[0].operation).toBe('modify');
      expect(plans[0].changes).toContain('version');
    }
  }
});
```

### Testing Multiple Resources

Test multiple resources in a single test run:

```typescript
const configs = [
  { type: 'homebrew', name: 'homebrew-main' },
  { type: 'homebrew-package', name: 'wget', formula: 'wget' },
  { type: 'homebrew-package', name: 'curl', formula: 'curl' }
];

await PluginTester.fullTest('/path/to/plugin', configs, {
  validateApply: (plans) => {
    expect(plans).toHaveLength(3);
  }
});
```

### Prerequisite Installation

Ensure prerequisites are installed before running tests:

```typescript
import { TestUtils, PluginTester } from '@codifycli/plugin-test';

// Ensure Homebrew is installed before testing Homebrew packages
await TestUtils.ensureHomebrewInstalledOnMacOs('/path/to/core-plugin');

await PluginTester.fullTest('/path/to/plugin', [
  { type: 'homebrew-package', formula: 'wget' }
]);
```

## Environment Variables

- `DEBUG`: Enable plugin debug mode with breakpoint at `--inspect-brk=9221`
- `VITE_CODIFY_TEST_JWT`: JWT token for tests that require Codify credentials

## Development

### Running Tests

```bash
npm test
```

### Running a Single Test

```bash
npx vitest src/test-utils.test.ts
```

### Building

```bash
npm run prepublishOnly
```

## How It Works

The testing framework spawns your plugin as a child process (using Node's `fork()`) and communicates with it via IPC messages, exactly how the Codify CLI does. This ensures your tests accurately reflect real-world plugin behavior.

When your plugin requests elevated permissions or needs to execute commands, the framework intercepts these requests and handles them automatically, allowing you to test plugin behavior in a controlled environment.

## Requirements

- Node.js >= 18.0.0
- Works on macOS, Linux, and Windows

## License

ISC