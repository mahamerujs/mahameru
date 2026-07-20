export function clearScreen() {
    process.stdout.write('\u001b[2J\u001b[0;0H\u001b[3J');
}

export function clearScreenKeepCursor() {
    process.stdout.write('\x1B[H\x1B[0J');
}

export function toCamelCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
        .replace(/^[A-Z]/, (char) => char.toLowerCase());
}

export function toPascalCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
        .replace(/^[a-z]/, (char) => char.toUpperCase());
}

export function toKebabCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase()
        .replace(/^-+|-+$/g, '');
}

export function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase()
        .replace(/^_+|_+$/g, '');
}

export function toTitleCase(str: string): string {
    return str
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
