#!/usr/bin/env node

import { Command } from 'commander';

import * as pkg from '../../package.json' with { type: 'json' };
import onInit from './scripts/on-init.js';
import onBuild from './scripts/on-build.js';
import onStart from './scripts/on-start.js';
import onDev from './scripts/on-dev.js';

const { default: { version } } = pkg;
const program = new Command();

program
    .name('mahameru')
    .version(version)
    .description('Mahameru - A minimal and fast Node.js framework for building HTTP servers');

program
    .command('init')
    .description('Initialize a new project from a GitHub template')
    .action(onInit);

program
    .command('dev')
    .description('Start the development server')
    .option('-p, --port <port>', 'Port to run the development server on', '3000')
    .action(onDev);

program
    .command('build')
    .description('Build project')
    .action(onBuild);

program
    .command('start')
    .description('Start the production server')
    .action(onStart);

program.parse(process.argv);
