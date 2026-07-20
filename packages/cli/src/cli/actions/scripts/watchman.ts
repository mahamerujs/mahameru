import { EventEmitter } from 'events';
import { existsSync, statSync } from 'fs';
import { watch as watchPromise } from 'fs/promises';
import path from 'path';

export type WatchmanEventType = 'change' | 'create' | 'delete' | 'rename';

export interface WatchmanPayload {
    event: WatchmanEventType;
    filePath: string;
    oldFilePath?: string;
}

export interface Watchman {
    on(event: 'all', listener: (payload: WatchmanPayload) => void): this;
    on(event: WatchmanEventType, listener: (payload: WatchmanPayload) => void): this;
}

type WatchTarget = {
    original: string;
    normalized: string;
    absolute: string;
    kind: 'directory' | 'file' | 'glob';
};

type WatchRoot = {
    watchPath: string;
    recursive: boolean;
};

const GLOB_CHARS = /[*?[\]{}]/;
const EVENT_DEDUPE_WINDOW_MS = 80;

export class Watchman extends EventEmitter {
    protected targets: WatchTarget[];
    protected abortControllers: AbortController[] = [];
    protected renameBuffer: { filename: string; timestamp: number; watcherRoot: string }[] = [];
    protected bufferTimeout: NodeJS.Timeout | null = null;
    protected recentEvents = new Map<string, number>();

    constructor(target: string | string[]) {
        super();

        const values = Array.isArray(target) ? target : [target];
        this.targets = values.map((value) => this.createTarget(value));
    }

    public async start(): Promise<void> {
        this.stop();

        const watchRoots = this.resolveWatchRoots();

        if (watchRoots.length === 0) {
            console.warn('[Watchman] No files or directories matched the configured watch targets.');
            return;
        }

        for (const root of watchRoots) {
            const abortController = new AbortController();
            this.abortControllers.push(abortController);

            const { signal } = abortController;

            (async () => {
                try {
                    const watcher = watchPromise(root.watchPath, { recursive: root.recursive, signal });

                    for await (const event of watcher) {
                        const { eventType, filename } = event;

                        if (!filename) {
                            continue;
                        }

                        const fullPath = path.resolve(root.watchPath, filename);

                        if (!this.matchesTarget(fullPath)) {
                            continue;
                        }

                        if (eventType === 'change') {
                            this.emitEvent({ event: 'change', filePath: fullPath });
                            continue;
                        }

                        if (eventType === 'rename') {
                            this.handleRenameEvent(filename, root.watchPath);
                        }
                    }
                } catch (err: any) {
                    if (err.name !== 'AbortError') {
                        console.error(`[Watchman] Watch error at ${root.watchPath}:`, err);
                    }
                }
            })();
        }
    }

    public stop(): void {
        for (const ac of this.abortControllers) {
            ac.abort();
        }

        this.abortControllers = [];
        this.recentEvents.clear();

        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }

        this.renameBuffer = [];
    }

    protected createTarget(input: string): WatchTarget {
        const normalized = this.normalizePath(input);
        const absolute = path.resolve(input);
        const hasGlob = GLOB_CHARS.test(normalized);

        if (hasGlob) {
            return {
                original: input,
                normalized,
                absolute,
                kind: 'glob'
            };
        }

        const isDirectory = existsSync(absolute) && statSync(absolute).isDirectory();

        return {
            original: input,
            normalized,
            absolute,
            kind: isDirectory ? 'directory' : 'file'
        };
    }

    protected resolveWatchRoots(): WatchRoot[] {
        const roots = new Map<string, WatchRoot>();

        for (const target of this.targets) {
            const watchPath = target.kind === 'glob'
                ? this.getGlobBasePath(target.normalized)
                : target.kind === 'directory'
                    ? target.absolute
                    : path.dirname(target.absolute);
            const resolvedPath = path.resolve(watchPath);
            const recursive = target.kind !== 'file';
            const key = `${resolvedPath}::${recursive}`;

            if (!existsSync(resolvedPath)) {
                continue;
            }

            if (!roots.has(key)) {
                roots.set(key, {
                    watchPath: resolvedPath,
                    recursive
                });
            }
        }

        return Array.from(roots.values());
    }

    protected matchesTarget(filePath: string): boolean {
        const normalizedFilePath = this.normalizePath(path.resolve(filePath));

        return this.targets.some((target) => {
            if (target.kind === 'directory') {
                return normalizedFilePath === target.normalized
                    || normalizedFilePath.startsWith(`${target.normalized}/`);
            }

            if (target.kind === 'file') {
                return normalizedFilePath === target.normalized;
            }

            return path.matchesGlob(normalizedFilePath, target.normalized);
        });
    }

    protected emitEvent(payload: WatchmanPayload): void {
        if (this.shouldDeduplicate(payload)) {
            return;
        }

        this.emit(payload.event, payload);
        this.emit('all', payload);
    }

    protected shouldDeduplicate(payload: WatchmanPayload): boolean {
        const normalizedFilePath = this.normalizePath(path.resolve(payload.filePath));
        const key = `${payload.event}:${normalizedFilePath}:${payload.oldFilePath ? this.normalizePath(path.resolve(payload.oldFilePath)) : ''}`;
        const now = Date.now();
        const previous = this.recentEvents.get(key);

        this.recentEvents.set(key, now);

        for (const [eventKey, timestamp] of this.recentEvents) {
            if (now - timestamp > EVENT_DEDUPE_WINDOW_MS) {
                this.recentEvents.delete(eventKey);
            }
        }

        return typeof previous === 'number' && now - previous <= EVENT_DEDUPE_WINDOW_MS;
    }

    protected handleRenameEvent(filename: string, watcherRoot: string): void {
        this.renameBuffer.push({ filename, timestamp: Date.now(), watcherRoot });

        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }

        this.bufferTimeout = setTimeout(() => {
            this.processRenameBuffer();
            this.renameBuffer = [];
        }, 20);
    }

    protected processRenameBuffer(): void {
        const filteredItems = this.renameBuffer
            .map((item) => ({
                ...item,
                fullPath: path.resolve(item.watcherRoot, item.filename)
            }))
            .filter((item) => this.matchesTarget(item.fullPath));

        if (filteredItems.length === 2) {
            const [itemA, itemB] = filteredItems;
            const existsA = existsSync(itemA.fullPath);
            const existsB = existsSync(itemB.fullPath);

            if (!existsA && existsB) {
                this.emitEvent({ event: 'rename', oldFilePath: itemA.fullPath, filePath: itemB.fullPath });
                return;
            }

            if (existsA && !existsB) {
                this.emitEvent({ event: 'rename', oldFilePath: itemB.fullPath, filePath: itemA.fullPath });
                return;
            }
        }

        for (const item of filteredItems) {
            if (existsSync(item.fullPath)) {
                this.emitEvent({ event: 'create', filePath: item.fullPath });
            } else {
                this.emitEvent({ event: 'delete', filePath: item.fullPath });
            }
        }
    }

    protected getGlobBasePath(pattern: string): string {
        const segments = pattern.split('/');
        const baseSegments: string[] = [];

        for (const segment of segments) {
            if (GLOB_CHARS.test(segment)) {
                break;
            }

            baseSegments.push(segment);
        }

        if (baseSegments.length === 0) {
            return path.dirname(pattern);
        }

        return baseSegments.join('/');
    }

    protected normalizePath(value: string) {
        return value.replace(/\\/g, '/');
    }
}
