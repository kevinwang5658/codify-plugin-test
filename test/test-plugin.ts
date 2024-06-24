import { Plugin, Resource, runPlugin } from 'codify-plugin-lib';
import { StringIndexedObject } from 'codify-schemas';

export interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC: string;
}

export class TestResource extends Resource<TestConfig> {
  constructor() {
    super({
      type: 'test'
    });
  }

  async applyCreate(): Promise<void> {}

  async applyDestroy(): Promise<void> {}

  async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig> | null> {
    if (parameters.propD) {
      throw new Error('Prop D is included');
    }

    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }
}

export class TestUninstallResource extends Resource<TestConfig> {
  constructor() {
    super({
      type: 'test-uninstall'
    });
  }

  async applyCreate(): Promise<void> {}

  async applyDestroy(): Promise<void> {}

  async refresh(): Promise<Partial<TestConfig> | null> {
    return null;
  }
}

function buildPlugin(): Plugin {
  const resourceMap = new Map();

  const testResource = new TestResource();
  resourceMap.set(testResource.typeId, testResource);

  const testUninstallResource = new TestUninstallResource();
  resourceMap.set(testUninstallResource.typeId, testUninstallResource);

  return new Plugin('test', resourceMap);
}

runPlugin(buildPlugin());
