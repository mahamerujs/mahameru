import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import pc from "picocolors";
import type { StrictServerOptions } from "./scripts/types";
import { dirname, join } from "node:path";
import { APPDATA_DIRNAME, APPDATA_PATH, IS_LINUX, IS_MAC, IS_WINDOWS, USERNAME } from "../../constants";
import { toTitleCase } from "porterman/string-helper";
import ora from "ora";
import { mkdir, writeFile } from "node:fs/promises";
import { chownR } from "../../utils/chownr";

export const install = (serviceName: string) =>
    ({ host, port, cert, key }: StrictServerOptions & { host: string; port: number; cert?: string; key?: string }) => {
        try {
            if (IS_LINUX) {
                serviceName = `${process.env.SUDO_USER ?? USERNAME}-${serviceName}`;

                if (process.getuid && process.getuid() !== 0) {
                    if (!process.execPath || !process.argv[1])
                        throw new Error("Unable to determine the Node executable or CLI entry point.");

                    const args = [
                        process.execPath,
                        process.argv[1],
                        ...process.argv.slice(2)
                    ];

                    const result = spawnSync(
                        'sudo',
                        args,
                        {
                            stdio: 'inherit'
                        }
                    )

                    process.exit(result.status ?? 1);
                }

                onLinux({ serviceName, host, port, cert, key });
            } else if (IS_WINDOWS) {
                let appPath = '';

                try {
                    appPath = execSync(`where mahameru`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

                    if (appPath.includes('\n')) {
                        appPath = appPath.split(/\r?\n/)[0];
                    }

                    onWindows({ serviceName, appPath, host, port, cert, key });
                } catch {
                    throw new Error('Executable "mahameru" not found in PATH.');
                }
            } else if (IS_MAC) {
                onMac({ serviceName, host, port, cert, key });
            } else {
                throw new Error('Unsupported platform');
            }
        } catch (error) {
            console.error(pc.red(`❌ Error: ${(error as Error).message}`));
        }
    }

async function onLinux({ serviceName, host, port, cert, key }: { serviceName: string, host: string, port: number; cert?: string; key?: string }) {
    const servicePath = `/etc/systemd/system/${serviceName}.service`;
    const workingPath = process.env.SUDO_HOME ? join(process.env.SUDO_HOME!, APPDATA_DIRNAME) : APPDATA_PATH;
    const logPath = join(workingPath, 'logs');
    const outLogPath = join(logPath, 'out.log');
    const errorLogPath = join(logPath, 'error.log');

    try {
        if (existsSync(servicePath))
            throw new Error(`Service "${serviceName}" is already registered on this system. Please run uninstall command first if you want to update it.`);

        await mkdir(logPath, { recursive: true });
        await writeFile(outLogPath, '', { mode: 0o600 });
        await writeFile(errorLogPath, '', { mode: 0o600 });

        if (process.env.SUDO_UID && process.env.SUDO_GID) {
            await chownR(workingPath, Number(process.env.SUDO_UID!), Number(process.env.SUDO_GID!));
        }

        const nodeExecutable = process.execPath;
        const systemdConfig = `[Unit]
Description=${toTitleCase(serviceName)}
After=network.target

[Service]
Type=simple
User=${process.env.SUDO_USER ?? USERNAME}
WorkingDirectory=${workingPath}
ExecStart="${nodeExecutable}" "${process.argv[1]}" pm start -d${host ? ` --host ${host}` : ''}${port ? ` --port ${port}` : ''}${cert ? ` --cert ${cert}` : ''}${key ? ` --key ${key}` : ''}
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=append:${workingPath}/logs/out.log
StandardError=append:${workingPath}/logs/error.log

[Install]
WantedBy=multi-user.target
`;

        console.log(pc.cyan(`⏳ Writing service configuration to ${servicePath}...`));
        await writeFile(servicePath, systemdConfig);

        console.log(pc.cyan(`🔄 Reloading systemd daemon & enabling service...`));
        execSync('systemctl daemon-reload');
        execSync(`systemctl enable ${serviceName}`);

        try { execSync(`systemctl stop ${serviceName}`); } catch { }
        execSync(`systemctl start ${serviceName}`);

        console.log(pc.green(`\n🚀 ${toTitleCase(serviceName)} successfully registered as a service!`));
        console.log(`🌍 Mahameru Process Manager running at ${cert && key ? 'https' : 'http'}://${host}:${port}`);
        console.log(`📝 To check service status, run: ${pc.bold(`mahameru pm service status`)}`);
    } catch (err: any) {
        console.error(pc.red(`❌ Failed to register service:`), err.message);
    }
}

async function onWindows({ serviceName, appPath, host, port, cert, key }: { serviceName: string, appPath: string, host: string, port: number; cert?: string; key?: string }) {
    const spinner = ora(`Installing ${serviceName} service...`).start();

    try {
        appPath = appPath + '.cmd'

        const winswExePath = join(APPDATA_PATH, 'winsw', `${serviceName}.exe`);
        const winswXmlPath = join(APPDATA_PATH, 'winsw', `${serviceName}.xml`);

        await mkdir(dirname(winswExePath), { recursive: true });

        if (!existsSync(winswExePath)) {
            spinner.text = 'Downloading assets...';

            const winswUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe';
            const res = await fetch(winswUrl, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
                },
            });

            if (!res.ok)
                throw new Error(`Failed to download WinSW from ${winswUrl}. Status code: ${res.status}`);

            const buffer = await res.arrayBuffer();
            await writeFile(winswExePath, Buffer.from(buffer));
            spinner.succeed(`Downloading WinSW binary... Done`);
        }

        const appArgs = `pm start -d${host ? ` --host ${host}` : ''}${port ? ` --port ${port}` : ''} ${cert ? ` --cert ${cert}` : ''}${key ? ` --key ${key}` : ''}`;

        const xmlContent = `<service>
          <id>mahameru-pm</id>
          <name>${toTitleCase(serviceName)}</name>
          <description>${toTitleCase(serviceName)}</description>
          <executable>cmd.exe</executable>
          <arguments>/c "${appPath}" ${appArgs}</arguments>
          <log mode="roll"></log>
        </service>`;

        await writeFile(winswXmlPath, xmlContent, 'utf8');

        spinner.text = `Registering windows service...`

        execSync(`"${winswExePath}" install && "${winswExePath}" start`, { cwd: APPDATA_PATH });
        spinner.succeed(`\n🚀 ${toTitleCase(serviceName)} successfully registered as a service!`)

        console.log(`🌍 ${toTitleCase(serviceName)} running at ${cert && key ? 'https' : 'http'}://${host}:${port}`);
        console.log(`📝 To check service status, run:\n  -  ${pc.bold(`mahameru pm service status`)}`);
    } catch (error) {
        console.error(pc.red(`❌ Error: ${(error as Error).message}`));
        spinner.fail(`Make sure you are running CMD/PowerShell as an Administrator.`)
    }
}

async function onMac({ serviceName, host, port, cert, key }: { serviceName: string, host: string, port: number; cert?: string; key?: string }) {
    const spinner = ora(`Installing ${serviceName} service...`).start();

    try {
        const xmlContent = `<plist version="1.0">
          <dict>
            <key>Label</key>
            <string>${serviceName}</string>
            <key>ProgramArguments</key>
            <array>
              <string>${process.argv[1]}</string>
              <string>pm</string>
              <string>start</string>
              <string>-d${host ? ` --host ${host}` : ''}${port ? ` --port ${port}` : ''} ${cert ? ` --cert ${cert}` : ''}${key ? ` --key ${key}` : ''}</string>
            </array>
            <key>RunAtLoad</key>
            <true/>
          </dict>
        </plist>`;

        const plistPath = join(APPDATA_PATH, 'com.apple.LaunchServices', `${serviceName}.plist`);

        await mkdir(dirname(plistPath), { recursive: true });

        await writeFile(plistPath, xmlContent, 'utf8');
        execSync(`launchctl load "${plistPath}"`, { cwd: APPDATA_PATH });
        spinner.succeed(`\n🚀 ${toTitleCase(serviceName)} successfully registered as a service!`);

        console.log(`🌍 ${toTitleCase(serviceName)} running at ${cert && key ? 'https' : 'http'}://${host}:${port}`);
        console.log(`📝 To check service status, run:\n  -  ${pc.bold(`mahameru pm service status`)}`);
    } catch (error) {
        console.error(pc.red(`❌ Error: ${(error as Error).message}`));
    }
}
