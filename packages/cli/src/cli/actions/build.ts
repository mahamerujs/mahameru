import { version } from '../../../package.json';
import pc from 'picocolors';
import ora from 'ora';
import type { PackageJson } from 'type-fest';

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureDevEnvironment } from './scripts/ensureDevEnvironment';
import { deleteDirIfExists } from './scripts/utils';
import { runNodeScript } from './scripts/runNodeScript';
import { findUnresolvedAliases } from './scripts/findUnresolvedAliases';
import {
  generateBarrelIndexFile,
  generateDataSourceTypes,
  generateMahameruDts,
  generateRouteTypes,
} from './scripts/generate-dynamic-types';
import { existsSync } from 'node:fs';
import { createZip } from '../../utils/zip-dir';

export function build({ rootPath }: { rootPath: string }) {
  return async () => {
    const productionDir = '.mahameru';

    if (!productionDir) throw new Error('MAHAMERU__PRODUCTION_DIR is not set');

    const productionPath = join(rootPath, productionDir);

    console.log(`${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`CLI v${version}`)}\n`);

    const spinner = ora(pc.cyan(' Checking environment...')).start();
    const { tscJsPath, tscAliasJsPath } = ensureDevEnvironment();

    try {
      spinner.text = pc.cyan(' Starting build...\n');

      await deleteDirIfExists(productionPath);
      await generateRouteTypes(
        join(rootPath, 'src', 'routes'),
        join(productionPath, 'types', 'routes.d.ts'),
      );
      await generateDataSourceTypes(
        join(rootPath, 'src', 'databases'),
        join(productionPath, 'types', 'dataSources.d.ts'),
      );
      await generateBarrelIndexFile(join(productionPath, 'types'));
      await generateMahameruDts(join(rootPath, 'mahameru.d.ts'));

      const tsconfigFile = 'tsconfig.build.json';
      const tsconfigBuildPath = join(rootPath, tsconfigFile);
      const tsconfigPath = join(rootPath, 'tsconfig.json');
      const tsconfigRAWJson = await readFile(tsconfigPath, 'utf8');
      let tsconfigJSON: any = null;

      try {
        tsconfigJSON = JSON.parse(tsconfigRAWJson);
        tsconfigJSON.compilerOptions.outDir = '.mahameru';
        tsconfigJSON.compilerOptions.rootDir = 'src';
        await writeFile(tsconfigBuildPath, JSON.stringify(tsconfigJSON, null, 2));
      } catch (error) {
        console.error(`Error parsing ${tsconfigPath}: ${error}`);

        process.exit(1);
      }

      const tscCode = await runNodeScript(tscJsPath, ['--project', tsconfigFile], rootPath);

      if (tscCode !== 0) {
        spinner.fail(pc.red(' Build failed!'));

        await deleteDirIfExists(productionPath);

        process.exit(tscCode);
      }

      const aliasCode = await runNodeScript(tscAliasJsPath, ['--project', tsconfigFile], rootPath);

      if (aliasCode !== 0) {
        spinner.fail(pc.red(' tsc-alias failed.'));

        await deleteDirIfExists(productionPath);

        process.exit(aliasCode);
      }

      const unresolvedAliases = findUnresolvedAliases(productionPath);

      if (unresolvedAliases.length > 0) {
        spinner.fail(pc.red(' Build produced unresolved path aliases.'));
        console.error(
          pc.yellow(
            'Please use tsconfig path aliases such as @/* and avoid package.json imports for app source files.',
          ),
        );

        for (const aliasPath of unresolvedAliases) {
          console.error(pc.red(` - ${aliasPath}`));
        }

        process.exit(1);
      }

      await deleteDirIfExists(tsconfigBuildPath);
      await deleteDirIfExists(join(productionPath, 'types'));

      try {
        const packageJsonString = await readFile(join(rootPath, 'package.json'), 'utf-8');
        const packageJson = JSON.parse(packageJsonString) as PackageJson;

        if (packageJson.devDependencies) delete packageJson.devDependencies;

        await writeFile(join(productionPath, 'package.json'), JSON.stringify(packageJson, null, 2));
      } catch {}

      const defaultEnvFile = join(rootPath, '.env');
      const developmentEnvFile = join(rootPath, '.env.development');
      const productionEnvFile = join(rootPath, '.env.production');

      if (existsSync(defaultEnvFile)) await copyFile(defaultEnvFile, join(productionPath, '.env'));

      if (existsSync(productionEnvFile)) {
        await copyFile(productionEnvFile, join(productionPath, '.env.production'));
      } else {
        if (existsSync(developmentEnvFile)) {
          await copyFile(developmentEnvFile, join(productionPath, '.env.production'));
        }
      }

      await createZip(
        join(process.cwd(), productionDir),
        join(process.cwd(), `${productionDir}.zip`),
        false,
      );

      spinner.succeed(pc.green(' Build success.'));
    } catch (error) {
      spinner.fail(pc.red(' Internal error.'));

      console.error(error);

      process.exit(1);
    }
  };
}
