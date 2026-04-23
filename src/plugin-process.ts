import {
  ApplyRequestData,
  CommandRequestData,
  CommandRequestDataSchema,
  GetResourceInfoRequestData,
  GetResourceInfoResponseData,
  ImportRequestData,
  ImportResponseData,
  InitializeResponseData,
  IpcMessageSchema,
  IpcMessageV2,
  MessageCmd,
  PlanRequestData,
  PlanResponseData,
  ValidateRequestData,
  ValidateResponseData
} from '@codifycli/schemas';
import Ajv from 'ajv';
import { nanoid } from 'nanoid';
import { ChildProcess, fork } from 'node:child_process';
import path from 'node:path';

import { spawnSafe } from './spawn.js';
import { TestUtils } from './test-utils.js';

const ajv = new Ajv.default({
  strict: true
});

const ipcMessageValidator = ajv.compile(IpcMessageSchema);
const commandRequestValidator = ajv.compile(CommandRequestDataSchema);

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

    const debug = (process.env.DEBUG) ? ['--inspect-brk=9221'] : [];

    this.childProcess = fork(
      pluginPath,
      [],
      {
        // Use default true to test plugins in secure mode (un-able to request sudo directly)
        // detached: true,
        env: { ...process.env },
        execArgv: ['--import', 'tsx/esm', ...debug],
        stdio: 'pipe',
      },
    )

    this.childProcess.stderr?.pipe(process.stderr);
    this.childProcess.stdout?.pipe(process.stdout);

    this.handleIncomingRequests(this.childProcess);
  }

  async initialize(): Promise<InitializeResponseData> {
    return TestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'initialize',
      data: { verbosityLevel: 3 },
      requestId: nanoid(6),
    });
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    return TestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'validate',
      data,
      requestId: nanoid(6),
    });
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    return TestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'plan',
      data,
      requestId: nanoid(6),
    });
  }

  async apply(data: ApplyRequestData): Promise<void> {
    return TestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'apply',
      data,
      requestId: nanoid(6),
    });
  }

  async import(data: ImportRequestData): Promise<ImportResponseData> {
    return TestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'import',
      data,
      requestId: nanoid(6),
    });
  }

  async getResourceInfo(data: GetResourceInfoRequestData): Promise<GetResourceInfoResponseData> {
    return TestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'getResourceInfo',
      data,
      requestId: nanoid(6),
    });
  }

  kill() {
    this.childProcess.kill();
  }

  private handleIncomingRequests(cp: ChildProcess) {
    // Listen for incoming sudo incoming sudo requests
    cp.on('message', async (message) => {
      if (!ipcMessageValidator(message)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      if (message.cmd === MessageCmd.COMMAND_REQUEST) {
        const { data, requestId } = message;
        if (!commandRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin. ${JSON.stringify(commandRequestValidator.errors, null, 2)}`);
        }

        const { command, options } = data as unknown as CommandRequestData;
        const result = await spawnSafe(command, options);

        cp.send(<IpcMessageV2>{
          cmd: MessageCmd.COMMAND_REQUEST + '_Response',
          data: result,
          requestId,
        })
      }

      if (message.cmd === MessageCmd.PRESS_KEY_TO_CONTINUE_REQUEST) {
        const { data, requestId } = message;
        if (!commandRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin. ${JSON.stringify(commandRequestValidator.errors, null, 2)}`);
        }

        cp.send(<IpcMessageV2>{
          cmd: MessageCmd.PRESS_KEY_TO_CONTINUE_REQUEST + '_Response',
          data: {},
          requestId,
        })
      }

      if (message.cmd === MessageCmd.CODIFY_CREDENTIALS_REQUEST) {
        const { requestId } = message;

        const testJwt = process.env.VITE_CODIFY_TEST_JWT;
        if (!testJwt) {
          throw new Error('Unable to parse login credentials from VITE_CODIFY_TEST_JWT env var. Please set and try again');
        }

        cp.send(<IpcMessageV2>{
          cmd: MessageCmd.CODIFY_CREDENTIALS_REQUEST + '_Response',
          data: testJwt,
          requestId,
        })
      }
    })
  }
  
}
