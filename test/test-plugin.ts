import { CreatePlan, DestroyPlan, Plugin, Resource, ResourceSettings, runPlugin } from 'codify-plugin-lib';
import { StringIndexedObject } from 'codify-schemas';

export interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC: string;
}

export interface TestConfig2 extends StringIndexedObject {
  propA: string;
  propB: string[];
}


export class TestResource extends Resource<TestConfig> {
  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'test'
    };
  }

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

  async create(plan: CreatePlan<TestConfig>): Promise<void> {
  }

  async destroy(plan: DestroyPlan<TestConfig>): Promise<void> {
  }
}

export class TestResource2 extends Resource<TestConfig2> {
  getSettings(): ResourceSettings<TestConfig2> {
    return {
      id: 'test2',
      parameterSettings: {
        propB: { type: 'array' }
      }
    };
  }

  async refresh(parameters: Partial<TestConfig2>): Promise<Partial<TestConfig2> | null> {
    if (parameters.propD) {
      throw new Error('Prop D is included');
    }

    return {
      propA: 'a',
      propB: ['first', 'second', 'third']
    };
  }

  async create(plan: CreatePlan<TestConfig2>): Promise<void> {
  }

  async destroy(plan: DestroyPlan<TestConfig2>): Promise<void> {
  }
}

export class TestUninstallResource extends Resource<TestConfig> {
  first = true;
  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'test-uninstall'
    }
  }

  async create(plan: CreatePlan<TestConfig>): Promise<void> {
  }

  async destroy(plan: DestroyPlan<TestConfig>): Promise<void> {
  }

  async refresh(parameters: Partial<TestConfig>): Promise<Array<Partial<TestConfig>> | Partial<TestConfig> | null> {
    if (this.first) {
      this.first = false;
      return parameters;
    }

    return null;
  }
}

runPlugin(Plugin.create(
  'default',
  [
    new TestResource(),
    new TestResource2(),
    new TestUninstallResource()
  ]
));
