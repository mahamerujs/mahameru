import type { IncomingMessage } from "node:http";

export class MahameruRequest {
    public method: string;
    public url: string;
    public headers: any;
    public query: URLSearchParams;
    public path: string;
    private rawReq: IncomingMessage;

    constructor(request: IncomingMessage) {
        this.rawReq = request;
        this.method = request.method || 'GET';
        this.url = request.url || '/';
        this.path = request.url?.split('?')[0] || '/';
        const parsedUrl = new URL(this.url, `http://${request.headers.host || 'localhost'}`);
        this.query = parsedUrl.searchParams;
        this.headers = request.headers;
    }

    async json(): Promise<any> {
        return new Promise((resolve, reject) => {
            let body = '';
            this.rawReq.on('data', (chunk) => { body += chunk.toString(); });
            this.rawReq.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (err) {
                    reject(new Error('Invalid JSON Body'));
                }
            });
            this.rawReq.on('error', (err) => reject(err));
        });
    }
}