export class ModuleExits extends Error {
    constructor(name: string, path: string) {
        super('Module `' + name + '` already exists on path `' + path + '`!');

        Object.setPrototypeOf(this, ModuleExits.prototype);
        this.name = this.constructor.name;
    }
}
