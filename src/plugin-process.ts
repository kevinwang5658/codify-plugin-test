import Ajv from 'ajv';
import {
  ApplyRequestData, ImportRequestData, ImportResponseData,
  InitializeResponseData,
  IpcMessageSchema,
  IpcMessageV2,
  MessageCmd, PlanRequestData, PlanResponseData,
  SpawnStatus,
  SudoRequestData,
  SudoRequestDataSchema, ValidateRequestData, ValidateResponseData
} from 'codify-schemas';
import { nanoid } from 'nanoid';
import { ChildProcess, SpawnOptions, fork, spawn } from 'node:child_process';
import path from 'node:path';

import { CodifyTestUtils } from './test-utils.js';

const ajv = new Ajv.default({
  strict: true
});

const ipcMessageValidator = ajv.compile(IpcMessageSchema);
const sudoRequestValidator = ajv.compile(SudoRequestDataSchema);

export class PluginProcess {
  childProcess: ChildProcess
  
  /**
   * PluginTester is a helper class to integration test plugins. It launches plugins via fork() just like CodifyCLI does.
   *
   * @param pluginPath A fully qualified path
   */
  constructor(pluginPath: string) {
    if (!path.isAbsolute(pluginPath)) {
      throw new Error('A fully qualified path must be supplied to PluginTester');
    }

    this.childProcess = fork(
      pluginPath,
      [],
      {
        // Use default true to test plugins in secure mode (un-able to request sudo directly)
        // detached: true,
        env: { ...process.env },
        execArgv: ['--import', 'tsx/esm'],
      },
    )

    this.handleSudoRequests(this.childProcess);
  }

  async initialize(): Promise<InitializeResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'initialize',
      data: {},
      requestId: nanoid(6),
    });
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'validate',
      data,
      requestId: nanoid(6),
    });
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'plan',
      data,
      requestId: nanoid(6),
    });
  }

  async apply(data: ApplyRequestData): Promise<void> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'apply',
      data,
      requestId: nanoid(6),
    });
  }

  async import(data: ImportRequestData): Promise<ImportResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'import',
      data,
      requestId: nanoid(6),
    });
  }

  kill() {
    this.childProcess.kill();
  }

  private handleSudoRequests(process: ChildProcess) {
    // Listen for incoming sudo incoming sudo requests
    process.on('message', async (message) => {
      if (!ipcMessageValidator(message)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      if (message.cmd === MessageCmd.SUDO_REQUEST) {
        const { data, requestId } = message;
        if (!sudoRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin. ${JSON.stringify(sudoRequestValidator.errors, null, 2)}`);
        }

        const { command, options } = data as unknown as SudoRequestData;

        console.log(`Running command with sudo: 'sudo ${command}'`)
        const result = await sudoSpawn(command, options);

        process.send(<IpcMessageV2>{
          cmd: MessageCmd.SUDO_REQUEST + '_Response',
          data: result,
          requestId,
        })
      }
    })
  }
  
}

type CodifySpawnOptions = {
  cwd?: string;
  throws?: boolean,
} & Omit<SpawnOptions, 'detached' | 'shell' | 'stdio'>

/**
 *
 * @param cmd Command to run. Ex: `rm -rf`
 * @param opts Options for spawn
 *
 * @see promiseSpawn
 * @see spawn
 *
 * @returns SpawnResult { status: SUCCESS | ERROR; data: string }
 */
async function sudoSpawn(
  cmd: string,
  opts: CodifySpawnOptions,
): Promise<{ data: string, status: SpawnStatus }> {
  return new Promise((resolve) => {
    const output: string[] = [];

    const _cmd = `sudo ${cmd}`;

    // Source start up shells to emulate a users environment vs. a non-interactive non-login shell script
    // Ignore all stdin
    const _process = spawn(`source ~/.zshrc; ${_cmd}`, [], {
      ...opts,
      shell: 'zsh',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const { stderr, stdout } = _process
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');

    stdout.on('data', (data) => {
      output.push(data.toString());
    })

    stderr.on('data', (data) => {
      output.push(data.toString());
    })

    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);

    _process.on('close', (code) => {
      resolve({
        data: output.join(''),
        status: code === 0 ? SpawnStatus.SUCCESS : SpawnStatus.ERROR,
      })
    })
  })
}
