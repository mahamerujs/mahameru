import { APPDATA_PATH } from '../../constants';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

export const startService = (serviceName: string) => () => {
    const isLinux = process.platform === 'linux';
    const isWindows = process.platform === 'win32';
    const servicePath = `/etc/systemd/system/${serviceName}.service`;

    try {
        if (isLinux) {
            if (process.getuid && process.getuid() !== 0) {
                throw new Error('This action requires root privileges. Please run with sudo.');
            }

            if (!existsSync(servicePath)) {
                throw new Error(`Service "${serviceName}" is not registered on this system. Please run "mahameru pm service install" first.`);
            }

            console.log(pc.cyan(`🔍 Checking status for service: ${serviceName}...`));

            let isRunning = false;

            try {
                const status = execSync(`systemctl is-active ${serviceName}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
                if (status === 'active') isRunning = true;
            } catch {
                isRunning = false;
            }

            if (!isRunning) {
                console.log(pc.cyan(`🚀 Starting ${serviceName}...`));
                execSync(`systemctl start ${serviceName}`);
                console.log(pc.green(`\n🚀 ${serviceName} has been successfully started.`));
                console.log(`📝 To check service status, run: ${pc.bold(`systemctl status ${serviceName}`)}`);
            } else {
                console.log(pc.yellow(`⚠️ Service "${serviceName}" is already running.`));
            }

        } else if (isWindows) {
            startWindowsService({ serviceName });
        } else {
            console.log(pc.red('❌ Unsupported platform.'));
        }
    } catch (error) {
        console.error(pc.red(`❌ Failed to start service:`), (error as Error).message);
    }
};

function startWindowsService({ serviceName }: { serviceName: string }) {
    try {
        console.log(`Attempting to start service: ${pc.cyan(serviceName)}...`);
        const winswExePath = join(APPDATA_PATH, ' winsw', `${serviceName}.exe`);

        if (existsSync(winswExePath)) {
            execSync(`"${winswExePath}" start`, { cwd: APPDATA_PATH });
            console.log(pc.green(`✔ Success: Service "${serviceName}" has been started.`));
            return;
        }

        console.log(pc.yellow('WinSW binary not found. Falling back to sc.exe...'));
        execSync(`sc start "${serviceName}"`);
        console.log(pc.green(`✔ Success: Service "${serviceName}" has been started via sc.exe.`));

    } catch (error) {
        console.error(pc.red(`❌ Error: Failed to start service: ${(error as Error).message}`));
        console.error('Make sure you are running CMD/PowerShell as an Administrator and the service is installed.');
    }
}
