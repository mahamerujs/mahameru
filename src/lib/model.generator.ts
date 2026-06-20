import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { isESModule } from '../constants.js'

type ModelGeneratorOptions = {
    dbName: string
    srcPath: string
    entitiesPath: string
    outputPath: string
    dataSourceFilePath: string
    includeExtensionOnBareModuleImport?: 'ts' | 'js'
    debug?: boolean
}

export class ModelGenerator {
    constructor(private options: ModelGeneratorOptions) {
        if (!existsSync(this.options.entitiesPath)) {
            throw new Error(`Entities folder not found: ${this.options.entitiesPath}`)
        }
    }

    generate() {
        const entityFiles = this.getEntityFiles()

        for (const entityFileName of entityFiles) {
            this.generateEntityModel(entityFileName)
        }

        this.createModelIndexFileTemplate()

        return
    }

    generateEntityModel(entityFileName: string) {
        const modelName = entityFileName.replace(/\.entity\.ts$/, '')
        const entityPath = path.join(this.options.entitiesPath, entityFileName)
        const modelPath = path.join(this.options.outputPath)

        if (!existsSync(entityPath))
            throw new Error(`Entity tidak ditemukan: ${entityPath}`)

        const entityClassName = this.detectClassName(entityPath, modelName)

        this.writeModelFiles(modelPath, [
            {
                name: `${modelName}.model.ts`,
                content: this.createEntityModelTemplate({
                    entityPath,
                    entityClassName
                })
            }
        ])

        this.createModelIndexFileTemplate()
    }

    private createEntityModelTemplate(options: { entityPath: string; entityClassName: string; }) {
        const entityRelativeFilePath = path.relative(this.options.outputPath, options.entityPath).replace(/\\/g, '/')

        return `import { BaseModel } from 'mahameru';
import { ${options.entityClassName} } from '${entityRelativeFilePath.replace('.ts', isESModule ? (this.options.includeExtensionOnBareModuleImport ? `.${this.options.includeExtensionOnBareModuleImport}` : '.js') : (this.options.includeExtensionOnBareModuleImport || ''))}';
import type { DataSource } from 'typeorm';

export class ${options.entityClassName}Model extends BaseModel<${options.entityClassName}> {
    constructor(dataSource: DataSource) {
        super(dataSource, ${options.entityClassName})
    }
}
`
    }

    private createModelIndexFileTemplate() {
        const modelFiles = this.getModelFiles()
        const dataSourceFilePathRelative = this.resolveImportPath(path.relative(this.options.outputPath, this.options.dataSourceFilePath).replace(/\\/g, '/'))

        let contents = `import dataSource from '${this.options.includeExtensionOnBareModuleImport ? dataSourceFilePathRelative + '/index.' + this.options.includeExtensionOnBareModuleImport : dataSourceFilePathRelative}';\n\n`;

        for (const model of modelFiles) {
            const modelFilePath = path.join(this.options.outputPath, model)

            if (!existsSync(modelFilePath)) continue

            const modelClassName = this.detectClassName(modelFilePath, this.resolveImportPath(model))

            contents += `import { ${modelClassName} } from './${this.resolveImportPath(model)}';\n`;
        }

        contents += `\n`;

        for (const model of modelFiles) {
            const modelFilePath = path.join(this.options.outputPath, model)

            if (!existsSync(modelFilePath)) continue

            const modelClassName = this.detectClassName(modelFilePath, this.resolveImportPath(model))
            const camelName = this.toCamelCase(modelClassName)
            contents += `const ${camelName} = new ${modelClassName}(dataSource)\n`;
        }

        contents += `\nexport type {\n`;

        for (const model of modelFiles) {
            const modelFilePath = path.join(this.options.outputPath, model)

            if (!existsSync(modelFilePath)) continue

            const modelClassName = this.detectClassName(modelFilePath, this.resolveImportPath(model))
            contents += `\t${modelClassName},\n`;
        }

        contents += `}\n`;

        contents += `\nconst models = {\n`;

        for (const model of modelFiles) {
            const modelFilePath = path.join(this.options.outputPath, model)

            if (!existsSync(modelFilePath)) continue

            const modelClassName = this.detectClassName(modelFilePath, this.resolveImportPath(model))
            const camelName = this.toCamelCase(modelClassName)
            contents += `\t${camelName},\n`;
        }

        contents += `}\n\nexport type Models = typeof models\nexport { models }\n`;

        this.writeFile(path.join(this.options.outputPath, 'index.ts'), contents)
    }

    private resolveImportPath(importPath: string) {
        const extension = this.options.includeExtensionOnBareModuleImport ? `.${this.options.includeExtensionOnBareModuleImport}` : ''

        return importPath.replace('.ts', extension)
    }

    private writeFile(filePath: string, content: string) {
        writeFileSync(filePath, content, 'utf8')
        // this.log('warn',`[create] ${filePath}`)

        return true
    }

    private getEntityFiles() {
        return readdirSync(this.options.entitiesPath)
            .filter(fileName => fileName.endsWith('.entity.ts'))
            .sort()
    }

    private getModelFiles() {
        return readdirSync(this.options.outputPath)
            .filter(fileName => fileName.endsWith('.model.ts'))
            .sort()
    }

    private writeModelFiles(modelPath: string, files: { name: string; content: string }[]) {
        mkdirSync(modelPath, {
            recursive: true
        })

        for (const file of files) {
            this.writeFileIfMissing(path.join(modelPath, file.name), file.content)
        }
    }

    private writeFileIfMissing(filePath: string, content: string) {
        if (existsSync(filePath)) {
            this.log('warn', `[skip] ${filePath}`)

            return false
        }

        writeFileSync(filePath, content, 'utf8')
        this.log('log', `[create] ${filePath}`)

        return true
    }

    private detectClassName(filePath: string, fallbackName: string) {
        const content = readFileSync(filePath, 'utf8')
        const match = content.match(/export\s+(?:abstract\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/)

        return match?.[1] ?? this.toPascalCase(fallbackName)
    }

    private toPascalCase(value: string) {
        return value
            .split(/[-_\s.]+/)
            .filter(Boolean)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('')
    }

    toCamelCase(value: string) {
        const pascalCase = this.toPascalCase(value)

        return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1)
    }

    private log(type: 'log' | 'warn' | 'error', message: string) {
        if (!this.options.debug) return

        if (type === 'error') console.error(message)
        else if (type === 'warn') console.warn(message)
        else if (type === 'log') console.log(message)
        else throw new Error(`Unknown log type: ${type}`)
    }
}

// const root = process.cwd()
// const srcPath = path.join(root, 'src')
// const entitiesPath = path.join(srcPath, 'databases', 'db-test', 'entities')
// const outputPath = path.join(srcPath, 'models')
// const baseModelFilePath = path.join(srcPath, 'common', 'base', 'base.model.ts')
// const dataSourceFilePath = path.join(srcPath, 'databases', 'db-test')

// const generator = new ModelGenerator({
//     srcPath,
//     entitiesPath,
//     outputPath,
//     baseModelFilePath,
//     dataSourceFilePath,
//     debug: true
// })

// const isSingleModule = process.argv[2];

// if (!isSingleModule) {
//     generator.generate()
// } else {
//     if (typeof isSingleModule === 'string' && isSingleModule === '--name') {
//         const moduleName = process.argv[3]

//         if (!moduleName) {
//             console.error('Module name is required')

//             process.exit(1)
//         }

//         if (typeof moduleName === 'string') {
//             generator.generateEntityModel(moduleName + '.entity.ts')
//         }
//     }
// }
