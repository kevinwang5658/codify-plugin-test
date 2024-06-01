import Ajv2020 from 'ajv/dist/2020.js';
import {
  ApplyRequestData,
  InitializeResponseData,
  IpcMessageSchema,
  MessageCmd,
  ParameterOperation,
  PlanRequestData,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
  SpawnStatus,
  SudoRequestData,
  SudoRequestDataSchema,
  ValidateRequestData,
  ValidateResponseData
} from 'codify-schemas';
import { ChildProcess, SpawnOptions, fork, spawn } from 'node:child_process';
import path from 'node:path';

import { CodifyTestUtils } from './test-utils.js';

const ajv = new Ajv2020.default({
  strict: true
});
const ipcMessageValidator = ajv.compile(IpcMessageSchema);
const sudoRequestValidator = ajv.compile(SudoRequestDataSchema);

export class PluginTester {
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
        detached: true,
        env: { ...process.env },
        execArgv: ['--import', 'tsx/esm'],
      },
    )

    this.handleSudoRequests(this.childProcess);
  }

  async fullTest(configs: ResourceConfig[], assertPlans?: (plans: PlanResponseData[]) => void): Promise<void> {
    const initializeResult = await this.initialize();

    const unsupportedConfigs = configs.filter((c)  =>
      !initializeResult.resourceDefinitions.some((rd) => rd.type === c.type)
    )
    if (unsupportedConfigs.length > 0) {
      throw new Error(`The plugin does not support the following configs supplied:\n ${JSON.stringify(unsupportedConfigs, null, 2)}\n Initialize result: ${JSON.stringify(initializeResult)}`)
    }

    const validate = await this.validate({ configs });

    const invalidConfigs = validate.validationResults.filter((v) => !v.isValid)
    if (invalidConfigs.length > 0) {
      throw new Error(`The following configs did not validate:\n ${JSON.stringify(invalidConfigs, null, 2)}`)
    }

    const plans = [];
    for (const config of configs) {
      plans.push(await this.plan(config));
    }

    if (assertPlans) {
      assertPlans(plans);
    }

    for (const plan of plans) {
      await this.apply({
        planId: plan.planId
      });
    }

    // Check that all applys were successful by re-planning
    const validationPlans = [];
    for (const config of configs) {
      validationPlans.push(await this.plan(config));
    }

    const unsuccessfulPlans = validationPlans.filter((p) => p.operation !== ResourceOperation.NOOP);
    if (unsuccessfulPlans.length > 0) {
      throw new Error(`The following applies were not successful. Re-running plan shows that the resources did not return no-op but instead returned:
${JSON.stringify(unsuccessfulPlans, null, 2)}`
      )
    }
  }

  async uninstall(configs: ResourceConfig[]) {
    for (const config of configs) {
      const { dependsOn, name, type, ...parameters } = config

      await this.apply({
        plan: {
          operation: ResourceOperation.DESTROY,
          parameters: Object.entries(parameters).map(([key, value]) => ({
            name: key,
            newValue: null,
            operation: ParameterOperation.REMOVE,
            previousValue: value,
          })),
          resourceType: type,
        }
      });

      // Validate that the destroy was successful
      const validationPlan = await this.plan(config);
      if (validationPlan.operation !== ResourceOperation.CREATE) {
        throw new Error(`Resource ${type} was not successfully destroyed.
Validation plan shows:
${JSON.stringify(validationPlan, null, 2)}
Previous config:
${JSON.stringify(config, null, 2)}`
        );
      }
    }
  }

  async initialize(): Promise<InitializeResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'initialize',
      data: {},
    });
  }

  async validate(data: ValidateRequestData): Promise<ValidateResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'validate',
      data,
    });
  }

  async plan(data: PlanRequestData): Promise<PlanResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'plan',
      data,
    });
  }

  async apply(data: ApplyRequestData): Promise<void> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'apply',
      data,
    });
  }
  
  private handleSudoRequests(process: ChildProcess) {
    // Listen for incoming sudo incoming sudo requests
    process.on('message', async (message) => {
      if (!ipcMessageValidator(message)) {
        throw new Error(`Invalid message from plugin. ${JSON.stringify(message, null, 2)}`);
      }

      if (message.cmd === MessageCmd.SUDO_REQUEST) {
        const { data } = message;
        if (!sudoRequestValidator(data)) {
          throw new Error(`Invalid sudo request from plugin. ${JSON.stringify(sudoRequestValidator.errors, null, 2)}`);
        }

        const { command, options } = data as unknown as SudoRequestData;

        console.log(`Running command with sudo: 'sudo ${command}'`)
        const result = await sudoSpawn(command, options);

        process.send({
          cmd: MessageCmd.SUDO_REQUEST + '_Response',
          data: result,
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
