export function toKebabCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function toPascalCase(str: string) {
    return str.replace(/(?:^|[-_])[a-z]/g, (match) => match.toUpperCase());
}

export function toCamelCase(str: string) {
    return str.replace(/(?:^|[-_])[a-z]/g, (match) => match.toUpperCase());
}

export function toTitleCase(str: string) {
    return str.replace(/(?:^|[-_])[a-z]/g, (match) => match.toUpperCase());
}

export function toSnakeCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

export function toConstantCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
}

export function toDotCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1.$2').toLowerCase();
}

export function toSpaceCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function toDashCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function toPathCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1/$2').toLowerCase();
}

export function toHeaderCase(str: string) {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}