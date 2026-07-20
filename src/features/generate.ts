import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MagmaGenerator } from "..";

const exe = async (rootPath: string, name: string, outputTypesDirPath: string) => {
    const templateDirPath = join(rootPath, 'node_modules', '@mahameru/magma', 'templates');
    const modulePath = join(rootPath, 'src', 'modules', name);
    const routePath = join(rootPath, 'src', 'routes', name);
    const routeParamIdPath = join(rootPath, 'src', 'routes', name, '[id]');

    if (existsSync(modulePath))
        throw new Error(`Module ${name} already exists on path ${modulePath}`);

    if (existsSync(routePath))
        throw new Error(`Route ${name} already exists on path ${routePath}`);

    let serviceTemplateString = await readFile(join(templateDirPath, 'service.txt'), 'utf8') as string;
    const pacalName = toPascalCase(name);
    const camelName = toCamelCase(name);
    const titleName = toTitleCase(name);

    serviceTemplateString = serviceTemplateString
        .replace(/{{namePascalCase}}/g, pacalName)
        .replace(/{{nameCamelCase}}/g, camelName)
        .replace(/{{nameTitleCase}}/g, titleName);

    let controllerTemplateString = await readFile(join(templateDirPath, 'controller.txt'), 'utf8') as string;
    controllerTemplateString = controllerTemplateString
        .replace(/{{namePascalCase}}/g, pacalName)
        .replace(/{{nameCamelCase}}/g, camelName)
        .replace(/{{nameTitleCase}}/g, titleName);

    let routeIndexTemplateString = await readFile(join(templateDirPath, 'route-index.txt'), 'utf8') as string;
    routeIndexTemplateString = routeIndexTemplateString
        .replace(/{{namePascalCase}}/g, pacalName)
        .replace(/{{nameCamelCase}}/g, camelName)
        .replace(/{{nameTitleCase}}/g, titleName);

    let routeParamIdTemplateString = await readFile(join(templateDirPath, 'route-param-id.txt'), 'utf8') as string;
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

    const magmaGenerator = new MagmaGenerator({ debug: true });
    magmaGenerator.outputTypesDirPath = outputTypesDirPath;
    magmaGenerator.sourceDirPath = join(rootPath, 'src');
    await magmaGenerator.generate();
}

export default [
    {
        name: 'module',
        description: 'Generate a new module',
        action: exe,
        promptsData: {
            name: 'module-name',
            message: 'Enter a module name',
            initial: 'my-new-module',
            validate: (value: string) => {
                if (value.includes(' '))
                    return 'Module name cannot contain spaces';

                return true;
            },
            format: (value: string) => value.trim().toLowerCase()
        }
    }
]

function toCamelCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
        .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

function toPascalCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
        .replace(/^[a-z]/, (char) => char.toUpperCase());
}

function toTitleCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
