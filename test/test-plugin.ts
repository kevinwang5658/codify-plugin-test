import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  ParameterChange,
  Plugin,
  Resource,
  ResourceSettings,
  runPlugin
} from 'codify-plugin-lib';
import { OS, StringIndexedObject } from 'codify-schemas';
import * as fs from 'node:fs';

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
      id: 'test',
      operatingSystems: [OS.Linux, OS.Darwin],
      allowMultiple: true,
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
      operatingSystems: [OS.Linux, OS.Darwin],
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
      id: 'test-uninstall',
      operatingSystems: [OS.Linux, OS.Darwin],
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

export class TestModifyResource extends Resource<TestConfig> {
  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'test-modify',
      operatingSystems: [OS.Linux, OS.Darwin],
      parameterSettings: {
        propA: { type: 'string', canModify: true },
        propB: { type: 'string', canModify: true },
        propC: { type: 'string', canModify: true }
      }
    }
  }

  async refresh(parameters: Partial<TestConfig>): Promise<Array<Partial<TestConfig>> | Partial<TestConfig> | null> {
    if (parameters === null) {
      return null;
    }

    if (parameters.propA === 'Modify') {
      parameters.propA = 'Modify__';
    }

    return parameters;
  }

  async modify(pc: ParameterChange<TestConfig>, plan: ModifyPlan<TestConfig>): Promise<void> {
    return super.modify(pc, plan);
  }

  async create(plan: CreatePlan<TestConfig>): Promise<void> {}

  async destroy(plan: DestroyPlan<TestConfig>): Promise<void> {}
}

export class TestDestroyResource extends Resource<TestConfig> {
  private name: string;

  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'test-destroy',
      operatingSystems: [OS.Linux, OS.Darwin],
    }
  }

  async refresh(parameters: Partial<TestConfig>): Promise<Array<Partial<TestConfig>> | Partial<TestConfig> | null> {
    return fs.existsSync(`/tmp/${this.getSettings().id}`) ? parameters : null;
  }

  async modify(pc: ParameterChange<TestConfig>, plan: ModifyPlan<TestConfig>): Promise<void> {
    return super.modify(pc, plan);
  }

  async create(plan: CreatePlan<TestConfig>): Promise<void> {
    if (!this.name && plan.coreParameters.name) {
      this.name = plan.coreParameters.name;
    }

    fs.writeFileSync(`/tmp/${this.getSettings().id}`, ' ');
  }

  async destroy(plan: DestroyPlan<TestConfig>): Promise<void> {
    fs.rmSync(`/tmp/${this.getSettings().id}`);
  }
}

export class WindowsOnlyResource extends Resource<TestConfig> {
  private name: string;

  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'windows-only',
      operatingSystems: [OS.Windows],
    }
  }

  async refresh(parameters: Partial<TestConfig>): Promise<Array<Partial<TestConfig>> | Partial<TestConfig> | null> {
    return {};
  }

  async modify(pc: ParameterChange<TestConfig>, plan: ModifyPlan<TestConfig>): Promise<void> {
    return super.modify(pc, plan);
  }

  async create(plan: CreatePlan<TestConfig>): Promise<void> {}

  async destroy(plan: DestroyPlan<TestConfig>): Promise<void> {}
}

export class TestDestroyResource2 extends TestDestroyResource {
  getSettings(): ResourceSettings<TestConfig> {
    return {
      id: 'test-destroy-2',
    }
  }
}

runPlugin(Plugin.create(
  'default',
  [
    new TestResource(),
    new TestResource2(),
    new TestUninstallResource(),
    new TestModifyResource(),
    new TestDestroyResource(),
    new TestDestroyResource2(),
    new WindowsOnlyResource(),
  ]
));
