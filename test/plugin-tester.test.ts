import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester } from '../src/index.js';
import path from 'node:path';
import { ResourceOperation } from 'codify-schemas/src/types/index.js';
import deepMatches from 'lodash.matches';
import differenceWith from 'lodash.differencewith';


describe('Plugin tester integration tests', () => {
  let plugin: PluginTester;
  beforeEach(() => {
    plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));
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
        type: 'test',
        propA: 'a',
        propB: 2,
        propC: 'c',
      }]
    })

    expect(result.resourceValidations).toMatchObject([{
      isValid: true,
    }])
  })

  it('Can generate a plan', async () => {
    const result = await plugin.plan({
      desired: {
        type: 'test',
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
      desired: {
        type: 'test',
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
      desired: {
        type: 'test',
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
      desired: {
        type: 'test',
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
    await plugin.fullTest([{
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
    await plugin.fullTest([{
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
    await plugin.fullTest([{
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
    await plugin.fullTest([{
      type: 'test2',
      propB: ['second', 'first'],
      propA: 'a',
    }], {
      skipUninstall: true,
    })
  })

  it('Has helpers that can uninstall a resource', async () => {
    // No expect needed here. This passes if it doesn't throw.
    await plugin.uninstall([{
      type: 'test-uninstall',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }]);
  })

  it('Has helpers that can uninstall a resource (errors out when unsuccessful)', async () => {
    // const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));
    //
    // // No expect needed here. This passes if it doesn't throw.
    // await expect(async () => plugin.uninstall([{
    //   type: 'test',
    //   propA: 'a',
    //   propB: 10,
    //   propC: 'c',
    // }])).rejects.toThrowError();
  })


  it('Can test modify', { timeout: 50000000 }, async () => {
    await expect(() => plugin.fullTest([{
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

  it('Will call destory with the correct parameters (modify)', { timeout: 50000000 }, async () => {
//     const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));
//
//     await expect(async () => await plugin.fullTest([{
//       type: 'test-modify',
//       propA: 'a',
//       propB: 10,
//     }], {
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
  })

  it('Works when uninstalling two resources', async () => {
    await plugin.fullTest([{
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
  })

  it('Can uninstall two resources with the same type', async () => {
    await plugin.fullTest([{
      type: 'test-destroy',
      propA: 'a',
      propB: 10,
    }, {
      type: 'test-destroy',
      propA: 'a',
      propB: 20,
    }], {
      validateDestroy(plan) {
        expect(plan.length).to.eq(2);
        expect(plan[0]).toMatchObject({
          operation: 'destroy',
          resourceType: 'test-destroy',
        })
        expect(plan[1]).toMatchObject({
          operation: 'destroy',
          resourceType: 'test-destroy',
        })
      }
    });
  })

})
