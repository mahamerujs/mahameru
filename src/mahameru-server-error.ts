export class MahameruServerError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'MahameruServerError';

        Error.captureStackTrace(this, MahameruServerError);
    }
}
