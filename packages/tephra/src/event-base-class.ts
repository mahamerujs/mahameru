import { BaseClass, type BaseClassOptions } from './base-class.js';
import { EventEmitter } from './event-emitter.js';

export abstract class EventBaseClass<
  Events extends Record<string, unknown[]>,
  O extends BaseClassOptions = BaseClassOptions,
> extends BaseClass<O> {
  protected readonly events = new EventEmitter<Events>();

  public on = this.events.on.bind(this.events);
  public off = this.events.off.bind(this.events);
  public once = this.events.once.bind(this.events);
  public removeAllListeners = this.events.removeAllListeners.bind(this.events);

  protected emit = this.events.emit.bind(this.events);
}
