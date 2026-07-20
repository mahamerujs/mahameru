#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { parsePort } from '../utils/parse-port';
import dev from './actions/dev';
import build from './actions/build';
import start from './actions/start';
import stop from './actions/stop';
import status from './actions/status';
import generate from './actions/generate';
import { mahameruDefaultConfig } from '../config';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { MAHAMERU_TITLE } from '../constants';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import type { PackageJson } from 'type-fest'
import devTest from './actions/dev-test';

if (process.platform === 'win32') {
    const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    readline.on('SIGINT', () => {
        process.emit('SIGINT');
    });
}

(async () => {
    const mahameru = new Command();

    try {
        const rootPath = process.cwd();
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const packageJsonFilePath = join(__dirname, '..', 'package.json');
        const { version }: PackageJson = JSON.parse(await readFile(packageJsonFilePath, 'utf-8').catch((error: unknown) => {
            if (error && typeof error === 'object' && "code" in error && error.code === 'ENOENT')
                throw new Error(`package.json file not found at ${packageJsonFilePath}`);

            throw error;
        }))

        if (!version)
            throw new Error('package.json file does not have a version property.');

        mahameru
            .name('mahameru')
            .description(`${pc.bold(MAHAMERU_TITLE)} ${pc.dim(`v${version}`)}`)
            .version(version, '-v, --version', 'Display help for command');

        mahameru.command('dev:test')
            .description('Start MahameruJS development server (Test Mode).')
            .option('-p, --port <number>', 'Port to run the server on', parsePort, mahameruDefaultConfig.port)
            .option('-H, --host <string>', 'Host to run the server on', mahameruDefaultConfig.host)
            .action(devTest({ rootPath, version }));

        mahameru.command('dev')
            .description('Start MahameruJS development server.')
            .option('-p, --port <number>', 'Port to run the server on', parsePort, mahameruDefaultConfig.port)
            .option('-H, --host <string>', 'Host to run the server on', mahameruDefaultConfig.host)
            .action(dev({ rootPath, version }));

        mahameru.command('build')
            .description('Build MahameruJS production application.')
            .action(build({ rootPath, version }));

        mahameru.command('start')
            .description('Start MahameruJS production server.')
            .option('-d, --daemon', 'Run as a daemon', false)
            .option('-p, --port <number>', 'Port to run the server on', parsePort, 8000)
            .option('-H, --host <string>', 'Host to run the server on', '127.0.0.1')
            .action(start({ rootPath, version }));

        mahameru.command('stop')
            .description('Stop MahameruJS production server.')
            .action(stop({ rootPath, version }));

        mahameru.command('status')
            .description('View MahameruJS production server status.')
            .action(status({ rootPath, version }));

        mahameru.command('generate')
            .description('MahameruJS project generator.')
            .action(generate({ rootPath, version }));

        await mahameru.parseAsync(process.argv);
    } catch (error) {
        if (error instanceof Error) {
            console.error(pc.red(error.message));
        } else {
            console.error(error);
        }
    }
})()
