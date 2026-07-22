export default class MahameruError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MahameruError';

        Object.setPrototypeOf(this, MahameruError.prototype);
        Error.captureStackTrace(this, this.constructor);
    }
}
