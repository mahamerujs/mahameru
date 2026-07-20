import net from 'node:net';
import type { StrictServerOptions } from './scripts/types';
import { getProjectJson } from '../../utils/get-package-json';
import ora from 'ora';
import pc from 'picocolors';
import { ManagedProject } from '../../types';
import { IPC_SOCKET_PATH } from '@/constants';

export const stopFork = (rootPath: string, version: string) => async ({ host, port }: StrictServerOptions) => {
    try {
        console.log(`${pc.bold(pc.cyan('▲ Mahameru'))} ${pc.dim(`CLI v${version}`)}\n`);
        const packageJson = await getProjectJson(rootPath);
        const spinner = ora('Checking available port...').start();
        const client = net.createConnection({ path: IPC_SOCKET_PATH }, () => {
            client.write(JSON.stringify({
                command: 'STOP',
                payload: {
                    name: packageJson.name
                }
            }));
        });

        client.on('data', (rawData) => {
            const { success, message, data } = JSON.parse(rawData.toString()) as { success: boolean, message?: string, data: ManagedProject };

            if (success) {
                console.log(data)
            } else {
                spinner.fail(`${pc.red('[Mahameru]')} ${message}`);
            }

            process.exit(0);
        });
    } catch (error) {
        console.error(error);

        process.exit(1);
    }
}