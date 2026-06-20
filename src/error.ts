export default class MahameruError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MahameruError";
        this.message = message;
        Error.captureStackTrace(this, this.constructor);
    }

    toString() {
        return `${this.name}: ${this.message}`;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message
        };
    }
}
