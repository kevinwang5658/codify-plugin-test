import Ajv from 'ajv';
import { IpcMessageSchema, IpcMessageV2, MessageStatus, ResourceOs, SpawnStatus } from 'codify-schemas';
import { ChildProcess } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { PluginTester } from './plugin-tester.js';
import { testSpawn } from './spawn.js';

const ajv = new Ajv.default({
  strict: true
});
const ipcMessageValidator = ajv.compile(IpcMessageSchema);

export const TestUtils = {
  sendMessageAndAwaitResponse(process: ChildProcess, message: IpcMessageV2): Promise<any> {
    return new Promise((resolve, reject) => {
      process.on('message', (response: IpcMessageV2) => {
        if (!ipcMessageValidator(response)) {
          throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
        }

        // Wait for the message response. Other messages such as sudoRequest may be sent before the response returns
        if (response.requestId === message.requestId) {
          if (response.status === MessageStatus.SUCCESS) {
            resolve(response.data)
          } else {
            reject(new Error(String(response.data)))
          }
        }
      });

      // Send message last to ensure listeners are all registered
      process.send(message);
    });
  },

  async ensureHomebrewInstalledOnMacOs(pluginPath: string) {
    const homebrewQuery = await testSpawn('which brew');
    if (homebrewQuery.status !== SpawnStatus.SUCCESS) {
      await PluginTester.install(pluginPath, [{ type: 'homebrew', os: [ResourceOs.MACOS] }])
    }
  },

  async ensureXcodeInstalledOnMacOs(pluginPath: string) {
    const xcodeQuery = await testSpawn('xcode-select -p');
    if (xcodeQuery.status !== SpawnStatus.SUCCESS) {
      await PluginTester.install(pluginPath, [{ type: 'xcode-tools', os: [ResourceOs.MACOS] }])
    }
  },


  getShell(): 'bash' | 'zsh' {
    const shell = process.env.SHELL || '';

    if (shell.includes('bash')) {
      return 'bash';
    }

    if (shell.includes('zsh')) {
      return 'zsh';
    }

    // Default to bash for tests
    return 'bash';
  },

  /**
   * Get the primary shell rc file path
   */
  getPrimaryShellRc(): string {
    const shell = TestUtils.getShell();
    const homeDir = os.homedir();

    if (shell === 'bash') {
      return path.join(homeDir, '.bashrc')
    }

    if (shell === 'zsh') {
      return path.join(homeDir, '.zshrc');
    }

    throw new Error('Unsupported shell')
  },

  /**
   * Get the source command for the shell rc file
   * Usage: execSync(TestUtils.getSourceCommand())
   */
  getSourceCommand(): string {
    return `source ${TestUtils.getPrimaryShellRc()}`;
  },

  /**
   * Get shell-specific command to run with sourced environment
   * Usage: execSync(TestUtils.getShellCommand('which brew'))
   */
  getShellCommand(command: string): string {
    return `${TestUtils.getSourceCommand()}; ${command}`;
  },

  /**
   * Get shell name for execSync shell option
   */
  getShellName(): string {
    return TestUtils.getShell();
  },

  /**
   * Get interactive shell command
   * Usage: execSync(TestUtils.getInteractiveCommand('my-alias'))
   */
  getInteractiveCommand(command: string): string {
    const shell = TestUtils.getShell();

    return shell === 'bash'
      ? `bash -i -c "${command}"`
      : `zsh -i -c "${command}"`;
  },

  /**
   * Get which command output format based on shell
   */
  getAliasWhichCommand(aliasName: string): string {
    const shell = TestUtils.getShell();

    // zsh outputs: "alias_name: aliased to command"
    // bash outputs: "alias alias_name='command'"
    return shell === 'bash'
      ? `${TestUtils.getShellCommand(`alias ${aliasName}`)}`
      : `${TestUtils.getShellCommand(`which ${aliasName}`)}`;
  },

  /**
   * Check if running on macOS
   */
  isMacOS(): boolean {
    return os.platform() === 'darwin';
  },

  /**
   * Check if running on Linux
   */
  isLinux(): boolean {
    return os.platform() === 'linux';
  },
};
