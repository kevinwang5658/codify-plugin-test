import { describe, expect, it } from 'vitest';
import { PluginTester } from '../src/plugin-tester.js';
import path from 'node:path';
import { ResourceOperation } from 'codify-schemas/src/types/index.js';
import { ParameterOperation } from 'codify-schemas';

describe('Plugin tester integration tests', () => {
  it('Can instantiate a plugin', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    expect(plugin.childProcess.pid).to.not.be.undefined;
    expect(plugin.childProcess.stdout).to.not.be.undefined;
    expect(plugin.childProcess.stderr).to.not.be.undefined;
    expect(plugin.childProcess.channel).to.not.be.undefined;

    await plugin.initialize({});
  })

  it('Can validate a config', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    const result = await plugin.validate({
      configs: [{
        type: 'test',
        propA: 'a',
        propB: 2,
        propC: 'c',
      }]
    })

    expect(result.validationResults).toMatchObject([{
      isValid: true,
    }])
  })

  it('Can generate a plan', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    const result = await plugin.plan({
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    })

    expect(result).toMatchObject({
      planId: expect.any(String),
      operation: ResourceOperation.NOOP,
      resourceType: 'test',
    })
  })

  it('Can generate a plan', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    const result = await plugin.plan({
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    })

    expect(result).toMatchObject({
      planId: expect.any(String),
      operation: ResourceOperation.NOOP,
      resourceType: 'test',
    })
  })

  it('Can apply a plan', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    const plan = await plugin.plan({
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    })

    // No expect needed here. This passes if it doesn't throw.
    await plugin.apply({ planId: plan.planId })
  })

  it('Handles errors that are thrown', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    expect(async () => plugin.plan({
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
      propD: 'any'
    })).rejects.toThrowError(new Error('Prop D is included'));
  })

  it('Has helpers that can test a resource', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

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
    }]);
  })

  it('Has helpers that can uninstall a resource', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    // No expect needed here. This passes if it doesn't throw.
    await plugin.uninstall([{
      type: 'test-uninstall',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }]);
  })

  it('Has helpers that can uninstall a resource (errors out when unsuccessful)', async () => {
    const plugin = new PluginTester(path.join(__dirname, './test-plugin.ts'));

    // No expect needed here. This passes if it doesn't throw.
    expect(async () => plugin.uninstall([{
      type: 'test',
      propA: 'a',
      propB: 10,
      propC: 'c',
    }])).rejects.toThrowError();
  })
})
