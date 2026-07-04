export class MahameruServerError extends Error {
    constructor(message?: string) {
        super(message);
        this.name = 'MahameruServerError';

        Object.setPrototypeOf(this, MahameruServerError.prototype);

        if (Error.captureStackTrace)
            Error.captureStackTrace(this, MahameruServerError);
    }
}
