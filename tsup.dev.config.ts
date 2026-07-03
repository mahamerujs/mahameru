/// <reference types="node" />

import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup'

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
            packageJson.scripts = {};
            delete packageJson.files;

            await writeFile('dist/package.json', JSON.stringify(packageJson, null, 2));
            await copyFile('README.md', 'dist/README.md');
            await copyFile('src/favicon.ico', 'dist/favicon.ico');
        } catch (error) {
            console.error(error);
        }

        console.log('Mahameru built successfully.');
    }
})
