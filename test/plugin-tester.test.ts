import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester } from '../src/index.js';
import path from 'node:path';
import { ResourceOperation } from 'codify-schemas/src/types/index.js';
import deepMatches from 'lodash.matches';
import differenceWith from 'lodash.differencewith';
import { PluginProcess } from '../src/plugin-process';
import * as fs from 'node:fs';

const pluginPath = path.join(__dirname, './test-plugin.ts');

describe('Plugin tester integration tests', () => {
  let plugin: PluginProcess;
  beforeEach(() => {
    plugin = new PluginProcess(path.join(__dirname, './test-plugin.ts'));
  })

  afterEach(() => {
    plugin.kill();
  })

  it('Can instantiate a plugin', async () => {
    expect(plugin.childProcess.pid).to.not.be.undefined;
    expect(plugin.childProcess.stdout).to.not.be.undefined;
    expect(plugin.childProcess.stderr).to.not.be.undefined;
    expect(plugin.childProcess.channel).to.not.be.undefined;

    const result = await plugin.initialize();
    expect(result).toMatchObject({
      resourceDefinitions: [
        { dependencies: [], type: 'test' },
        { dependencies: [], type: 'test2' },
        { dependencies: [], type: 'test-uninstall' },
        { dependencies: [], type: 'test-modify' },
        { dependencies: [], type: 'test-destroy' },
        { dependencies: [], type: 'test-destroy-2' }
      ]
    })
  })

  it('Can validate a config', async () => {
    const result = await plugin.validate({
      configs: [{
        core: {
          type: 'test',
        },
        parameters: {
          propA: 'a',
          propB: 2,
          propC: 'c',
        }
      }]
    })

    expect(result.resourceValidations).toMatchObject([{
      isValid: true,
    }])
  })

  it('Can generate a plan', async () => {
    const result = await plugin.plan({
      core: {
        type: 'test',
      },
      desired: {
        propA: 'a',
        propB: 10,
        propC: 'c',
      },
      state: undefined,
      isStateful: false,
    })

    expect(result).toMatchObject({
      planId: expect.any(String),
      operation: ResourceOperation.NOOP,
      resourceType: 'test',
    })
  })

  it('Can generate a plan', async () => {
    const result = await plugin.plan({
      core: {
        type: 'test',
      },
      desired: {
        propA: 'a',
        propB: 10,
        propC: 'c',
      },
      state: undefined,
      isStateful: false,
    })

    expect(result).toMatchObject({
      planId: expect.any(String),
      operation: ResourceOperation.NOOP,
      resourceType: 'test',
    })
  })

  it('Can apply a plan', async () => {
    const plan = await plugin.plan({
      core: {
        type: 'test',
      },
      desired: {
        propA: 'a',
        propB: 10,
        propC: 'c',
      },
      state: undefined,
      isStateful: false,
    })

    // No expect needed here. This passes if it doesn't throw.
    await plugin.apply({ planId: plan.planId })
  })

  it('Handles errors that are thrown', async () => {
    expect(async () => plugin.plan({
      core: {
        type: 'test',
      },
      desired: {
        propA: 'a',
        propB: 10,
        propC: 'c',
        propD: 'any'
      },
      state: undefined,
      isStateful: false,
    })).rejects.toThrowError(new Error('Prop D is included'));
  })

  it('Has helpers that can test a resource', async () => {
    // No expect needed here. This passes if it doesn't throw.
    await PluginTester.fullTest(pluginPath, [{
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }, {
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }], {
      skipUninstall: true,
    });
  })

  it('Full test supports plan assertions to ensure the generated plan is correct', async () => {
    // No expect needed here. This passes if it doesn't throw.
    await PluginTester.fullTest(pluginPath, [{
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }, {
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }], {
      skipUninstall: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({
          planId: expect.any(String),
          operation: ResourceOperation.NOOP,
          resourceType: 'test',
        });

        expect(plans[1]).toMatchObject({
          planId: expect.any(String),
          operation: ResourceOperation.NOOP,
          resourceType: 'test',
        });
      }
    })
  })

  it('Full test supports plan assertions to ensure the generated plan is correct (2)', async () => {
    // No expect needed here. This passes if it doesn't throw.
    await PluginTester.fullTest(pluginPath, [{
      type: 'test',
      propA: 'a',
      propB: 10,
    }], {
      skipUninstall: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({
          planId: expect.any(String),
          operation: ResourceOperation.NOOP,
          resourceType: 'test',
        });
      }
    })
  })

  it('Full test supports plan assertions to ensure the generated plan is correct (3)', async () => {
    console.log(differenceWith(['b', 'a'], ['a', 'b', 'c'], (a, b) => deepMatches(a)(b)).length === 0);

    // No expect needed here. This passes if it doesn't throw.
    await PluginTester.fullTest(pluginPath, [{
      type: 'test2',
      propB: ['second', 'first'],
      propA: 'a',
    }], {
      skipUninstall: true,
    })
  })

  it('Has helpers that can uninstall a resource', async () => {
    // No expect needed here. This passes if it doesn't throw.
    await PluginTester.uninstall(pluginPath, [{
      type: 'test-uninstall',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }]);
  })

  it('Has helpers that can uninstall a resource (errors out when unsuccessful)', async () => {
    // No expect needed here. This passes if it doesn't throw.
    await expect(async () => PluginTester.uninstall(pluginPath, [{
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }])).rejects.toThrowError();
  })


  it('Can test modify', { timeout: 50000000 }, async () => {
    await expect(() => PluginTester.fullTest(pluginPath, [{
      type: 'test-modify',
      propA: 'a',
      propB: 10,
    }], {
      skipUninstall: true,
      testModify: {
        modifiedConfigs: [{
          type: 'test-modify',
          propA: 'Modify',
          propB: 10,
        }]
      }
    })).rejects.toThrowError();
  })

//   it('Will call destory with the correct parameters (modify)', { timeout: 50000000 }, async () => {
//     await expect(async () => await PluginTester.fullTest(pluginPath, [{
//       type: 'test-modify',
//       propA: 'a',
//       propB: 10,
//     }], {
//       skipUninstall: true,
//       testModify: {
//         modifiedConfigs: [{
//           type: 'test-modify',
//           propA: 'Modify',
//           propB: 10,
//         }]
//       }
//     })).rejects.toThrow(
// `
//   "parameters": [
//     {
//       "name": "propA",
//       "previousValue": "Modify__",
//       "newValue": "Modify",
//       "operation": "modify"
//     },
//     {
//       "name": "propB",
//       "previousValue": "10",
//       "newValue": "10",
//       "operation": "noop"
//     }
//   ]
// }
// `
//     )
//   })

  it('Works when uninstalling two resources', { timeout: 300000 }, async () => {
    try {
      await PluginTester.fullTest(pluginPath, [{
        type: 'test-destroy',
        propA: 'a',
        propB: 10,
      }, {
        type: 'test-destroy-2',
        propA: 'a',
        propB: 20,
      }], {
        validateDestroy(plan) {
          expect(plan.length).to.eq(2);
          expect(plan[0]).toMatchObject({
            operation: 'destroy',
            resourceType: 'test-destroy-2',
          })
          expect(plan[1]).toMatchObject({
            operation: 'destroy',
            resourceType: 'test-destroy',
          })
        }
      });
    } finally {
      try { fs.rmSync('test-destroy'); } catch (e) {}
      try { fs.rmSync('test-destroy-2') } catch (e) {}
    }
  })

  it('Can filter out unsupported configs based on OS', { timeout: 300000 }, async () => {
      await PluginTester.fullTest(pluginPath, [{
        type: 'windows-only',
      }], {
        validatePlan(plan) {
          expect(plan.length).to.eq(0);
        }
      });
  });



  // it('Can uninstall two resources with the same type', async () => {
  //   await plugin.fullTest([{
  //     type: 'test-destroy',
  //     propA: 'a',
  //     propB: 10,
  //   }, {
  //     type: 'test-destroy',
  //     propA: 'a',
  //     propB: 20,
  //   }], {
  //     validateDestroy(plan) {
  //       expect(plan.length).to.eq(2);
  //       expect(plan[0]).toMatchObject({
  //         operation: 'destroy',
  //         resourceType: 'test-destroy',
  //       })
  //       expect(plan[1]).toMatchObject({
  //         operation: 'destroy',
  //         resourceType: 'test-destroy',
  //       })
  //     }
  //   });
})
