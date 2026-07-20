import { rm } from "node:fs/promises";
import { networkInterfaces } from "node:os";

export async function deleteDirIfExists(dirPath: string) {
    return await rm(dirPath, { recursive: true, force: true });
}

export function parsePort(value: string) {
    const parsed = parseInt(value, 10);

    if (isNaN(parsed))
        return undefined;

    return parsed;
}

export function getLocalAddress() {
    const interfaces = networkInterfaces()
    const addresses: string[] = []

    for (const interfaceName in interfaces) {
        const ifaces = interfaces[interfaceName];

        if (ifaces === undefined)
            continue

        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address)
            }
        }
    }

    return addresses
}

export async function waitForMs(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
