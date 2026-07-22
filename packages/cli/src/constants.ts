import { join } from 'node:path';
import os from 'node:os';

export const IS_SUPPORTED_PLATFORM =
  process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux';
export const IS_WINDOWS = process.platform === 'win32';
export const IS_MAC = process.platform === 'darwin';
export const IS_LINUX = process.platform === 'linux';
export const APPDATA_DIRNAME = '.mahameru';
export const APPDATA_PATH = (() => {
  if (IS_WINDOWS) return join(process.env.USERPROFILE!, APPDATA_DIRNAME);

  if (IS_MAC) return join(process.env.HOME!, 'Library', 'Application Support', APPDATA_DIRNAME);

  if (IS_LINUX) return join(process.env.HOME!, APPDATA_DIRNAME);

  throw new Error('Unsupported platform');
})();
export const USERNAME = os.userInfo().username;
export const PROJECTS_FILE_PATH = join(APPDATA_PATH, 'projects.json');
export const PM_CONFIG_FILE_PATH = join(APPDATA_PATH, 'pm.config.json');
export const IP_SOCKET_NAME = process.env.SUDO_USER
  ? `${process.env.SUDO_USER}-mpm_ipc`
  : `${USERNAME}-mpm_ipc`;
export const IPC_SOCKET_PATH =
  process.platform === 'win32' ? `\\\\.\\pipe\\${IP_SOCKET_NAME}` : `/tmp/${IP_SOCKET_NAME}.sock`;
export const MAHAMERU_TITLE = '\x1b[36m▲ Mahameru\x1b[39m';
