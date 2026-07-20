import { PackageJson } from '../cli/actions/scripts/types';
import type { ChildProcess } from 'node:child_process';

export * from './socket';

export interface StrictServerOptions {
    port: number;
    host: string;
}

export type Project = {
    id: number;
    pid: number | undefined;
    createdAt: string;
    isDisabled: boolean;
    name: string;
    description?: string;
    version: string;
    mode: 'development' | 'production';
    rootPath: string;
    entryFilePath?: string;
    logDirPath: string;
    port: number;
    host: string;
    status: 'running' | 'stopped' | 'errored' | 'starting' | 'stopping';
    isLastStatusIsRunning?: boolean;
    packageJson: Payload['packageJson'];
}

export type ManagedProject = Project & {
    child?: ChildProcess;
}

export type Payload = {
    packageJson: PackageJson & { name: string; version: string };
    projectRoot: string
    logDirPath: string;
    port: number
    host: string
    entryFilePath?: string
}

export type PayloadDelete = Pick<Payload, 'packageJson' | 'projectRoot'>
export type ProjectNamePayload = Pick<Payload['packageJson'], 'name'>;
export type ProcessResponse<T> = { success: true; data: T } | { success: false; error: string };
