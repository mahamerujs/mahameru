import { readdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { ModelGenerator } from "./model.generator.js"
import { existsSync } from "node:fs"
import { TORMDTOGenerator } from "typeorm-dto-generator"
import { toKebabCase } from "./helper.js"
import { parseArgs } from "node:util"

(async () => {
    try {
        const { values } = parseArgs({
            args: process.argv.slice(2),
            options: {
                'init-db': { type: 'boolean', default: false },
            }
        })

        if (values['init-db']) {
            const root = process.cwd()
            const srcPath = path.join(root, 'src')
            const databasesDir = path.join(root, 'src', 'databases')
            await generateEntitiesIndexFiles(databasesDir)
            await generateModels({
                srcPath,
                databasesDir
            })
            await generateDTO(srcPath, databasesDir)
        }
    } catch (error) {
        console.error(error)

        process.exit(1)
    }
})()

async function generateEntitiesIndexFiles(databasesDir: string) {
    const resultScanDir = await readdir(databasesDir)

    if (resultScanDir.length === 0)
        return

    for (const fileOrDirName of resultScanDir) {
        const fileOrDirPath = path.join(databasesDir, fileOrDirName)
        const fileStat = await stat(fileOrDirPath).catch(() => null)

        if (fileStat?.isFile())
            continue

        await generateEntitiesIndexFile(fileOrDirPath)
    }
}

async function generateEntitiesIndexFile(databaseDir: string) {
    const entitiesPath = path.join(databaseDir, 'entities');
    const indexFilePath = path.join(entitiesPath, 'index.ts')
    const resultScanEntities = await readdir(entitiesPath).catch(() => []);

    if (resultScanEntities.length === 0) return;

    const entities: { className: string; fileName: string }[] = [];

    for (const entityFile of resultScanEntities) {
        if (entityFile === 'index.ts' || entityFile === 'index.js' || !entityFile.endsWith('.entity.ts'))
            continue;

        const entityFilePath = path.join(entitiesPath, entityFile);
        const entityStat = await stat(entityFilePath).catch(() => null);

        if (!entityStat?.isFile()) continue;

        const fileUrl = pathToFileURL(entityFilePath).href;
        const module = await import(fileUrl);
        const exportNames = Object.keys(module);

        for (const exportName of exportNames) {
            const exportValue = module[exportName];

            if (isClass(exportValue)) {
                entities.push({
                    className: exportValue.name,
                    fileName: entityFile.replace(/\.ts$/, '.js')
                });
            }
        }
    }

    if (entities.length === 0) return;

    const importStatements = entities
        .map(e => `import { ${e.className} } from './${e.fileName}';`)
        .join('\n');

    const classNamesOnly = entities.map(e => e.className).join(', ');

    const contents = `${importStatements}

export const entities = [${entities.map(e => e.className).join(', ')}]

export { ${classNamesOnly} };
`;

    await writeFile(indexFilePath, contents, 'utf-8');
}

async function generateModels({ srcPath, databasesDir }: { srcPath: string; databasesDir: string }) {
    const resultScanDBDir = await readdir(databasesDir)

    if (resultScanDBDir.length === 0)
        return

    for (const fileOrDirName of resultScanDBDir) {
        const fileOrDirPath = path.join(databasesDir, fileOrDirName)
        const fileStat = await stat(fileOrDirPath).catch(() => null)

        if (fileStat?.isFile())
            continue

        const entitiesPath = path.join(databasesDir, fileOrDirName, 'entities')

        if (!existsSync(entitiesPath))
            continue

        const outputPath = path.join(srcPath, 'models', fileOrDirName)
        const dataSourceFilePath = path.join(databasesDir, fileOrDirName)

        const generator = new ModelGenerator({
            dbName: toKebabCase(fileOrDirName),
            srcPath,
            entitiesPath,
            outputPath,
            dataSourceFilePath,
            includeExtensionOnBareModuleImport: 'js',
            debug: true
        })

        generator.generate()
    }
}

async function generateDTO(srcPath: string, databasesDir: string) {
    const resultScanDir = await readdir(databasesDir)

    if (resultScanDir.length === 0)
        return

    for (const fileOrDirName of resultScanDir) {
        const fileOrDirPath = path.join(databasesDir, fileOrDirName)
        const fileStat = await stat(fileOrDirPath).catch(() => null)

        if (fileStat?.isFile())
            continue

        const dto = new TORMDTOGenerator({
            entityPaths: [path.join(fileOrDirPath, 'entities', '*.entity.ts')],
            dtoOutputDir: path.join(srcPath, 'types'),
            mapperOutputFile: path.join(srcPath, 'common', 'dto', fileOrDirName + '.dto-mapper.ts'),
            debug: true,
            includeExtensionOnImports: 'js'
        })

        await dto.run()
    }
}

function isClass(v: unknown): boolean {
    return typeof v === 'function' && /^\s*class\s+/.test(v.toString());
}