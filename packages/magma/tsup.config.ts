/// <reference types="node" />

import { copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';
import { fixExtensionsPlugin } from 'esbuild-fix-imports-plugin';
import type { PackageJson } from 'type-fest';
import { join } from 'node:path';

function replaceDistPath(packageObj: PackageJson): PackageJson {
  function toPlainObject(target: unknown): unknown {
    if (target === null || typeof target !== 'object') {
      if (typeof target === 'string') {
        if (target.startsWith('./dist/')) {
          return target.replace('./dist/', './');
        } else if (target.startsWith('dist/')) {
          return target.replace('dist/', '');
        }
      }

      return target;
    }

    if (Array.isArray(target)) return (target as unknown[]).map(toPlainObject);

    const plainObj: Record<string, unknown> = {};
    const keys = Object.getOwnPropertyNames(target as object);

    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(target as object, key);

      if (descriptor) {
        const value = descriptor.get ? (target as any)[key] : descriptor.value;
        plainObj[key] = toPlainObject(value);
      }
    }

    return plainObj;
  }

  return toPlainObject(packageObj) as PackageJson;
}

const onSuccess = async () => {
  try {
    const packageJsonString = await readFile('package.json', 'utf-8');
    let packageJson = JSON.parse(packageJsonString) as PackageJson;
    packageJson.main = './index.cjs';
    packageJson.module = './index.js';
    packageJson.types = './index.d.ts';

    delete packageJson.publishConfig;
    delete packageJson.scripts;

    packageJson = replaceDistPath(packageJson);

    await writeFile('dist/package.json', JSON.stringify(packageJson, null, 2), 'utf-8');
    await copyFile('README.md', 'dist/README.md');
    await cp('templates', join('dist', 'templates'), { recursive: true });
    await copyFile('src/favicon.ico', 'dist/favicon.ico');
  } catch (error) {
    console.error(error);

    process.exit(1);
  }
};

export default defineConfig((options) => {
  return {
    bundle: false,
    entry: ['src/**/*.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    tsconfig: 'tsconfig.json',
    splitting: false,
    cjsInterop: true,
    sourcemap: true,
    dts: false,
    clean: !options.watch,
    shims: true,
    esbuildPlugins: [fixExtensionsPlugin()],
    onSuccess,
  };
});
