/// <reference types="node" />

import { execSync } from 'node:child_process';
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'tsup'
import { version } from './package.json'

const replaceDist = (obj: any) => {
    for (const key in obj) {
        if (typeof obj[key] === 'string') {
            if (obj[key].startsWith('./dist/')) {
                obj[key] = obj[key].replace('./dist/', './');
            }
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            replaceDist(obj[key]);
        }
    }
};

export default defineConfig({
    entry: ['src/**/*.ts'],
    format: ['cjs', 'esm'],
    splitting: true,
    sourcemap: true,
    dts: true,
    clean: false,
    watch: true,
    onSuccess: async () => {
        const packageJsonString = await readFile('package.json', 'utf-8');

        try {
            const packageJson = JSON.parse(packageJsonString);
            packageJson.main = './index.js';
            packageJson.types = './index.d.ts';
            packageJson.scripts = {
                preinstall: 'node ./cli/scripts/preinstall.js'
            };
            delete packageJson.files;

            replaceDist(packageJson.exports);

            await writeFile('dist/package.json', JSON.stringify(packageJson, null, 2));
            await copyFile('README.md', 'dist/README.md');
            await copyFile('src/favicon.ico', 'dist/favicon.ico');
            execSync('npm pack', { cwd: join(process.cwd(), 'dist') });
            await rename(join(process.cwd(), 'dist', `mahameru-${version}.tgz`), join(process.cwd(), 'dist', 'dist.tgz'));
        } catch (error) {
            console.error(error);
        }

        console.log('Mahameru built successfully.');
    }
})
