import Ajv from 'ajv';
import {
  ApplyRequestData,
  ImportRequestData,
  ImportResponseData,
  InitializeResponseData,
  IpcMessageSchema,
  MessageCmd,
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
import inspector from 'node:inspector'
import path from 'node:path';

import { CodifyTestUtils } from './test-utils.js';

const ajv = new Ajv.default({
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

    console.log('Node Inspector:')
    console.log(inspector.url());

    this.childProcess = fork(
      pluginPath,
      [],
      {
        // Use default true to test plugins in secure mode (un-able to request sudo directly)
        // detached: true,
        env: { ...process.env },
        execArgv: ['--import', 'tsx/esm', '--inspect=9221'],
      },
    )

    this.handleSudoRequests(this.childProcess);
  }

  async fullTest(
    configs: ResourceConfig[],
    options?: {
      skipUninstall?: boolean,
      validatePlan?: (plans: PlanResponseData[]) => Promise<void> | void
      validateApply?: (plans: PlanResponseData[]) => Promise<void> | void,
      validateDestroy?: (plans: PlanResponseData[]) => Promise<void> | void,
      validateImport?: (importResults: (ImportResponseData['result'][0])[]) => Promise<void> | void,
  }): Promise<void> {
    const {
      skipUninstall = false,
    } = options ?? {}

    const initializeResult = await this.initialize();

    const unsupportedConfigs = configs.filter((c)  =>
      !initializeResult.resourceDefinitions.some((rd) => rd.type === c.type)
    )
    if (unsupportedConfigs.length > 0) {
      throw new Error(`The plugin does not support the following configs supplied:\n ${JSON.stringify(unsupportedConfigs, null, 2)}\n Initialize result: ${JSON.stringify(initializeResult)}`)
    }

    const validate = await this.validate({ configs });

    const invalidConfigs = validate.resourceValidations.filter((v) => !v.isValid)
    if (invalidConfigs.length > 0) {
      throw new Error(`The following configs did not validate:\n ${JSON.stringify(invalidConfigs, null, 2)}`)
    }

    const plans = [];
    for (const config of configs) {
      plans.push(await this.plan({
        desired: config,
        isStateful: false,
        state: undefined,
      }));
    }

    if (options?.validatePlan) {
      await options.validatePlan(plans);
    }

    for (const plan of plans) {
      await this.apply({
        planId: plan.planId
      });
    }

    // Check that all applys were successful by re-planning
    const validationPlans = [];
    for (const config of configs) {
      validationPlans.push(await this.plan({
        desired: config,
        isStateful: false,
        state: undefined,
      }));
    }

    const unsuccessfulPlans = validationPlans.filter((p) => p.operation !== ResourceOperation.NOOP);
    if (unsuccessfulPlans.length > 0) {
      throw new Error(`The following applies were not successful. Re-running plan shows that the resources did not return no-op but instead returned:
${JSON.stringify(unsuccessfulPlans, null, 2)}`
      )
    }

    if (options?.validateApply) {
      await options.validateApply(plans);
    }

    const importResults = [];
    const unsuccessfulImports = [];
    for (const config of configs) {
      const importResult = await this.import({ config })
      importResults.push(importResult);

      if (importResult.result.length !== 1 ||
        Object.entries(config).some(([k, v]) => importResult.result[0][k] !== v)
      ) {
        unsuccessfulImports.push(importResult);
      }
    }

    if (unsuccessfulImports.length > 0) {
      throw new Error(`The following imports were not successful. The imports differed from the original.
${JSON.stringify(unsuccessfulImports, null, 2)}`);
    }

    if (options?.validateImport) {
      await options.validateImport(importResults.map((r) => r.result[0]));
    }

    if (!skipUninstall) {
      await this.uninstall(configs.toReversed(), options);
    }
  }

  async uninstall(configs: ResourceConfig[], options?: {
    validateDestroy?: (plans: PlanResponseData[]) => Promise<void> | void
  }) {
    const plans = [];

    for (const config of configs) {
      plans.push(await this.plan({
        desired: undefined,
        isStateful: true,
        state: config
      }))
    }

    for (const plan of plans) {
      if (plan.operation !== ResourceOperation.DESTROY) {
        throw new Error(`Expect resource operation to be 'destory' but instead received plan: \n ${JSON.stringify(plan, null, 2)}`)
      }

      await this.apply({
        planId: plan.planId
      });
    }

    // Validate that the destroy was successful
    for (const config of configs) {
      const validationPlan = await this.plan({
        desired: config,
        isStateful: true,
        state: undefined
      })
      if (validationPlan.operation !== ResourceOperation.CREATE) {
        throw new Error(`Resource was not successfully destroyed.
Validation plan shows:
${JSON.stringify(validationPlan, null, 2)}
        `);
      }
    }

    if (options?.validateDestroy) {
      await options.validateDestroy(plans);
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

  async import(data: ImportRequestData): Promise<ImportResponseData> {
    return CodifyTestUtils.sendMessageAndAwaitResponse(this.childProcess, {
      cmd: 'import',
      data,
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
