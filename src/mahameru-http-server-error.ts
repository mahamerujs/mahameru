export class MahameruHttpServerError extends Error {
    public readonly statusCode: number = 500;
    public readonly details?: string;

    constructor(details?: string) {
        super('Internal Server Error');
        this.name = 'MahameruHttpServerError';
        this.details = details;

        Object.setPrototypeOf(this, MahameruHttpServerError.prototype);

        if (Error.captureStackTrace)
            Error.captureStackTrace(this, MahameruHttpServerError);
    }
}
