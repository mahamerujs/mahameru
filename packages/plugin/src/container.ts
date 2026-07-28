import { BaseClass } from '@mahameru/tephra';

export type BaseContainerOptions = {
  dev: boolean;
  debug: boolean;
};

export class Container<O extends BaseContainerOptions = BaseContainerOptions> extends BaseClass<O> {
  constructor(name: string, options: O) {
    super(name, options);
  }
}
