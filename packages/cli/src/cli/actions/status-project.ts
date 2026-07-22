import net from 'node:net';
import type { StrictServerOptions } from './scripts/types';
import { getProjectJson } from '@/utils/get-package-json';
import ora from 'ora';
import pc from 'picocolors';
import {
  getWindowsElevatedWorkingDirectory,
  hasWindowsElevationRetry,
  isWindowsProcessElevated,
  relaunchCurrentProcessAsAdmin,
} from '@/utils/windows-elevation';
import { Project } from '../../types';
import { IPC_SOCKET_PATH } from '../../constants';

type ProjectStatusResponse = {
  success: boolean;
  error?: string;
  data: Project;
};

function printManagedProjectStatus(project: Project) {
  const localUrl = `http://${project.host}:${project.port}`;
  const statusColor =
    project.status === 'running' ? pc.green : project.status === 'stopped' ? pc.yellow : pc.red;

  const rows = [
    `${pc.bold('App:')}       ${pc.cyan(project.name)}`,
    `${pc.bold('Version:')}   ${project.version}`,
    `${pc.bold('Mode:')}      ${pc.cyan(project.mode)}`,
    `${pc.bold('Status:')}    ${statusColor(project.status)}`,
    `${pc.bold('PID:')}       ${typeof project.pid === 'number' ? project.pid : pc.dim('-')}`,
    `${pc.bold('Host:')}      ${project.host}`,
    `${pc.bold('Port:')}      ${project.port}`,
    `${pc.bold('Local:')}     ${pc.cyan(localUrl)}`,
    `${pc.bold('Root Path:')} ${project.rootPath}`,
  ];

  console.log(pc.cyan('\n Project Status'));
  rows.forEach((row) => console.log(`   ${row}`));
  console.log(`\n${pc.dim(`Created at: ${project.createdAt}`)}\n`);
}

function handleWindowsPermissionDenied(spinner: ReturnType<typeof ora>, rootPath: string) {
  if (!hasWindowsElevationRetry() && !isWindowsProcessElevated()) {
    spinner.warn(
      pc.yellow(
        '\nWindows blocked access to the Mahameru PM pipe. Requesting Administrator approval...',
      ),
    );

    const relaunchResult = relaunchCurrentProcessAsAdmin(rootPath);

    if (relaunchResult.ok) {
      console.log(
        pc.cyan('An Administrator PowerShell window has been launched for the elevated retry.'),
      );
      console.log(pc.dim(`The elevated retry will run from: ${rootPath}`));
      console.log(
        pc.dim('Keep that window open to see the managed project status or why it failed.'),
      );
      process.exit(0);
    }

    const failureReason =
      relaunchResult.reason === 'user-cancelled'
        ? 'UAC request was cancelled.'
        : 'Unable to launch an elevated Mahameru process.';

    spinner.fail(
      pc.red(
        `\n${failureReason}\nMahameru PM Daemon is likely running with Administrator privileges, so ${pc.bold('mahameru status')} also needs admin approval to connect.`,
      ),
    );

    if (relaunchResult.errorText) {
      console.error(pc.dim(relaunchResult.errorText));
    }

    process.exit(1);
  }

  spinner.fail(
    pc.red(
      `\nAccess denied while connecting to Mahameru PM Daemon.\nThe daemon or Windows service is likely running elevated, and the elevated retry still could not access ${pc.bold(IPC_SOCKET_PATH)}.`,
    ),
  );
  console.log(
    pc.dim('Check the visible Administrator PowerShell window for the detailed failure output.'),
  );
  process.exit(1);
}

export const projectStatus =
  (rootPath: string, version: string) =>
  async ({ host, port }: StrictServerOptions) => {
    try {
      console.log(`${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`CLI v${version}`)}\n`);

      const effectiveRootPath = getWindowsElevatedWorkingDirectory() ?? rootPath;
      const packageJson = await getProjectJson(effectiveRootPath);
      const spinner = ora('Checking available port...').start();
      const client = net.createConnection({ path: IPC_SOCKET_PATH }, () => {
        client.write(
          JSON.stringify({
            command: 'STATUS',
            payload: {
              name: packageJson.name,
            },
          }),
        );
      });

      client.on('data', (rawData) => {
        const { success, error, data } = JSON.parse(rawData.toString()) as ProjectStatusResponse;

        if (success) {
          spinner.succeed(pc.green('\nManaged project status loaded.'));
          printManagedProjectStatus(data);
        } else {
          spinner.fail(`${pc.red('[Mahameru]')} ${error}`);
        }

        process.exit(0);
      });

      client.on('error', (err: NodeJS.ErrnoException) => {
        if (process.platform === 'win32' && err.code === 'EPERM') {
          handleWindowsPermissionDenied(spinner, effectiveRootPath);
        } else if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
          spinner.fail(pc.red('\nMahameru PM Daemon is not running.'));
        } else {
          spinner.fail(pc.red(`\n${err.message}`));
          console.error(err);
        }

        process.exit(1);
      });
    } catch (error) {
      console.error(error);

      process.exit(1);
    }
  };
