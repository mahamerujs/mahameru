import { spawn } from "node:child_process";
import path from "node:path";

export default async function onStart() {
    console.log('\x1b[36m%s\x1b[0m', '▲ Mahameru - Starting production server...');

    const distPath = path.join(process.cwd(), '.mahameru', 'index.js');

    const child = spawn('node', [distPath], {
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
    });

    child.on('close', (code) => {
        process.exit(code ?? 0);
    });
}
