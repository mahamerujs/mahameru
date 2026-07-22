import { dirname, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Project, ScriptTarget, ModuleKind, ts } from 'ts-morph';

type GeneratorOptions = {
  dev: boolean;
  debug: boolean;
  rootPath: string;
  appPath: string;
  routesDir: string;
  modulesDir: string;
  outputTypesPath: string;
  sourceDirPath: string;
};

export class Generator {
  public readonly options: GeneratorOptions;

  constructor(initialOptions: GeneratorOptions) {
    this.options = initialOptions;
  }

  async start() {
    const routesIndexFilePath = join(
      this.options.sourceDirPath,
      this.options.routesDir,
      'route.ts',
    );
    const moduleSourcePath = join(this.options.sourceDirPath, this.options.modulesDir);

    if (!existsSync(moduleSourcePath)) await mkdir(moduleSourcePath, { recursive: true });

    if (!existsSync(dirname(routesIndexFilePath)) || !existsSync(routesIndexFilePath))
      await this.generateRouteIndexFile(routesIndexFilePath);

    await mkdir(this.options.outputTypesPath, { recursive: true });

    await this.generateInstancesDTS();
  }

  public async generateRouteIndexFile(routesIndexFilePath: string) {
    if (!existsSync(routesIndexFilePath)) return;

    if (!existsSync(dirname(routesIndexFilePath)))
      await mkdir(dirname(routesIndexFilePath), { recursive: true });

    const template = `import { type RouteHandler, MahameruResponse } from '@mahameru/magma';

export const GET: RouteHandler = () => {
    return MahameruResponse.json({
        success: true,
        message: 'Welcome to MahameruJS!'
    })
}
`;

    await writeFile(routesIndexFilePath, template, 'utf-8');
  }

  public async generateInstancesDTS(): Promise<void> {
    try {
      const initiatorPath = join(this.options.rootPath, 'src', 'initiator.ts');
      const outputPath = join(this.options.outputTypesPath, 'instances.d.ts');

      if (!existsSync(initiatorPath)) return;

      const project = new Project({
        compilerOptions: {
          target: ScriptTarget.ESNext,
          module: ModuleKind.ESNext,
          strict: true,
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
          },
        },
        skipAddingFilesFromTsConfig: true,
      });

      const sourceFile = project.addSourceFileAtPath(initiatorPath);
      const outputSourceFile = project.createSourceFile(outputPath, '', { overwrite: true });

      const typeChecker = project.getTypeChecker();
      const defaultExportSymbol = sourceFile.getDefaultExportSymbol();

      if (!defaultExportSymbol) throw new Error(`No default export found in ${initiatorPath}`);

      const exportDeclaration = defaultExportSymbol.getDeclarations()[0];

      if (!exportDeclaration)
        throw new Error(`Could not find declaration for default export in ${initiatorPath}`);

      const exportType = typeChecker.getTypeOfSymbolAtLocation(
        defaultExportSymbol,
        exportDeclaration,
      );

      const signatures = exportType.getCallSignatures();

      if (signatures.length === 0) throw new Error('Default export is not a function');

      let returnType = signatures[0].getReturnType();

      if (returnType.getText().startsWith('Promise<')) {
        const args = returnType.getTypeArguments();

        if (args.length > 0) {
          returnType = args[0];
        }
      }

      const imports = new Map<string, Set<string>>();
      let interfaceBody = 'export interface Instances {\n';

      for (const property of returnType.getProperties()) {
        const propertyType =
          property.getTypeAtLocation(exportDeclaration) ?? property.getDeclaredType();

        const typeText = typeChecker.compilerObject.typeToString(
          propertyType.compilerType,
          exportDeclaration.compilerNode,
          ts.TypeFormatFlags.UseFullyQualifiedType | ts.TypeFormatFlags.NoTruncation,
        );

        interfaceBody += `\t${property.getName()}: ${typeText};\n`;

        for (const importDecl of sourceFile.getImportDeclarations()) {
          const targetFile = importDecl.getModuleSpecifierSourceFile();

          if (!targetFile) {
            continue;
          }

          const matchedImports = importDecl.getNamedImports().filter((named) => {
            const importName = named.getName();

            return (
              propertyType.getText().includes(importName) ||
              propertyType.getSymbol()?.getName() === importName ||
              propertyType.getAliasSymbol()?.getName() === importName
            );
          });

          if (matchedImports.length === 0) continue;

          const moduleSpecifier = outputSourceFile.getRelativePathAsModuleSpecifierTo(targetFile);

          if (!imports.has(moduleSpecifier)) imports.set(moduleSpecifier, new Set());

          const set = imports.get(moduleSpecifier)!;

          for (const named of matchedImports) set.add(named.getText());
        }
      }

      interfaceBody += '}';

      const importStatements = [...imports.entries()]
        .map(
          ([specifier, names]) => `import { ${[...names].sort().join(', ')} } from '${specifier}';`,
        )
        .join('\n');

      const content = `${importStatements ? `${importStatements}\n\n` : ''}${interfaceBody}\n`;

      await writeFile(outputPath, content, 'utf8');
    } catch (error) {
      console.error(`[${Generator.name}]`, 'Error generating instances.d.ts:', error);

      throw error;
    }
  }

  public async generateDataSourcesTypes() {
    const dataSources: Record<string, any> = [];

    const lines = Object.keys(dataSources).map((name) => `    ${name}: DataSource;`);
    const hasDataSources = lines.length > 0;
    const dataSourceTemplate = hasDataSources
      ? `// Do not edit this file, it is generated by MahameruJS\n\nimport type { DataSource } from "typeorm";\n\ndeclare module 'mahameru' {\n\texport interface DataSources {\n\t\t${lines.join('\n')}\n\t}\n\n\texport interface PreInitContext {\n\t\tdataSources: DataSources;\n\t}\n}\n`
      : `// Do not edit this file, it is generated by MahameruJS\n\ndeclare module 'mahameru' {}\n`;
    const outputPath = join(this.options.appPath, 'types', 'dataSources.d.ts');

    try {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, dataSourceTemplate, 'utf-8');

      this.logger(`Data sources types generated successfully at ${outputPath}`);
    } catch (error) {
      console.error(`[${Generator.name}]`, 'Error generating data sources types', error);
    }
  }

  protected logger(...data: any[]) {
    if (!this.options.debug) return;

    console.log('[Generator]', ...data);
  }
}
