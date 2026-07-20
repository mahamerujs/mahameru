export default function stop({ rootPath, version }: { rootPath: string; version: string }) {
    return async ({ host, port }: { host: string; port: number }) => {
        console.log('MahameruJS STOP v', version);
        console.log('rootPath:', rootPath);
        console.log('Mode:', 'production');
        console.log('Host:', host);
        console.log('Port:', port);
    }
}
