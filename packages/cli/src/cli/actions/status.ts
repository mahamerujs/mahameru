import { APPDATA_PATH } from '@/constants';
import { getNodeModulesPath } from '@/utils/getNodeModulesPath';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

export const status = (serviceName: string, version: string) => () => {
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
      const statusData: Record<string, string> = {
        'Service Name': serviceName,
        Installed: 'No',
        State: 'Stopped',
        'Main Process': 'N/A',
        'Memory Usage': 'N/A',
        'CPU Usage': 'N/A',
      };

      if (!existsSync(servicePath)) {
        statusData['Installed'] = pc.red('Not Installed');
        statusData['State'] = pc.red('N/A');
        printTable(statusData, version);
        return;
      }
      statusData['Installed'] = pc.green('Yes');

      try {
        const activeState = execSync(`systemctl show ${serviceName} --property=ActiveState`, {
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim()
          .split('=')[1];
        const subState = execSync(`systemctl show ${serviceName} --property=SubState`, {
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim()
          .split('=')[1];
        const mainPid = execSync(`systemctl show ${serviceName} --property=MainPID`, {
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim()
          .split('=')[1];

        if (activeState === 'active') {
          statusData['State'] = pc.green(`${activeState} (${subState})`);
          statusData['Main Process'] = mainPid && mainPid !== '0' ? mainPid : 'N/A';

          try {
            const memory = execSync(`systemctl show ${serviceName} --property=MemoryCurrent`, {
              stdio: ['ignore', 'pipe', 'ignore'],
            })
              .toString()
              .trim()
              .split('=')[1];
            if (memory && memory !== '[not set]') {
              const mb = (parseInt(memory, 10) / 1024 / 1024).toFixed(2);
              statusData['Memory Usage'] = `${mb} MB`;
            }
          } catch {}

          try {
            const cpu = execSync(`ps -p ${mainPid} -o %cpu`, {
              stdio: ['ignore', 'pipe', 'ignore'],
            })
              .toString()
              .trim()
              .split('\n')[1];
            if (cpu) statusData['CPU Usage'] = `${cpu.trim()}%`;
          } catch {}
        } else if (activeState === 'failed') {
          statusData['State'] = pc.red(`${activeState} (${subState})`);
        } else {
          statusData['State'] = pc.yellow(`${activeState} (${subState})`);
        }
      } catch (err) {
        statusData['State'] = pc.red('Unknown (Error reading systemctl)');
      }

      printTable(statusData, version);
      printRecentLogs(servicePath);
    } else if (isWindows) {
      statusWindowsService({ serviceName, mahameruInstalationPath, version });
    } else {
      console.log(pc.red('❌ Unsupported platform.'));
    }
  } catch (error) {
    console.error(pc.red(`❌ Failed to retrieve service status:`), (error as Error).message);
  }
};

function printTable(data: Record<string, string>, version: string) {
  console.log(`${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`Process Manager Status v${version}`)}`);

  console.log('---------------+---------------------------------------------------');
  for (const [key, value] of Object.entries(data)) {
    const paddedKey = key.padEnd(14, ' ');
    console.log(` ${paddedKey} | ${value}`);
  }
  console.log('---------------+---------------------------------------------------');
}

function printRecentLogs(servicePath: string) {
  try {
    const content = readFileSync(servicePath, 'utf-8');
    const match = content.match(/StandardError=append:(.+)/);

    if (match && match[1]) {
      const logPath = match[1].trim();
      if (existsSync(logPath)) {
        console.log(pc.bold(pc.yellow(`\n📝 Last 3 lines from error log (${logPath}):`)));
        const logLines = readFileSync(logPath, 'utf-8').trim().split('\n');
        const lastLines = logLines.slice(-3);

        if (lastLines.length > 0 && lastLines[0] !== '') {
          lastLines.forEach((line) => console.log(`  ${pc.dim(line)}`));
        } else {
          console.log(pc.dim('  (Log file is empty)'));
        }
        console.log();
      }
    }
  } catch {}
}

function statusWindowsService({
  serviceName,
  mahameruInstalationPath,
  version,
}: {
  serviceName: string;
  mahameruInstalationPath: string;
  version: string;
}) {
  if (process.platform === 'win32') {
    try {
      const winswExePath = join(APPDATA_PATH, 'winsw', `${serviceName}.exe`);
      const winswXmlPath = join(APPDATA_PATH, 'winsw', `${serviceName}.xml`);

      let host: string | null = null;
      let port: string | null = null;

      if (existsSync(winswXmlPath)) {
        try {
          const xmlContent = readFileSync(winswXmlPath, 'utf8');

          const hostMatch = xmlContent.match(/--host\s+([^\s"<]+)/);
          const portMatch = xmlContent.match(/--port\s+([^\s"<]+)/);

          if (hostMatch) host = hostMatch[1];
          if (portMatch) port = portMatch[1];
        } catch (parseError) {}
      }

      const printNetworkDetails = () => {
        if (host) console.log(`Host                : ${pc.cyan(host)}`);
        if (port) console.log(`Port                : ${pc.cyan(port)}`);
        if (port && host) console.log(`URL                 : ${pc.cyan(`http://${host}:${port}`)}`);
      };

      if (existsSync(winswExePath)) {
        try {
          const rawStatus = execSync(`"${winswExePath}" status`, { cwd: mahameruInstalationPath })
            .toString()
            .trim();

          console.log(
            `\n${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`Process Manager Status v${version}`)}\n`,
          );

          if (rawStatus === 'NonExistent') {
            console.log(`Installation status : ${pc.red('Not Installed (NonExistent)')}`);
            console.log(`Service Status      : ${pc.red('-')}`);
          } else {
            console.log(`Installation status : ${pc.green('Installed')}`);
            if (rawStatus === 'Started') {
              console.log(`Service Status      : ${pc.green('● Started (Running)')}`);
            } else if (rawStatus === 'Stopped') {
              console.log(`Service Status      : ${pc.yellow('○ Stopped')}`);
            } else {
              console.log(`Service Status      : ${pc.gray(rawStatus)}`);
            }
            printNetworkDetails();
          }
          return;
        } catch (e) {}
      }

      try {
        const scOutput = execSync(`sc query "${serviceName}"`, {
          stdio: ['pipe', 'pipe', 'ignore'],
        }).toString();

        console.log(
          `\n${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`Process Manager Status v${version}`)}\n`,
        );

        console.log(`Installation status : ${pc.green('Installed')}`);

        if (scOutput.includes('RUNNING')) {
          console.log(`Service Status      : ${pc.green('● Started (Running)')}`);
        } else if (scOutput.includes('STOPPED')) {
          console.log(`Service Status      : ${pc.yellow('○ Stopped')}`);
        } else {
          console.log(`Service Status      : ${pc.gray('Unknown')}`);
        }
        printNetworkDetails();
      } catch (scError) {
        console.log(
          `\n${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`Process Manager Status v${version}`)}\n`,
        );

        console.log(`Installation status : ${pc.red('Not Installed')}`);
        console.log(`Service Status      : ${pc.red('-')}`);
      }
    } catch (error) {
      console.error(pc.red(`❌ Error: ${(error as Error).message}`));
      console.error('Make sure you are running CMD/PowerShell as an Administrator.');
    }
  }
}
