import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MahameruError } from './mahameru-error';
import { createRequire } from 'node:module';
import { MahameruContainerError } from './mahameru-container-error';

const runtimeRequire = createRequire(__filename);

export type ClassConstructor<T = any> = new (...args: any[]) => T;
export type MahameruContainerOptions = {
    modulesDir: string
}

export class MahameruContainer {
    private options: MahameruContainerOptions
    private instances = new Map<ClassConstructor, any>();

    constructor(options: MahameruContainerOptions) {
        this.options = options
    }

    clear() {
        this.instances.clear();
    }

    register<T>(ClassTarget: ClassConstructor<T>, instance: T) {
        this.instances.set(ClassTarget, instance);
    }

    unregister<T>(ClassTarget: ClassConstructor<T>) {
        this.get(ClassTarget);

        this.instances.delete(ClassTarget);
    }

    get<T>(ClassTarget: ClassConstructor<T>): T {
        const instance = this.instances.get(ClassTarget);

        if (!instance) {
            throw new MahameruError(`Dependency '${ClassTarget.name}' is not found in the container.`);
        }

        return instance;
    }

    async discover() {
        if (!existsSync(this.options.modulesDir))
            return;

        const folders = readdirSync(this.options.modulesDir, { withFileTypes: true });
        const moduleCache = new Map<string, Record<string, unknown>>();

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const servicePath = this.resolveModuleFilePath(folder.name, 'service');

                if (servicePath) {
                    const module = this.loadModule(servicePath, moduleCache);
                    const ServiceClass = this.getExportedClass(module, servicePath);

                    this.register(ServiceClass, new ServiceClass());
                }
            }
        }

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const controllerPath = this.resolveModuleFilePath(folder.name, 'controller');
                const servicePath = this.resolveModuleFilePath(folder.name, 'service');

                if (controllerPath) {
                    const controllerModule = this.loadModule(controllerPath, moduleCache);
                    const ControllerClass = this.getExportedClass(controllerModule, controllerPath);

                    if (servicePath) {
                        const serviceModule = this.loadModule(servicePath, moduleCache);
                        const ServiceClass = this.getExportedClass(serviceModule, servicePath);
                        const injectedService = this.get(ServiceClass);

                        this.register(ControllerClass, new ControllerClass(injectedService));
                    } else {
                        this.register(ControllerClass, new ControllerClass());
                    }
                }
            }
        }
    }

    private loadModule(filePath: string, moduleCache?: Map<string, Record<string, unknown>>) {
        const resolvedPath = path.resolve(filePath);

        if (moduleCache?.has(resolvedPath)) {
            return moduleCache.get(resolvedPath)!;
        }

        if (runtimeRequire.cache[resolvedPath]) {
            delete runtimeRequire.cache[resolvedPath];
        }

        const loadedModule = runtimeRequire(resolvedPath) as Record<string, unknown>;
        moduleCache?.set(resolvedPath, loadedModule);

        return loadedModule;
    }

    private resolveModuleFilePath(folderName: string, moduleType: 'service' | 'controller') {
        const candidates = [
            path.join(this.options.modulesDir, folderName, `${moduleType}.ts`),
            path.join(this.options.modulesDir, folderName, `${moduleType}.js`)
        ];

        for (const candidate of candidates)
            if (existsSync(candidate))
                return candidate;

        return null;
    }

    private getExportedClass(module: Record<string, unknown>, filePath: string) {
        const ExportedClass = Object.values(module)[0];

        if (typeof ExportedClass !== 'function')
            throw new MahameruContainerError(Object.keys(module)[0], filePath, `Module '${Object.keys(module)[0]}' does not export a class that can be registered.`);

        return ExportedClass as ClassConstructor;
    }
}
