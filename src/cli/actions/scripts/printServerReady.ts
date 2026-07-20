export function printServerReady({ mode, dev, host, port }: { mode: MahameruMode, dev: boolean, host: string, port: number }) {
    console.log('\x1b[32m Mahameru Server Ready!\x1b[0m');
    console.log(`   \x1b[1mMode:\x1b[22m    \x1b[36m${mode}\x1b[0m`);
    console.log(`   \x1b[1mLocal:\x1b[22m   \x1b[36mhttp://${host}:${port}\x1b[0m`);
    console.log(`   \x1b[1mHost:\x1b[22m    ${host}`);
    console.log(`   \x1b[1mPort:\x1b[22m    ${port}\n`);
    console.log('\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n');
}
