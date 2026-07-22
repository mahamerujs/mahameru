import { APPDATA_PATH, IS_LINUX, IS_WINDOWS, USERNAME } from '../../constants';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

export const uninstall = (serviceName: string) => () => {
  try {
    if (IS_LINUX) {
      serviceName = `${process.env.SUDO_USER ?? USERNAME}-${serviceName}`;
      const servicePath = `/etc/systemd/system/${serviceName}.service`;

      if (process.getuid && process.getuid() !== 0) {
        const args = [process.execPath, process.argv[1], ...process.argv.slice(2)];

        const result = spawnSync('sudo', args, {
          env: process.env,
          stdio: 'inherit',
        });

        process.exit(result.status ?? 1);
      }

      if (!existsSync(servicePath)) {
        throw new Error(
          `Service "${serviceName}" was not found or is not registered on this system.`,
        );
      }

      console.log('');
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
        console.log(pc.yellow(`🛑 Service is running. Stopping ${serviceName}...`));

        execSync(`systemctl stop ${serviceName}`);
      }

      console.log(pc.cyan(`🔄 Disabling service...`));

      try {
        execSync(`systemctl disable ${serviceName}`, { stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {}

      console.log(pc.cyan(`🗑️ Removing service file from ${servicePath}...`));
      execSync(`rm ${servicePath}`);

      execSync('systemctl daemon-reload');
      execSync('systemctl reset-failed');

      console.log(pc.green(`\n🚀 ${serviceName} successfully uninstalled!`));
    } else if (IS_WINDOWS) {
      console.log('Deleting Windows Service...');

      const winswExePath = join(APPDATA_PATH, 'winsw', `${serviceName}.exe`);

      if (existsSync(winswExePath)) {
        try {
          execSync(`"${winswExePath}" stop`, { cwd: APPDATA_PATH });
        } catch (e) {}

        execSync(`"${winswExePath}" uninstall`, { cwd: APPDATA_PATH });

        console.log(pc.green(`✔ Mahameru Process Manager successfully uninstalled.`));
      } else {
        console.log(pc.yellow('Cannot found WinSW binary. Fallback to sc delete...'));
        try {
          execSync(`sc stop "${serviceName}"`);
        } catch (e) {}
        execSync(`sc delete "${serviceName}"`);
        console.log(pc.green(`✔ "${serviceName}" successfully uninstalled.`));
      }
    } else {
      console.log(pc.red('❌ Unsupported platform.'));
    }
  } catch (error) {
    console.error(pc.red(`❌ Uninstallation failed:`), (error as Error).message);
  }
};
