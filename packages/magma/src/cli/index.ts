#!/usr/bin/env node
/* eslint-disable no-console */

import { select, isCancel, cancel, text, outro, intro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { MAGMA_TITLE } from '../constants';
import { MagmaGenerator } from '..';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { toKebabCase, toPascalCase, toTitleCase } from '../helpers';
import { toCamelCase } from '../helper';

const rootPath = process.env.INIT_CWD || process.cwd();
const outputTypesDirPath = join(rootPath, '.types', 'magma');
const logger = {
  info: (...data: unknown[]) => console.log(...data),
  error: (...data: unknown[]) => console.error(...data),
};

(async () => {
  try {
    process.stdout.write('\u001b[2J\u001b[0;0H\u001b[3J');

    try {
      const packageJson = JSON.parse(
        await readFile(join(rootPath, 'node_modules', '@mahameru/magma', 'package.json'), 'utf-8'),
      ) as unknown as Record<string, string>;
      intro(`${MAGMA_TITLE} CLI ${pc.dim(`v${packageJson.version}`)}`);
    } catch {
      intro(`${MAGMA_TITLE} CLI`);
    }

    const type = await select({
      message: 'Pick what you want to generate',
      options: [
        { value: 'module', label: 'Module + Routes' },
        { value: 'route', label: 'Route Only' },
      ],
    });

    if (isCancel(type)) {
      cancel('Operation cancelled.');
      process.exit(0);
    }

    let name = await text({
      message: `What's the name of the ${type}?`,
      placeholder: 'Not sure',
      initialValue: '',
      defaultValue: 'user',
      validate(value) {
        if (value && value.length === 0) return `Name is required!`;
      },
    });

    if (isCancel(name)) {
      cancel('Operation cancelled.');

      process.exit(0);
    }

    name = toKebabCase(name);

    const s = spinner();

    if (type === 'module') {
      s.start('Generating module and routes ${name}...');
      await generateModule(name);
      s.stop(`Module and routes ${name} generated successfully!`);
    }

    if (type === 'route') {
      s.start(`Generating routes of ${name}...`);
      await generateRoute(name);
      s.stop(`Routes of ${name} generated successfully!`);
    }

    outro(`You're all set!`);

    process.exit(0);
  } catch (error) {
    logger.error('Error', error);

    process.exit(1);
  }
})();

async function generateModule(name: string) {
  const templateDirPath = join(rootPath, 'node_modules', '@mahameru/magma', 'templates');
  const modulePath = join(rootPath, 'src', 'modules', name);
  const routePath = join(rootPath, 'src', 'routes', name);
  const routeParamIdPath = join(rootPath, 'src', 'routes', name, '[id]');

  if (existsSync(modulePath))
    throw new Error(`Module ${name} already exists on path ${modulePath}`);

  if (existsSync(routePath)) throw new Error(`Route ${name} already exists on path ${routePath}`);

  let serviceTemplateString = (await readFile(
    join(templateDirPath, 'service.txt'),
    'utf8',
  )) as string;
  const pacalName = toPascalCase(name);
  const camelName = toCamelCase(name);
  const titleName = toTitleCase(name);

  serviceTemplateString = serviceTemplateString
    .replace(/{{namePascalCase}}/g, pacalName)
    .replace(/{{nameCamelCase}}/g, camelName)
    .replace(/{{nameTitleCase}}/g, titleName);

  let controllerTemplateString = (await readFile(
    join(templateDirPath, 'controller.txt'),
    'utf8',
  )) as string;
  controllerTemplateString = controllerTemplateString
    .replace(/{{namePascalCase}}/g, pacalName)
    .replace(/{{nameCamelCase}}/g, camelName)
    .replace(/{{nameTitleCase}}/g, titleName);

  let routeIndexTemplateString = (await readFile(
    join(templateDirPath, 'route-index.txt'),
    'utf8',
  )) as string;
  routeIndexTemplateString = routeIndexTemplateString
    .replace(/{{namePascalCase}}/g, pacalName)
    .replace(/{{nameCamelCase}}/g, camelName)
    .replace(/{{nameTitleCase}}/g, titleName);

  let routeParamIdTemplateString = (await readFile(
    join(templateDirPath, 'route-param-id.txt'),
    'utf8',
  )) as string;
  routeParamIdTemplateString = routeParamIdTemplateString
    .replace(/{{namePascalCase}}/g, pacalName)
    .replace(/{{nameCamelCase}}/g, camelName)
    .replace(/{{nameTitleCase}}/g, titleName);

  await mkdir(modulePath, { recursive: true });
  await mkdir(routePath, { recursive: true });
  await mkdir(routeParamIdPath, { recursive: true });

  await writeFile(join(modulePath, 'service.ts'), serviceTemplateString, 'utf8');
  await writeFile(join(modulePath, 'controller.ts'), controllerTemplateString, 'utf8');
  await writeFile(join(routePath, 'route.ts'), routeIndexTemplateString, 'utf8');
  await writeFile(join(routeParamIdPath, 'route.ts'), routeParamIdTemplateString, 'utf8');

  const magmaGenerator = new MagmaGenerator();
  magmaGenerator.outputTypesDirPath = outputTypesDirPath;
  magmaGenerator.sourceDirPath = join(rootPath, 'src');
  await magmaGenerator.generate();
}

async function generateRoute(_name: string) {
  logger.info(`...`);
}
