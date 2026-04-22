import {
  ImportResponseData,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
} from '@codifycli/schemas';
import chalk from 'chalk';
import unionBy from 'lodash.unionby';

import { PluginProcess } from './plugin-process.js';
import { getPlatformOs, splitUserConfig } from './utils.js';

export interface FullTestOptions {
  skipUninstall?: boolean,
  skipImport?: boolean,

  // Ensure these resources are installed before testing starts. Will install if missing, but never destroy after.
  prerequisites?: ResourceConfig[],

  validatePlan?: (plans: PlanResponseData[]) => Promise<void> | void
  validateApply?: (plans: PlanResponseData[]) => Promise<void> | void,
  validateDestroy?: (plans: PlanResponseData[]) => Promise<void> | void,
  validateImport?: (importResults: (ImportResponseData['result'][0])[]) => Promise<void> | void,
  testModify?: {
    modifiedConfigs: ResourceConfig[],
    validateModify?: (plans: PlanResponseData[]) => Promise<void> | void,
  }
}

export class PluginTester {
  static async fullTest(
    pluginPath: string,
    configs: ResourceConfig[],
    options?: FullTestOptions,
  ): Promise<void> {
    configs = configs.filter((c) => !c.os || c.os.includes(getPlatformOs()));
    const ids = configs
      .map((c) => `${c.type}${c.name ? `.${c.name}` : ''}`)
      .join(', ')
    console.info(chalk.cyan(`Starting full test of [ ${ids} ]...`));

    const { skipUninstall = false } = options ?? {}

    if (options?.prerequisites?.length) {
      await this.ensurePrerequisites(pluginPath, options.prerequisites);
    }

    const plugin = new PluginProcess(pluginPath);
    try {
      await this.initializeAndValidate(plugin, configs);

      console.info(chalk.cyan('Testing plan...'))
      const plans = await this.planConfigs(plugin, configs);

      if (options?.validatePlan) {
        await options.validatePlan(plans);
      }

      console.info(chalk.cyan('Testing apply...'))
      await this.applyPlans(plugin, plans);

      if (options?.validateApply) {
        await options.validateApply(plans);
      }
    } finally {
      plugin.kill();
    }

    if (!options?.skipImport) {
      await this.runImportPhase(pluginPath, configs, options?.validateImport);
    }

    if (options?.testModify) {
      await this.runModifyPhase(pluginPath, options.testModify);
    }

    if (!skipUninstall) {
      // We need to add unique names to multiple configs with the same type or else it breaks the unionBy below.
      const configsWithNames = this.addNamesToConfigs(configs);
      const modifiedConfigs = this.addNamesToConfigs(options?.testModify?.modifiedConfigs ?? [])

      const id = (config: ResourceConfig) => config.type + (config.name ? `.${config.name}` : '')

      const configsToDestroy = unionBy(modifiedConfigs, configsWithNames, id);
      await this.uninstall(pluginPath, configsToDestroy.toReversed(), options);
    }
  }

  static async install(pluginPath: string, configs: ResourceConfig[]) {
    const plugin = new PluginProcess(pluginPath);

    try {
      await this.initializeAndValidate(plugin, configs);

      console.info(chalk.cyan('Testing plan...'))
      const plans = await this.planConfigs(plugin, configs);

      console.info(chalk.cyan('Testing apply...'))
      await this.applyPlans(plugin, plans);
    } finally {
      plugin.kill();
    }
  }

  static async uninstall(pluginPath: string, configs: ResourceConfig[], options?: {
    validateDestroy?: (plans: PlanResponseData[]) => Promise<void> | void
  }) {
    const destroyPlugin = new PluginProcess(pluginPath);

    try {
      await destroyPlugin.initialize();
      console.info(chalk.cyan('Testing destroy...'))

      const plans = [];
      for (const config of configs) {
        const { coreParameters, parameters } = splitUserConfig(config);

        plans.push(await destroyPlugin.plan({
          core: coreParameters,
          isStateful: true,
          state: parameters,
          desired: undefined
        }))
      }

      for (const plan of plans) {
        if (plan.operation !== ResourceOperation.DESTROY && plan.operation !== ResourceOperation.NOOP) {
          throw new Error(`Expect resource operation to be 'destroy' but instead received plan: \n ${JSON.stringify(plans, null, 2)}`)
        }

        await destroyPlugin.apply({
          planId: plan.planId
        });
      }

      if (options?.validateDestroy) {
        await options.validateDestroy(plans);
      }
    } finally {
      destroyPlugin.kill();
    }
  }

  private static async ensurePrerequisites(pluginPath: string, prerequisites: ResourceConfig[]): Promise<void> {
    prerequisites = prerequisites.filter((c) => !c.os || c.os.includes(getPlatformOs()));
    if (prerequisites.length === 0) return;

    const ids = prerequisites.map((c) => `${c.type}${c.name ? `.${c.name}` : ''}`).join(', ');
    console.info(chalk.cyan(`Checking prerequisites [ ${ids} ]...`));

    const plugin = new PluginProcess(pluginPath);
    try {
      const initializeResult = await plugin.initialize();

      const unsupportedConfigs = prerequisites.filter((c) =>
        !initializeResult.resourceDefinitions.some((rd) => rd.type === c.type)
      )
      if (unsupportedConfigs.length > 0) {
        throw new Error(`The plugin does not support the following prerequisite configs:\n ${JSON.stringify(unsupportedConfigs, null, 2)}`)
      }

      const validate = await plugin.validate({
        configs: prerequisites.map((c) => {
          const { coreParameters, parameters } = splitUserConfig(c)
          return { core: coreParameters, parameters };
        })
      });

      const invalidConfigs = validate.resourceValidations.filter((v) => !v.isValid)
      if (invalidConfigs.length > 0) {
        console.error(chalk.red(`Prerequisites validation failed:\n ${JSON.stringify(invalidConfigs, null, 2)}`));
        throw new Error(`The following prerequisite configs did not validate:\n ${JSON.stringify(invalidConfigs, null, 2)}`)
      }

      for (const config of prerequisites) {
        const { coreParameters, parameters } = splitUserConfig(config);
        const plan = await plugin.plan({
          core: coreParameters,
          desired: parameters,
          isStateful: false,
          state: undefined,
        });

        const label = `${config.type}${config.name ? `.${config.name}` : ''}`;
        if (plan.operation === ResourceOperation.NOOP) {
          console.info(chalk.cyan(`Prerequisite already satisfied: ${label}`));
        } else {
          await plugin.apply({ planId: plan.planId });
          console.info(chalk.cyan(`Prerequisite installed: ${label}`));
        }
      }
    } finally {
      plugin.kill();
    }
  }

  private static async initializeAndValidate(plugin: PluginProcess, configs: ResourceConfig[]): Promise<void> {
    console.info(chalk.cyan('Testing initialization...'))
    const initializeResult = await plugin.initialize();

    const unsupportedConfigs = configs.filter((c) =>
      !initializeResult.resourceDefinitions.some((rd) => rd.type === c.type)
    )
    if (unsupportedConfigs.length > 0) {
      throw new Error(`The plugin does not support the following configs supplied:\n ${JSON.stringify(unsupportedConfigs, null, 2)}\n Initialize result: ${JSON.stringify(initializeResult)}`)
    }

    console.info(chalk.cyan('Testing validate...'))
    const validate = await plugin.validate({
      configs: configs.map((c) => {
        const { coreParameters, parameters } = splitUserConfig(c)
        return { core: coreParameters, parameters };
      })
    });

    const invalidConfigs = validate.resourceValidations.filter((v) => !v.isValid)
    if (invalidConfigs.length > 0) {
      throw new Error(`The following configs did not validate:\n ${JSON.stringify(invalidConfigs, null, 2)}`)
    }
  }

  private static async planConfigs(plugin: PluginProcess, configs: ResourceConfig[]): Promise<PlanResponseData[]> {
    const plans = [];
    for (const config of configs) {
      const { coreParameters, parameters } = splitUserConfig(config);
      plans.push(await plugin.plan({
        core: coreParameters,
        desired: parameters,
        isStateful: false,
        state: undefined,
      }));
    }

    return plans;
  }

  private static async applyPlans(plugin: PluginProcess, plans: PlanResponseData[]): Promise<void> {
    for (const plan of plans) {
      await plugin.apply({ planId: plan.planId });
    }
  }

  private static async runImportPhase(
    pluginPath: string,
    configs: ResourceConfig[],
    validateImport?: (importResults: (ImportResponseData['result'][0])[]) => Promise<void> | void,
  ): Promise<void> {
    const importPlugin = new PluginProcess(pluginPath);
    try {
      await importPlugin.initialize();
      console.info(chalk.cyan('Testing import...'))

      const importResults = [];
      for (const config of configs) {
        const { coreParameters, parameters } = splitUserConfig(config);
        importResults.push(await importPlugin.import({ core: coreParameters, parameters }));
      }

      if (validateImport) {
        await validateImport(importResults.map((r) => r.result[0]));
      }
    } finally {
      importPlugin.kill();
    }
  }

  private static async runModifyPhase(
    pluginPath: string,
    testModify: { modifiedConfigs: ResourceConfig[], validateModify?: (plans: PlanResponseData[]) => Promise<void> | void },
  ): Promise<void> {
    const modifyPlugin = new PluginProcess(pluginPath);

    try {
      await modifyPlugin.initialize();
      console.info(chalk.cyan('Testing modify...'))

      const modifyPlans = [];
      for (const config of testModify.modifiedConfigs) {
        const { coreParameters, parameters } = splitUserConfig(config);

        modifyPlans.push(await modifyPlugin.plan({
          core: coreParameters,
          desired: parameters,
          isStateful: false,
          state: undefined,
        }));
      }

      if (modifyPlans.some((p) => p.operation !== ResourceOperation.MODIFY)) {
        throw new Error(`Error while testing modify. Non-modify results were found in the plan:
${JSON.stringify(modifyPlans, null, 2)}`)
      }

      await this.applyPlans(modifyPlugin, modifyPlans);

      if (testModify.validateModify) {
        await testModify.validateModify(modifyPlans);
      }
    } finally {
      modifyPlugin.kill();
    }
  }

  private static addNamesToConfigs(configs: ResourceConfig[]): ResourceConfig[] {
    const configsWithNames = new Array<ResourceConfig>();

    const typeSet = new Set(configs.map((c) => c.type));
    for (const type of typeSet) {
      const sameTypeConfigs = configs.filter((c) => c.type === type);
      if (sameTypeConfigs.length > 1) {
        sameTypeConfigs.forEach((c, idx) => {
          c.name = c.name ?? idx.toString()
        });
      }

      configsWithNames.push(...sameTypeConfigs);
    }

    return configsWithNames;
  }
}

