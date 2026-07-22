type Listener<T extends unknown[]> = (...args: T) => void;

type WrappedListener<T extends unknown[]> = Listener<T> & {
  original?: Listener<T>;
};

export class EventEmitter<Events extends Record<string, unknown[]>> {
  private listeners = new Map<keyof Events, Listener<never[]>[]>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);

    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.push(listener as unknown as Listener<never[]>);
    }
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const list = this.listeners.get(event);

    if (!list) return;

    const index = list.findIndex(
      (l) =>
        l === (listener as unknown as Listener<never[]>) ||
        (l as WrappedListener<never[]>).original === (listener as unknown as Listener<never[]>),
    );

    if (index !== -1) list.splice(index, 1);
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const list = this.listeners.get(event);

    if (list) {
      [...list].forEach((listener) => {
        (listener as unknown as Listener<Events[K]>)(...args);
      });
    }
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const onceListener: WrappedListener<Events[K]> = (...args: Events[K]) => {
      listener(...args);
      this.off(event, onceListener);
    };

    onceListener.original = listener;

    this.on(event, onceListener);
  }

  removeAllListeners<K extends keyof Events>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
