import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { MahameruError } from './index.js';

export type ClassConstructor<T = any> = new (...args: any[]) => T;

export class MahameruContainer {
    private instances = new Map<ClassConstructor, any>();

    register<T>(ClassTarget: ClassConstructor<T>, instance: T) {
        this.instances.set(ClassTarget, instance);
    }

    get<T>(ClassTarget: ClassConstructor<T>): T {
        const instance = this.instances.get(ClassTarget);

        if (!instance) {
            throw new MahameruError(`Dependency '${ClassTarget.name}' is not found in the container.`);
        }

        return instance;
    }

    async autoDiscover(modulesDir: string) {
        if (!fs.existsSync(modulesDir))
            return;

        const folders = fs.readdirSync(modulesDir, { withFileTypes: true });

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const servicePath = this.resolveModuleFilePath(modulesDir, folder.name, 'service');

                if (servicePath) {
                    const fileUrl = pathToFileURL(path.resolve(servicePath)).href;
                    const module = await import(/* webpackIgnore: true */ fileUrl);
                    const ServiceClass = this.getExportedClass(module, servicePath);

                    this.register(ServiceClass, new ServiceClass());
                }
            }
        }

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const controllerPath = this.resolveModuleFilePath(modulesDir, folder.name, 'controller');
                const servicePath = this.resolveModuleFilePath(modulesDir, folder.name, 'service');

                if (controllerPath) {
                    const controllerUrl = pathToFileURL(path.resolve(controllerPath)).href;
                    const controllerModule = await import(/* webpackIgnore: true */ controllerUrl);
                    const ControllerClass = this.getExportedClass(controllerModule, controllerPath);

                    if (servicePath) {
                        const serviceUrl = pathToFileURL(path.resolve(servicePath)).href;
                        const serviceModule = await import(/* webpackIgnore: true */ serviceUrl);
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

    private resolveModuleFilePath(modulesDir: string, folderName: string, moduleType: 'service' | 'controller') {
        const candidates = [
            path.join(modulesDir, folderName, `${moduleType}.ts`),
            path.join(modulesDir, folderName, `${moduleType}.js`)
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate))
                return candidate;
        }

        return null;
    }

    private getExportedClass(module: Record<string, unknown>, filePath: string) {
        const ExportedClass = Object.values(module)[0];

        if (typeof ExportedClass !== 'function') {
            throw new MahameruError(`Module '${filePath}' does not export a class that can be registered.`);
        }

        return ExportedClass as ClassConstructor;
    }
}
