type RoutineChangeListener = () => void;

const listeners = new Set<RoutineChangeListener>();

const WRITE_METHODS = new Set([
  'writeActive',
  'clearActive',
  'finalize',
  'persistAwaiting',
  'persistCancellation',
  'appendHistory',
  'recoverJournal',
]);

export function subscribeRoutineChanges(listener: RoutineChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyRoutineChanged(): void {
  for (const listener of listeners) listener();
}

/** Notifies routine listeners after each persisted active-routine write. */
export function observeRoutineWrites<T extends object>(repository: T): T {
  return new Proxy(repository, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || !WRITE_METHODS.has(String(property))) return value;
      return async (...args: unknown[]) => {
        const result: unknown = await (value as (...input: unknown[]) => unknown).apply(
          target,
          args
        );
        notifyRoutineChanged();
        return result;
      };
    },
  });
}
