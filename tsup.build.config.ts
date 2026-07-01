/// <reference types="node" />

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup'
import { PackageJson } from 'type-fest'

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
    clean: true,
    onSuccess: async () => {
        const packageJsonString = await readFile('package.json', 'utf-8');

        try {
            const packageJson = JSON.parse(packageJsonString) as PackageJson;
            packageJson.main = './index.js';
            packageJson.types = './index.d.ts';
            packageJson.scripts = {};
            delete packageJson.files;

            replaceDist(packageJson.exports);

            await writeFile('dist/package.json', JSON.stringify(packageJson, null, 2));
            await copyFile('README.md', 'dist/README.md');
        } catch (error) {
            console.error(error);
        }

        console.log('Mahameru built successfully.');
    }
})
