import { BaseClass } from '@mahameru/tephra';

export type BaseContainerOptions = {
  dev: boolean;
  debug: boolean;
  filePaths: string[];
};

export type ContainerItem<T = unknown> = {
  name: string;
  item: T;
};

export type ContainerItems<T = unknown> = Map<string, ContainerItem<T>[]>;

export abstract class Container<
  O extends BaseContainerOptions = BaseContainerOptions,
> extends BaseClass<O> {
  #items: ContainerItems = new Map();
  protected filePaths: string[] = [];

  constructor(name: string, options: O) {
    super(name, options);
  }

  public get items(): ContainerItems {
    return this.#items;
  }

  public get<T>(filePath: string) {
    return this.#items.get(filePath) as ContainerItem<T>[] | undefined;
  }

  public async scan() {
    this.logger.debug(`Scanning file paths...`);

    await this.parseFilePaths();

    await Promise.all(this.filePaths.map((filePath) => this.loadModule(filePath)));

    this.logger.debug(`Scanning file paths... Done`);

    if (Array.from(this.#items.values()).length > 0) this.logger.debug('Found', this.#items);
  }

  public async initialize(): Promise<void> {}

  public async onDevHRM(changedFile: string): Promise<boolean> {
    await this.loadModule(changedFile);

    return await this._onDevHRM(changedFile);
  }

  protected set(filePath: string, items: ContainerItem[]) {
    this.#items.set(filePath, items);
  }

  protected async loadModule(filePath: string) {
    const module = await this.require(filePath);

    if (!module) return;

    const items: ContainerItem[] = Object.entries(module).map(([name, item]) => ({
      name,
      item: item,
    }));

    this.set(filePath, items);
  }

  protected abstract parseFilePaths(): Promise<string[]>;
  protected abstract _onDevHRM(filePath: string): Promise<boolean>;
}
