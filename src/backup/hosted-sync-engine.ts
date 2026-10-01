import type {
  SyncEngineMethod,
  SyncEngineMethods,
  SyncEngineRequest,
  SyncEngineTransport,
} from './sync-engine';

const READY_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 120_000;
const RESTARTED_MESSAGE = 'The synchronization engine restarted. Sync again to continue.';
const UNAVAILABLE_MESSAGE = 'The synchronization engine did not start. Sync again to retry.';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Waiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Sends engine requests as JSON over a message channel, such as a WebView bridge. */
export class HostedSyncEngineClient {
  private send: ((message: string) => void) | null = null;
  private instance: string | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly waiters = new Set<Waiter>();
  private readonly demandListeners = new Set<() => void>();
  private demanded = false;

  constructor(
    private readonly readyTimeoutMs = READY_TIMEOUT_MS,
    private readonly requestTimeoutMs = REQUEST_TIMEOUT_MS
  ) {}

  readonly transport: SyncEngineTransport = <M extends SyncEngineMethod>(
    method: M,
    args: Parameters<SyncEngineMethods[M]>
  ) =>
    this.request({ method, args } as SyncEngineRequest) as Promise<
      Awaited<ReturnType<SyncEngineMethods[M]>>
    >;

  /** Whether a caller has needed the engine, so its host can start lazily. */
  get isDemanded(): boolean {
    return this.demanded;
  }

  subscribeToDemand(listener: () => void): () => void {
    this.demandListeners.add(listener);
    return () => this.demandListeners.delete(listener);
  }

  /** Documents live in the engine instance, so a new instance invalidates in-flight work. */
  attach(instance: string, send: (message: string) => void): void {
    if (this.instance !== null && this.instance !== instance) this.rejectPending(RESTARTED_MESSAGE);
    this.instance = instance;
    this.send = send;
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    this.waiters.clear();
  }

  detach(): void {
    this.send = null;
    this.instance = null;
    this.rejectPending(RESTARTED_MESSAGE);
  }

  receive(message: string): void {
    const response = JSON.parse(message) as { id: number; result?: unknown; error?: string };
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error !== undefined) pending.reject(new Error(response.error));
    else pending.resolve(response.result);
  }

  private async request(request: SyncEngineRequest): Promise<unknown> {
    await this.ready();
    const send = this.send;
    if (!send) throw new Error(UNAVAILABLE_MESSAGE);
    this.nextId += 1;
    const id = this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The synchronization engine did not respond. Sync again to retry.'));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        send(JSON.stringify({ id, request }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private ready(): Promise<void> {
    if (this.send) return Promise.resolve();
    if (!this.demanded) {
      this.demanded = true;
      for (const listener of this.demandListeners) listener();
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(UNAVAILABLE_MESSAGE));
        }, this.readyTimeoutMs),
      };
      this.waiters.add(waiter);
    });
  }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }
}
