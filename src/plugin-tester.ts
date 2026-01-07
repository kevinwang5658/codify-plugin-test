import chalk from 'chalk';
import {
  ImportResponseData, OS,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
} from 'codify-schemas';
import unionBy from 'lodash.unionby';

import { PluginProcess } from './plugin-process.js';
import { getPlatformOs, splitUserConfig } from './utils.js';
import os from 'node:os';

export class PluginTester {
  static async fullTest(
    pluginPath: string,
    configs: ResourceConfig[],
    options?: {
      skipUninstall?: boolean,
      skipImport?: boolean,
      validatePlan?: (plans: PlanResponseData[]) => Promise<void> | void
      validateApply?: (plans: PlanResponseData[]) => Promise<void> | void,
      validateDestroy?: (plans: PlanResponseData[]) => Promise<void> | void,
      validateImport?: (importResults: (ImportResponseData['result'][0])[]) => Promise<void> | void,
      testModify?: {
        modifiedConfigs: ResourceConfig[],
        validateModify?: (plans: PlanResponseData[]) => Promise<void> | void,
      }
    }): Promise<void> {
    configs = configs.filter((c) => !c.os || c.os.includes(getPlatformOs()));
    const ids = configs
      .map((c) => `${c.type}${c.name ? `.${c.name}` : ''}`)
      .join(', ')
    console.info(chalk.cyan(`Starting full test of [ ${ids} ]...`));


    const {
      skipUninstall = false,
    } = options ?? {}


    const plugin = new PluginProcess(pluginPath);
    try {
      console.info(chalk.cyan('Testing initialization...'))
      const initializeResult = await plugin.initialize();

      const unsupportedConfigs = configs.filter((c) =>
        !initializeResult.resourceDefinitions.some((rd) => rd.type === c.type)
      )
      if (unsupportedConfigs.length > 0) {
        throw new Error(`The plugin does not support the following configs supplied:\n ${JSON.stringify(unsupportedConfigs, null, 2)}\n Initialize result: ${JSON.stringify(initializeResult)}`)
      }

      // configs = configs.filter((c) => initializeResult.resourceDefinitions.find((rd) => rd.type === c.type)?.operatingSystems?.includes(os.platform() as OS));

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

      console.info(chalk.cyan('Testing plan...'))
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

      if (options?.validatePlan) {
        await options.validatePlan(plans);
      }

      console.info(chalk.cyan('Testing apply...'))
      for (const plan of plans) {
        await plugin.apply({
          planId: plan.planId
        });
      }

      if (options?.validateApply) {
        await options.validateApply(plans);
      }
    } finally {
      plugin.kill();
    }

    if (!options?.skipImport) {
      const importPlugin = new PluginProcess(pluginPath);
      try {
        await importPlugin.initialize();
        console.info(chalk.cyan('Testing import...'))

        const importResults = [];
        for (const config of configs) {
          const { coreParameters, parameters } = splitUserConfig(config);

          const importResult = await importPlugin.import({ core: coreParameters, parameters })
          importResults.push(importResult);
        }

        if (options?.validateImport) {
          await options.validateImport(importResults.map((r) => r.result[0]));
        }
      } finally {
        importPlugin.kill();
      }
    }

    if (options?.testModify) {
      const modifyPlugin = new PluginProcess(pluginPath);

      try {
        await modifyPlugin.initialize();
        console.info(chalk.cyan('Testing modify...'))

        const modifyPlans = [];
        for (const config of options.testModify.modifiedConfigs) {
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

        for (const plan of modifyPlans) {
          await modifyPlugin.apply({
            planId: plan.planId
          });
        }

        if (options.testModify.validateModify) {
          await options.testModify.validateModify(modifyPlans);
        }
      } finally {
        modifyPlugin.kill();
      }
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
      console.info(chalk.cyan('Testing initialization...'))
      const initializeResult = await plugin.initialize();

      const unsupportedConfigs = configs.filter((c) =>
        !initializeResult.resourceDefinitions.some((rd) => rd.type === c.type)
      )
      if (unsupportedConfigs.length > 0) {
        throw new Error(`The plugin does not support the following configs supplied:\n ${JSON.stringify(unsupportedConfigs, null, 2)}\n Initialize result: ${JSON.stringify(initializeResult)}`)
      }

      // configs = configs.filter((c) => initializeResult.resourceDefinitions.find((rd) => rd.type === c.type)?.operatingSystems?.includes(os.platform() as OS));

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

      console.info(chalk.cyan('Testing plan...'))
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

      console.info(chalk.cyan('Testing apply...'))
      for (const plan of plans) {
        await plugin.apply({
          planId: plan.planId
        });
      }
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

