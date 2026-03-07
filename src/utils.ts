import { ResourceConfig, ResourceOs, StringIndexedObject } from '@codifycli/schemas';
import os from 'node:os';

export function splitUserConfig<T extends StringIndexedObject>(
  config: ResourceConfig & T
): { parameters: T; coreParameters: ResourceConfig } {
  const coreParameters = {
    type: config.type,
    ...(config.name ? { name: config.name } : {}),
    ...(config.dependsOn ? { dependsOn: config.dependsOn } : {}),
    ...(config.os ? { os: config.os } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type, name, dependsOn, os, ...parameters } = config;

  return {
    parameters: parameters as T,
    coreParameters,
  };
}

export function getPlatformOs(): ResourceOs{
  const currOs = os.platform();
  switch (currOs) {
    case 'darwin': {
      return ResourceOs.MACOS;
    }

    case 'linux': {
      return ResourceOs.LINUX;
    }

    case 'win32': {
      return ResourceOs.WINDOWS;
    }

    default: {
      throw new Error(`Unsupported OS: ${currOs}`);
    }
  }
}
