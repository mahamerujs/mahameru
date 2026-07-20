import { spawn } from "node:child_process";

export function runNodeScript(runtimePath: string, args: string[], cwd: string) {
    return new Promise<number>((resolve, reject) => {
        const child = spawn(process.execPath, [runtimePath, ...args], {
            stdio: 'inherit',
            cwd
        });

        child.on('message', (message) => console.log(message));
        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', reject);
    });
}
