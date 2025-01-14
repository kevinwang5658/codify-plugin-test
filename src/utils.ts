import { ResourceConfig, StringIndexedObject } from 'codify-schemas';

export function splitUserConfig<T extends StringIndexedObject>(
  config: ResourceConfig & T
): { parameters: T; coreParameters: ResourceConfig } {
  const coreParameters = {
    type: config.type,
    ...(config.name ? { name: config.name } : {}),
    ...(config.dependsOn ? { dependsOn: config.dependsOn } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type, name, dependsOn, ...parameters } = config;

  return {
    parameters: parameters as T,
    coreParameters,
  };
}
