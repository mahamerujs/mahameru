#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { version } from '../../package.json';

import { dev } from './actions/dev';
import { build } from './actions/build';
import { parsePort } from './actions/scripts/utils';
import { install } from './actions/install';
import { pm } from './actions/pm';
import { uninstall } from './actions/uninstall';
import { startService } from './actions/start-service';
import { stopService } from './actions/stop-service';
import { status } from './actions/status';
import { projectStatus } from './actions/status-project';
import { stopFork } from './actions/stop-fork';
import { deleteProcess } from './actions/delete-process';
import { projectList } from './actions/list';
import { mpmStatus } from '@/mpm/status';
import { start } from './actions/start';

const mahameru = new Command();

(async () => {
  try {
    const rootPath = process.cwd();
    const serviceName = 'mahameru-pm';

    mahameru
      .name('mahameru')
      .description(`${pc.bold(pc.cyan('▲ MahameruJS'))} ${pc.dim(`CLI v${version}`)}`)
      .version(version, '-v, --version', 'Display help for command');

    mahameru
      .command('dev')
      .description('Start MahameruJS development server.')
      .option('-p, --port <number>', 'Port to run the server on', parsePort, 3000)
      .option('-H, --host <string>', 'Host to run the server on', '127.0.0.1')
      .action(dev({ version }));

    mahameru
      .command('build')
      .description('Build MahameruJS production application.')
      .action(build({ rootPath }));

    mahameru
      .command('start')
      .description('Start MahameruJS production server.')
      // .argument('[entryFile]', 'Path to the entry file')
      .option('-p, --port <number>', 'Port to run the server on', parsePort, 8000)
      .option('-H, --host <string>', 'Host to run the server on', '127.0.0.1')
      .option(
        '--multi-core <number>',
        'Enable multi-core support. For example: --multi-core 4 to use 4 cores or --multi-core -1 to use all cores',
      )
      .action(start({ rootPath, version }));

    mahameru
      .command('stop')
      .description('Stop MahameruJS production server.')
      .action(stopFork(rootPath, version));

    mahameru
      .command('status')
      .description('View MahameruJS production server status.')
      .action(projectStatus(rootPath, version));

    const mahameruPm = mahameru
      .command('pm')
      .description(`${pc.bold(pc.cyan('▲ MahameruJS'))} ${pc.dim(`Process Manager`)}`);

    mahameruPm
      .command('list')
      .alias('ls')
      .description('List all registered projects.')
      .action(projectList(rootPath, version));

    mahameruPm
      .command('start')
      .description('Start MahameruJS Process Manager.')
      .option('-p, --port <number>', 'Port to run the server on', parsePort, 8000)
      .option('-H, --host <string>', 'Host to run the server on', '127.0.0.1')
      .option('--cert <string>', 'Path to the SSL certificate file')
      .option('--key <string>', 'Path to the SSL key file')
      .option('-d, --daemon', 'Run as a daemon', false)
      .action(pm(version));

    mahameruPm
      .command('status')
      .description('Get MahameruJS Process Manager status.')
      .action(mpmStatus(version));

    mahameruPm
      .command('delete')
      .description('Delete project from Process Manager.')
      .action(deleteProcess(rootPath));

    mahameruPm.on('command:*', (operands) => {
      const unknownCommand = operands[0];

      const serviceCommands = ['install', 'uninstall', 'start', 'stop'];

      if (serviceCommands.includes(unknownCommand)) {
        console.log(pc.yellow(`\n⚠  Did you mean 'mahameru pm service ${unknownCommand}'?\n`));
        mahameruPmService.outputHelp();
        process.exit(1);
      }
    });

    const mahameruPmService = mahameruPm
      .command('service')
      .description(`${pc.bold(pc.cyan('▲ MahameruJS'))} ${pc.dim(`Process Manager Service`)}`);

    mahameruPmService
      .command('install')
      .description(
        'Install MahameruJS Process Manager and register the server as a service. This will make MahameruJS Process Manager boot on system startup.',
      )
      .option('-p, --port <number>', 'Port to run the server on', parsePort, 8000)
      .option('-H, --host <string>', 'Host to run the server on', '127.0.0.1')
      .option('--cert <string>', 'Path to the SSL certificate file')
      .option('--key <string>', 'Path to the SSL key file')
      .action(install(serviceName));

    mahameruPmService
      .command('uninstall')
      .description(
        'Uninstall MahameruJS Process Manager as a service. This will remove the service from systemd and disable it.',
      )
      .action(uninstall(serviceName));

    mahameruPmService
      .command('start')
      .description('Start MahameruJS Process Manager service.')
      .action(startService(serviceName));

    mahameruPmService
      .command('stop')
      .description('Stop MahameruJS Process Manager service.')
      .option('-g, --graceful', 'Gracefully stop the service.', false)
      .action(stopService(serviceName));

    mahameruPmService
      .command('status')
      .description('Get MahameruJS Process Manager status.')
      .action(status(serviceName, version));

    await mahameru.parseAsync(process.argv);
  } catch (error) {
    console.error(error);

    process.exit(1);
  }
})();
