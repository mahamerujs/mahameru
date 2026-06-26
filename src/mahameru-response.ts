export class MahameruResponse {
    public body: any;
    public status: number;
    public headers: Record<string, string>;

    constructor(body: any, init?: { status?: number; headers?: Record<string, string> }) {
        this.body = body;
        this.status = init?.status || 200;
        this.headers = init?.headers || { 'Content-Type': 'application/json' };
    }

    static json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
        return new MahameruResponse(body, init);
    }
}
