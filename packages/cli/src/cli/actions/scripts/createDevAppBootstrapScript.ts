
export function createDevAppBootstrapScript(config: Partial<any>) {
    return `
        import mahameru from "mahameru";
        import { relative } from "node:path";

        const app = mahameru(${JSON.stringify(config)});

        process.on('message', (message) => {
            if (message && message.type === 'MAHAMERU_HOT_RELOAD') {
                const fileToClear = message.targetFile;
                
                if (require.cache[fileToClear]) {
                    delete require.cache[fileToClear];
                    console.log("\\x1b[34m▲ [Mahameru HotSwap]\\x1b[0m Memory cleared for: " + relative(process.cwd(), fileToClear));
                }
            }
        });

        app.initialize(${JSON.stringify(config)}).then(() => {
            console.log("\\x1b[32mMahameru Server Ready! 🚀\\x1b[0m\\n");
            console.log("\\x1b[1mMode:\\x1b[22m   \\x1b[36mDevelopment\\x1b[0m");
            console.log("\\x1b[1mHost:\\x1b[22m   \\x1b[36m${config.host}\\x1b[0m");
            console.log("\\x1b[1mPort:\\x1b[22m   \\x1b[36m${config.port}\\x1b[0m");
            console.log("\\x1b[1mURL :\\x1b[22m   \\x1b[36mhttp://${config.host}:${config.port}\\x1b[0m\\n");
        }).catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
}

export function createAppBootstrapScript(config: Partial<any>) {
    return `
        import mahameruModule from "mahameru";
        const {default: mahameru} = mahameruModule
        const app = mahameru(${JSON.stringify(config)});

        app.initialize(${JSON.stringify(config)}).then(() => {
            console.log("\\x1b[32m Mahameru Server Ready! 🚀\\x1b[0m");
            console.log("   \\x1b[1mMode:\\x1b[22m    \\x1b[36m${config.dev ? 'Development' : 'Production'}\\x1b[0m");
            console.log("   \\x1b[1mLocal:\\x1b[22m   \\x1b[36mhttp://${config.host}:${config.port}\\x1b[0m");
            console.log("   \\x1b[1mHost:\\x1b[22m    ${config.host}");
            console.log("   \\x1b[1mPort:\\x1b[22m    ${config.port}\\n");
            console.log("\\x1b[90mPress Ctrl+C to stop server\\x1b[0m\\n");
        }).catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
}
