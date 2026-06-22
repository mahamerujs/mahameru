import { IncomingMessage } from "http";

export class MahameruRequest {
    public method: string;
    public url: string;
    public headers: any;
    public query: URLSearchParams;
    private rawReq: IncomingMessage;

    constructor(req: IncomingMessage) {
        this.rawReq = req;
        this.method = req.method || 'GET';
        this.url = req.url || '/';

        const parsedUrl = new URL(this.url, `http://${req.headers.host || 'localhost'}`);
        this.query = parsedUrl.searchParams;
        this.headers = req.headers;
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