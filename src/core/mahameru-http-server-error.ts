export class MahameruHttpServerError {
    public readonly name: string = 'MahameruHttpServerError';
    public readonly stack?: string;

    constructor(public message: string) {
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, MahameruHttpServerError);
        } else {
            this.stack = (new Error()).stack;
        }
    }

    toString(): string {
        return `${this.name}: ${this.message}`;
    }
}
