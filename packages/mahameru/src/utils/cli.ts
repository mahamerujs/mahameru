import readline from 'readline';

interface OraSpinner {
    frame: () => string;
    isActive?: boolean;
    [key: string]: any;
}

const cursor = {
    /**
     * Hides the terminal cursor (typically used before starting CLI rendering).
     */
    hide(): void {
        process.stdout.write('\u001B[?25l');
    },

    /**
     * Shows the terminal cursor (must be called when the application finishes or exits).
     */
    show(): void {
        process.stdout.write('\u001B[?25h');
    },

    /**
     * Moves the cursor to a specific coordinate.
     * @param x - The column coordinate (horizontal position).
     * @param y - The row coordinate (vertical position).
     */
    moveTo(x: number, y?: number): void {
        readline.cursorTo(process.stdout as unknown as NodeJS.WritableStream, x, y);
    },

    /**
     * Moves the cursor relative to its current position.
     * @param dx - Horizontal offset (positive to the right, negative to the left).
     * @param dy - Vertical offset (positive down, negative up).
     */
    move(dx: number, dy: number): void {
        readline.moveCursor(process.stdout as unknown as NodeJS.WritableStream, dx, dy);
    }
};

/**
 * Updates the CLI screen from the current cursor position downwards.
 * @param header - Optional persistent header text to display at the top.
 * @param content - The main content to display (either a multiline string or an array of lines).
 * @param spinner - Optional Ora spinner instance to integrate automatically.
 */
const updateScreen = (header: string | undefined, content: string | string[], spinner?: OraSpinner): void => {
    let lines: string[] = Array.isArray(content)
        ? [...content]
        : String(content).split('\n');

    if (spinner) {
        const frame = spinner.frame();

        if (lines.length > 0) {
            lines[0] = `${frame} ${lines[0]}`;
        } else {
            lines.push(frame);
        }
    }

    const finalLines: string[] = [];

    if (header !== undefined) {
        const headerLines = String(header).split('\n') + '\n';

        finalLines.push(headerLines);
    }

    finalLines.push(...lines);

    const stream = process.stdout as unknown as NodeJS.WritableStream;

    readline.cursorTo(stream, 0, 0);
    readline.clearScreenDown(stream);
    process.stdout.write(finalLines.join('\n'));
};

/**
 * Hard clears the entire terminal screen and resets the scrollback buffer.
 * Works consistently across different OS terminals (VS Code, CMD, Git Bash, macOS).
 */
const clearScreen = (): void => {
    process.stdout.write('\u001B[3J\u001B[2J\u001B[H');

    if (process.platform === 'win32') {
        process.stdout.write('\x1Bc');
    }
};

const cli = { cursor, updateScreen, clearScreen };

export default cli;
