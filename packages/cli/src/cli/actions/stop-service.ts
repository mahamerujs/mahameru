import { APPDATA_PATH } from '@/constants';
import { getNodeModulesPath } from '@/utils/getNodeModulesPath';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

export const stopService = (serviceName: string) => {
  return ({ gracefull }: { gracefull: boolean }) => {
    const isLinux = process.platform === 'linux';
    const isWindows = process.platform === 'win32';
    const servicePath = `/etc/systemd/system/${serviceName}.service`;

    let nodeModulesPath = '';

    try {
      nodeModulesPath = getNodeModulesPath();
    } catch (e: any) {
      console.error(pc.red(`❌ ${e.message}`));
      return;
    }

    const mahameruInstalationPath = join(nodeModulesPath, '@mahameru', 'cli');

    try {
      if (isLinux) {
        if (process.getuid && process.getuid() !== 0) {
          throw new Error('This action requires root privileges. Please run with sudo.');
        }

        if (!existsSync(servicePath)) {
          throw new Error(`Service "${serviceName}" is not registered on this system.`);
        }

        console.log(pc.cyan(`🔍 Checking status for service: ${serviceName}...`));

        let isRunning = false;

        try {
          const status = execSync(`systemctl is-active ${serviceName}`, {
            stdio: ['ignore', 'pipe', 'ignore'],
          })
            .toString()
            .trim();
          if (status === 'active') isRunning = true;
        } catch {
          isRunning = false;
        }

        if (isRunning) {
          console.log(pc.yellow(`🛑 Service is active. Stopping ${serviceName}...`));
          execSync(`systemctl stop ${serviceName}`);
          console.log(pc.green(`\n🛑 ${serviceName} has been successfully stopped.`));
        } else {
          console.log(pc.yellow(`⚠️ Service "${serviceName}" is already stopped.`));
        }
      } else if (isWindows) {
        stopWindowsService({ serviceName, mahameruInstalationPath });
      } else {
        console.log(pc.red('❌ Unsupported platform.'));
      }
    } catch (error) {
      console.error(pc.red(`❌ Failed to stop service:`), (error as Error).message);
    }
  };
};

function stopWindowsService({
  serviceName,
  mahameruInstalationPath,
}: {
  serviceName: string;
  mahameruInstalationPath: string;
}) {
  try {
    console.log(`Attempting to stop service: ${pc.cyan(serviceName)}...`);
    const winswExePath = join(APPDATA_PATH, 'winsw', `${serviceName}.exe`);

    if (existsSync(winswExePath)) {
      execSync(`"${winswExePath}" stop`, { cwd: mahameruInstalationPath });
      console.log(pc.green(`✔ Success: Service "${serviceName}" has been stopped.`));
      return;
    }

    console.log(pc.yellow('WinSW binary not found. Falling back to sc.exe...'));
    execSync(`sc stop "${serviceName}"`);
    console.log(pc.green(`✔ Success: Service "${serviceName}" has been stopped via sc.exe.`));
  } catch (error) {
    console.error(pc.red(`❌ Error: Failed to stop service: ${(error as Error).message}`));
    console.error('Make sure you are running CMD/PowerShell as an Administrator.');
  }
}
