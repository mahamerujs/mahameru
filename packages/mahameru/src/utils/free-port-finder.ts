import net from 'node:net';

/**
 * 
 * @param startPort number
 * @returns number
 * @default 3000
 */
export async function freePortFinder(startPort = 3000) {
    let port = startPort;
    const plusPort = 999;
    const maxPort = startPort + plusPort;

    while (port < maxPort) {
        try {
            const availablePort = await checkPort(port);

            return availablePort;
        } catch (error) {
            port++;
        }
    }

    throw new Error(`Port ${startPort} - ${plusPort} is not available`);
}

function checkPort(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                reject(err);
            } else {
                reject(err);
            }
        });

        server.once('listening', () => {
            server.close(() => resolve(port));
        });

        server.listen(port, '127.0.0.1');
    });
}

export function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                reject(false);
            } else {
                reject(false);
            }
        });

        server.once('listening', () => {
            server.close(() => resolve(true));
        });

        server.listen(port, '127.0.0.1');
    });
}
