import net from 'net';
import pc from 'picocolors';
import { PackageJson, StrictServerOptions } from './scripts/types';
import { freePortFinder } from '../../utils/free-port-finder';
import ora from 'ora';
import { getProjectJson } from '../../utils/get-package-json';
import {
  getWindowsElevatedWorkingDirectory,
  hasWindowsElevationRetry,
  isWindowsProcessElevated,
  relaunchCurrentProcessAsAdmin,
} from '@/utils/windows-elevation';
import { IPC_SOCKET_PATH } from '../../constants';
import { Payload, PayloadDelete } from '../../types';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { isNodeProjectDir } from '@/utils/is-node-project-dir';

type StartForkResponse = {
  success: boolean;
  message: string;
  data: MahameruIPCServerDataMap['READY'];
  mpmUrl?: string;
};

function printManagedProjectReady({
  name,
  version,
  mode,
  host,
  port,
  pid,
  mpmUrl,
}: {
  name: string;
  version: string;
  mode: 'development' | 'production';
  host: string;
  port: number;
  pid: number;
  mpmUrl?: string;
}) {
  const rows = [
    `${pc.bold('App:')}      ${pc.cyan(name)}`,
    `${pc.bold('Version:')}  ${version}`,
    `${pc.bold('Mode:')}     ${pc.cyan(mode)}`,
    `${pc.bold('PID:')}      ${pid}`,
    `${pc.bold('Local:')}    ${pc.cyan(`http://${host}:${port}`)}`,
  ];

  if (mpmUrl) {
    rows.push(`${pc.bold('PM URL:')}   ${pc.cyan(mpmUrl)}`);
  }

  console.log(pc.green('\n Project Started'));
  rows.forEach((row) => console.log(`   ${row}`));
  console.log(`\n${pc.dim('Use `mahameru status` to inspect this managed project.')}\n`);
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
        pc.dim('Keep that window open to see whether `mahameru start` succeeds or why it fails.'),
      );
      process.exit(0);
    }

    const failureReason =
      relaunchResult.reason === 'user-cancelled'
        ? 'UAC request was cancelled.'
        : 'Unable to launch an elevated Mahameru process.';

    spinner.fail(
      pc.red(
        `\n${failureReason}\nMahameru PM Daemon is likely running with Administrator privileges, so ${pc.bold('mahameru start')} also needs admin approval to connect.`,
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

export const deleteProcess = (rootPath: string) => async () => {
  try {
    const effectiveRootPath = getWindowsElevatedWorkingDirectory() ?? rootPath;

    if (!isNodeProjectDir(effectiveRootPath)) {
      console.error(
        pc.red(`\n${effectiveRootPath} is not node project. Cannot find package.json.`),
      );

      process.exit(1);
    }

    let packageJson = await getProjectJson(effectiveRootPath);

    packageJson = packageJson as Payload['packageJson'];

    const packageJsonLockFilePath = join(effectiveRootPath, 'package-lock.json');
    const nodeModulesPath = join(effectiveRootPath, 'node_modules');

    if (!existsSync(nodeModulesPath) || !existsSync(packageJsonLockFilePath)) {
      const spinnerIntall = ora('Installing dependencies...').start();
      execSync(`npm install`, { stdio: 'inherit', cwd: effectiveRootPath });
      spinnerIntall.succeed(pc.green(`Dependencies installed.`));
    }

    const spinner = ora('Checking available port...').start();

    spinner.text = 'Connecting to MahameruJS PM Daemon...';

    const payload: PayloadDelete = {
      packageJson,
      projectRoot: effectiveRootPath,
    };

    const client = net.createConnection({ path: IPC_SOCKET_PATH }, () => {
      client.write(
        JSON.stringify({
          command: 'DELETE',
          payload,
        }),
      );
    });

    client.on('data', (messageRaw) => {
      const response = JSON.parse(messageRaw.toString()) as StartForkResponse;
      const { success, message } = response;

      if (success) {
        spinner.succeed(pc.green(`\n${message}`));
      } else {
        spinner.fail(pc.red(`Failed to stop project!`));

        console.error(response);
      }

      client.end();

      process.exit(0);
    });

    client.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        spinner.fail(
          `${pc.red(`Mahameru PM Service is not running. Cannot connect to Mahameru PM Service.`)}\n\nMake sure you run ${pc.bold(pc.cyan('mahameru pm service install'))} first to install the service.\nOr open new terminal and run ${pc.bold(pc.cyan('mahameru pm start'))} to run the MahameruJS PM foreground process. Then you can run ${pc.bold(pc.cyan('mahameru start'))} again on this directory.`,
        );
      } else if (process.platform === 'win32' && err.code === 'EPERM') {
        handleWindowsPermissionDenied(spinner, effectiveRootPath);
      } else {
        spinner.fail(pc.red(`${err.message}`));
        console.error(err);
      }

      process.exit(1);
    });
  } catch (error) {
    console.error(error);

    process.exit(1);
  }
};
