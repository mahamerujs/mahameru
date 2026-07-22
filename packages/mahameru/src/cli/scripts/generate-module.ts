import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ora from 'ora';
import pc from 'picocolors';

import { exists } from '../../helpers';
import { ModuleExits } from '../../errors/module-exists';
import { toCamelCase, toPascalCase, toTitleCase } from '../../utils/common';

export default async function generateModule(rootPath: string, name: string) {
  const spinner = ora('Generating `' + name + '` module...').start();

  try {
    const templateDirPath = join(rootPath, 'node_modules', 'mahameru', 'cli', 'templates');
    const modulePath = join(rootPath, 'src', 'modules', name);
    const routePath = join(rootPath, 'src', 'routes', name);
    const routeParamIdPath = join(rootPath, 'src', 'routes', name, '[id]');
    const routeExists = await exists(routePath);
    const moduleExists = await exists(modulePath);

    if (moduleExists) throw new ModuleExits(name, modulePath);

    if (routeExists) throw new ModuleExits(name, routePath);

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

    // const generator = new Generator({
    //     modulesDir: 'modules',
    //     appPath: join(rootPath, '.mahameru'),
    //     dev: true,
    //     debug: true,
    //     outputTypesPath: join(rootPath, '.types'),
    //     rootPath,
    //     routesDir: 'routes',
    //     sourceDirPath: join(rootPath, 'src')
    // });

    // await generator.start();

    spinner.succeed(`✅ ${pc.green('Module `' + name + '` generated successfully')}`);
  } catch (error) {
    if (error instanceof ModuleExits) {
      spinner.fail(`⚠️ ${pc.red(error.message)}`);
    } else {
      spinner.fail(`⚠️ ${pc.red('Error generating module')}`);
      console.error(error);
    }

    process.exit(1);
  }
}
