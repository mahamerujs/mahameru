import pc from 'picocolors';
import type { TsErrorReport } from '../server/mahameru-dev-server';

export function formatTypescriptError(errors: TsErrorReport[]) {
    let message = errors.map(m => {
        if (m.type === "file")
            return `${pc.red(pc.bold("[Typescript Error]"))} ${pc.underline(`${m.filePath}:${m.line! + 1}:${m.character! + 1}`)}:\n${pc.cyan(m.rawMessage)}`;

        return `${pc.red(pc.bold("[Typescript Error]"))}: ${pc.cyan(m.rawMessage)}`;
    }).join('\n\n')

    message += pc.yellow(`\n\nWe found ${pc.white(errors.length)} errors in your code. Fix them and try again. Cheers! 🍻\n\n`);
    message += '\x1b[90mPress Ctrl+C to stop the server\x1b[0m\n'

    return message;
}
