import { Plan, Plugin, Resource, ValidationResult, runPlugin } from 'codify-plugin-lib';
import { StringIndexedObject } from 'codify-schemas';

export interface TestConfig extends StringIndexedObject{
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

  async applyCreate(plan: Plan<TestConfig>): Promise<void> {}

  async applyDestroy(plan: Plan<TestConfig>): Promise<void> {}

  async refresh(keys: Map<string, unknown>): Promise<Partial<TestConfig> | null> {
    if (keys.has('propD')) {
      throw new Error('Prop D is included');
    }

    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }

  async validateResource(config: unknown): Promise<ValidationResult> {
    return {
      isValid: true
    }
  }
}

function buildPlugin(): Plugin {
  const resourceMap = new Map();

  const testResource = new TestResource();
  resourceMap.set(testResource.typeId, testResource);

  return new Plugin('test', resourceMap);
}

runPlugin(buildPlugin());
