export class MahameruContainerError extends Error {
    public readonly path: string;
    public readonly moduleName: string;

    constructor(moduleName: string, path: string, message?: string) {
        super(message || 'Cannot load module: ' + moduleName);
        this.name = 'MahameruHttpServerError';
        this.path = path;
        this.moduleName = moduleName;

        Error.captureStackTrace(this, MahameruContainerError);
    }
}
