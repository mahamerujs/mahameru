/// <reference types="node" />

import { copyFile, cp, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'tsup'
import { fixExtensionsPlugin } from 'esbuild-fix-imports-plugin';
import { rmSync } from 'node:fs';
import type { PackageJson } from 'type-fest'

function replaceDistPath(packageObj: PackageJson): PackageJson {
    function toPlainObject(target: any): any {
        if (target === null || typeof target !== 'object') {
            if (typeof target === 'string' && target.startsWith('./dist/'))
                return target.replace('./dist/', './');

            return target;
        }

        if (Array.isArray(target))
            return target.map(toPlainObject);

        const plainObj: any = {};
        const keys = Object.getOwnPropertyNames(target);

        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(target, key);

            if (descriptor) {
                const value = descriptor.get ? target[key] : descriptor.value;
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
        packageJson.bin = { 'mahameru': './cli/index.js' };
        packageJson = replaceDistPath(packageJson);

        await writeFile('dist/package.json', JSON.stringify(packageJson, null, 2), 'utf-8');
        await copyFile('README.md', 'dist/README.md');
        await copyFile('src/favicon.ico', 'dist/favicon.ico');
        await cp('scripts', join('dist', 'scripts'), { recursive: true });
        await cp('src/cli/templates', 'dist/cli/templates', { recursive: true });
    } catch (error) {
        console.error(error);
    }
}

rmSync('dist.tgz', { force: true, recursive: true });

export default defineConfig({
    bundle: false,
    entry: ['src/**/*.ts'],
    format: ['cjs', 'esm'],
    outDir: 'dist',
    tsconfig: 'tsconfig.json',
    splitting: false,
    cjsInterop: true,
    sourcemap: true,
    dts: true,
    keepNames: true,
    clean: process.env.NODE_ENV !== 'development',
    watch: process.env.NODE_ENV === 'development',
    shims: true,
    esbuildPlugins: [fixExtensionsPlugin()],
    onSuccess
})
