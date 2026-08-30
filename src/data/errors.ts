export type PersistenceErrorCategory =
  | 'read'
  | 'write'
  | 'remove'
  | 'multi-read'
  | 'multi-write'
  | 'verification'
  | 'serialization'
  | 'validation'
  | 'corruption'
  | 'metadata'
  | 'migration'
  | 'journal'
  | 'routine-recovery'
  | 'conflict';

export class PersistenceError extends Error {
  readonly name = 'PersistenceError';

  constructor(
    readonly category: PersistenceErrorCategory,
    message: string,
    readonly key?: string,
    readonly cause?: unknown
  ) {
    super(message);
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

export function validationError(message: string, key?: string, cause?: unknown): PersistenceError {
  return new PersistenceError('validation', message, key, cause);
}
