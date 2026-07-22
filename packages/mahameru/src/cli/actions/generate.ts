import prompts from 'prompts';
import { printCliBanner } from '../../utils/printCliBanner';
import { clearScreen, toTitleCase } from '../../utils/common';
import { KNOWN_PLUGINS } from '../../constants';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { createLogger } from '@mahameru/diatrema';

const logger = createLogger('Mahameru', true);

export default function generate({ rootPath, version }: { rootPath: string; version: string }) {
  return async function () {
    clearScreen();
    printCliBanner(version);
    const knownPluginsPaths = KNOWN_PLUGINS.map((plugin) => join(rootPath, 'node_modules', plugin));
    const availablePluginsPaths = knownPluginsPaths.filter((pluginPath) => existsSync(pluginPath));

    if (availablePluginsPaths.length === 0) {
      logger.info('No plugins available for generation');

      process.exit(0);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins: { name: string; description: string; version: string; features: any[] }[] = [];

    for (const pluginPath of availablePluginsPaths) {
      const pluginPackageJson = JSON.parse(
        await readFile(join(pluginPath, 'package.json'), 'utf8'),
      );
      const res = await readdir(join(pluginPath, 'features'), { withFileTypes: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plugin: { name: string; description: string; version: string; features: any[] } = {
        name: pluginPackageJson.name,
        description: pluginPackageJson.description,
        version: pluginPackageJson.version,
        features: [],
      };

      for (const dirent of res) {
        if (dirent.isDirectory() || !dirent.name.endsWith('.js')) continue;

        const module = await import(pathToFileURL(join(pluginPath, 'features', dirent.name)).href);

        if (!module.default) continue;

        plugin.features.push({
          name: dirent.name.replace('.js', ''),
          types: module.default,
        });
      }

      plugins.push(plugin);
    }

    const pluginResponse = await prompts({
      type: 'select',
      name: 'pluginName',
      message: 'Select plugin',
      choices: plugins.map((plugin) => ({
        title: plugin.name,
        description: `${plugin.description} v${plugin.version}`,
        value: plugin.name,
      })),
      initial: 0,
    });

    const { pluginName } = pluginResponse;
    const plugin = plugins.find((plugin) => plugin.name === pluginName)!;

    const featureResponse = await prompts({
      type: 'select',
      name: 'featureName',
      message: 'Select feature',
      choices: plugin.features.map((feature) => ({
        title: toTitleCase(feature.name),
        description: feature.description,
        value: feature.name,
      })),
      initial: 0,
    });

    const { featureName } = featureResponse;
    const feature = plugin.features.find((feature) => feature.name === featureName)!;

    const typeResponse = await prompts({
      type: 'select',
      name: 'typeName',
      message: 'Select type',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      choices: feature.types.map((type: any) => ({
        title: toTitleCase(type.name),
        description: type.description,
        value: type.name,
      })),
      initial: 0,
    });

    const { typeName } = typeResponse;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const type = feature.types.find((type: any) => type.name === typeName)!;

    const dataReponse = await prompts({
      type: 'text',
      name: type.promptsData.name,
      message: type.promptsData.message,
      initial: type.promptsData.initial,
      validate: type.promptsData.validate,
      format: type.promptsData.format,
    });

    const { [type.promptsData.name]: dataName } = dataReponse;

    const shortName = plugin.name.split('/').pop()!;
    await type.action(rootPath, dataName, join(rootPath, '.types', shortName));
  };
}
