export class MahameruError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MahameruError';
        this.message = message;

        Error.captureStackTrace(this, this.constructor);
    }
}
