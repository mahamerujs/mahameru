import { existsSync } from 'node:fs';
import { IPC_SOCKET_PATH, PM_CONFIG_FILE_PATH } from '../constants';
import pc from 'picocolors';
import { exists } from '../utils/exists';
import { ProcessManagerConfig } from '@/types/pm.config';
import { readFile } from 'node:fs/promises';

export const mpmStatus = (version: string) => async () => {
  console.log(
    `${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`Process Manager Status v${version}`)}\n`,
  );

  if (existsSync(IPC_SOCKET_PATH)) {
    const isFileExist = await exists(PM_CONFIG_FILE_PATH);

    if (!isFileExist) {
      console.error(pc.red(`Error: ${PM_CONFIG_FILE_PATH} file not found.`));

      process.exit(1);
    }

    const pmConfig = JSON.parse(
      await readFile(PM_CONFIG_FILE_PATH, 'utf-8'),
    ) as ProcessManagerConfig;
    const isHttps = pmConfig.cert && pmConfig.key;
    const host = pmConfig.host;
    const port = pmConfig.port;
    const adminLogin = pmConfig.logins.find((login) => login.role === 'admin');

    let data = '';
    data += `         ${pc.bold(pc.green('PID'))}: ${process.pid}\n`;
    data += `         ${pc.bold(pc.green('URL'))}: ${isHttps ? 'https' : 'http'}://${host}:${port}\n`;
    data += `${pc.bold(pc.green('API Endpoint'))}: ${isHttps ? 'https' : 'http'}://${host}:${port}/api/process\n`;

    if (adminLogin) {
      data += `    ${pc.bold(pc.green('Username'))}: ${pc.cyan(adminLogin.username)}\n`;
      data += `    ${pc.bold(pc.green('password'))}: ${pc.cyan(adminLogin.password)}\n`;
    }

    data += `\n${pc.dim('Press Ctrl+C to stop the server')}\n`;

    console.log(data);
  } else {
    console.log(`${pc.bold(pc.red('Process Manager is not running'))}\n`);
  }
};
