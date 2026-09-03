const COORDINATION_VERSION = 1;
const CHANNEL_NAME = "crm-auth-refresh-v1";
const STORAGE_KEY = "crm-auth-refresh-coordination-v1";
const DEFAULT_LEASE_MS = 4_000;
const DEFAULT_WAIT_TIMEOUT_MS = 8_000;
const TERMINAL_TTL_MS = 1_000;
const POLL_INTERVAL_MS = 40;
const LEASE_SETTLE_MS = 24;

type SignalType = "refresh-start" | "refresh-success" | "refresh-failure" | "refresh-logout";

type RefreshSignal = {
  version: number;
  type: SignalType;
  correlationId: string;
  ownerId: string;
  startedAt: number;
  expiresAt: number;
  completedAt?: number;
  status?: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type WebLocksLike = {
  request(name: string, options: { ifAvailable: true }, callback: (lock: Lock | null) => Promise<unknown>): Promise<unknown>;
};

type SignalChannel = {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
};

type SignalChannelConstructor = new (name: string) => SignalChannel;

export type AuthRefreshCoordinatorOptions = {
  storage?: StorageLike | null;
  locks?: WebLocksLike | null;
  BroadcastChannel?: SignalChannelConstructor | null;
  ownerId?: string;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  leaseMs?: number;
  waitTimeoutMs?: number;
};

export class AuthRefreshCoordinationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number) {
    super(status === 401 ? "Sessao renovada em outra aba foi encerrada." : "Nao foi possivel renovar a sessao agora.");
    this.name = "AuthRefreshCoordinationError";
    this.status = status;
    this.code = status === 401 ? "AUTH_REFRESH_REMOTE_LOGOUT" : "AUTH_REFRESH_REMOTE_FAILURE";
  }
}

export function isAuthRefreshCoordinationError(error: unknown): error is AuthRefreshCoordinationError {
  return error instanceof AuthRefreshCoordinationError;
}

export function createAuthRefreshCoordinator(options: AuthRefreshCoordinatorOptions = {}) {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const BroadcastChannelImpl = options.BroadcastChannel === undefined ? browserBroadcastChannel() : options.BroadcastChannel;
  const ownerId = opaqueId(options.ownerId, "owner");
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || wait;
  const leaseMs = boundedDuration(options.leaseMs, DEFAULT_LEASE_MS, 250, 15_000);
  const waitTimeoutMs = boundedDuration(options.waitTimeoutMs, DEFAULT_WAIT_TIMEOUT_MS, leaseMs, 30_000);
  let activeRefresh: Promise<unknown> | null = null;

  function runAuthRefreshSingleFlight<T>(refresh: () => Promise<T>): Promise<T> {
    if (activeRefresh) return activeRefresh as Promise<T>;

    const request = coordinate(refresh);
    activeRefresh = request;
    const clear = () => {
      if (activeRefresh === request) activeRefresh = null;
    };
    void request.then(clear, clear);
    return request;
  }

  async function coordinate<T>(refresh: () => Promise<T>): Promise<T> {
    const startedAt = now();
    const deadline = startedAt + waitTimeoutMs;
    const transport = createTransport(BroadcastChannelImpl);
    try {
      if (locks) {
        while (now() < deadline) {
          const currentTerminal = readRelevantPeerTerminal(startedAt);
          if (currentTerminal) {
            if (currentTerminal.type !== "refresh-success") return resolveTerminal<T>(currentTerminal);
          }

          const lockResult = await tryWithWebLock(refresh, startedAt, transport);
          if (lockResult.acquired) return lockResult.value as T;

          const terminal = await waitForPeer(startedAt, deadline, transport);
          if (terminal) {
            if (terminal.type !== "refresh-success") return resolveTerminal<T>(terminal);
          }
        }
        throw new AuthRefreshCoordinationError(0);
      }

      if (storage) return await runWithLease(refresh, startedAt, deadline, transport);
      return await runLeader(refresh, createStartSignal(), transport);
    } finally {
      transport.close();
    }
  }

  async function tryWithWebLock<T>(
    refresh: () => Promise<T>,
    startedAt: number,
    transport: SignalTransport,
  ): Promise<{ acquired: boolean; value?: T }> {
    if (!locks) return { acquired: false };
    let callbackStarted = false;
    let acquired = false;
    let value: T | undefined;
    try {
      await locks.request(CHANNEL_NAME, { ifAvailable: true }, async (lock) => {
        callbackStarted = true;
        if (!lock) return;
        acquired = true;
        const currentTerminal = readRelevantPeerTerminal(startedAt);
        if (currentTerminal && currentTerminal.type !== "refresh-success") {
          value = resolveTerminal<T>(currentTerminal);
          return;
        }
        // A successful peer refresh does not make this tab's in-memory access
        // token usable. Re-enter the same lock before refreshing locally so
        // followers cannot rotate the shared cookie family concurrently.
        value = await runLeader(refresh, createStartSignal(), transport);
      });
    } catch (error) {
      if (!callbackStarted) return { acquired: false };
      throw error;
    }
    return { acquired, value };
  }

  async function runWithLease<T>(refresh: () => Promise<T>, startedAt: number, deadline: number, transport: SignalTransport): Promise<T> {
    while (now() < deadline) {
      const current = readState();
      if (current && isRelevantPeerTerminal(current, startedAt)) {
        if (current.type !== "refresh-success") return resolveTerminal<T>(current);
      }

      if (current && current.type === "refresh-start" && current.expiresAt > now()) {
        const terminal = await waitForPeer(startedAt, deadline, transport);
        if (terminal) {
          if (terminal.type !== "refresh-success") return resolveTerminal<T>(terminal);
        }
        continue;
      }

      const candidate = createStartSignal();
      if (!writeState(candidate)) return await runLeader(refresh, candidate, transport);
      await sleep(Math.min(LEASE_SETTLE_MS, Math.max(1, deadline - now())));

      const confirmed = readState();
      if (sameLease(confirmed, candidate) && candidate.expiresAt > now()) {
        return await runLeader(refresh, candidate, transport);
      }

      const terminal = await waitForPeer(startedAt, deadline, transport);
      if (terminal) {
        if (terminal.type !== "refresh-success") return resolveTerminal<T>(terminal);
      }
    }
    throw new AuthRefreshCoordinationError(0);
  }

  async function runLeader<T>(refresh: () => Promise<T>, start: RefreshSignal, transport: SignalTransport): Promise<T> {
    writeState(start);
    transport.publish(start);
    const stopHeartbeat = keepLeaseAlive(start);
    try {
      const value = await refresh();
      stopHeartbeat();
      publishTerminal({ ...start, type: "refresh-success", completedAt: now(), expiresAt: now() + TERMINAL_TTL_MS }, transport);
      return value;
    } catch (error) {
      stopHeartbeat();
      const status = errorStatus(error);
      publishTerminal({
        ...start,
        type: status === 401 ? "refresh-logout" : "refresh-failure",
        status,
        completedAt: now(),
        expiresAt: now() + TERMINAL_TTL_MS,
      }, transport);
      throw error;
    }
  }

  function createStartSignal(): RefreshSignal {
    const startedAt = now();
    return {
      version: COORDINATION_VERSION,
      type: "refresh-start",
      correlationId: randomOpaqueId("refresh"),
      ownerId,
      startedAt,
      expiresAt: startedAt + leaseMs,
    };
  }

  function publishTerminal(signal: RefreshSignal, transport: SignalTransport) {
    const current = readState();
    if (!current || sameLease(current, signal)) writeState(signal);
    transport.publish(signal);
  }

  function keepLeaseAlive(start: RefreshSignal) {
    if (!storage) return () => {};
    const interval = setInterval(() => {
      const current = readState();
      if (!sameLease(current, start)) return;
      start.expiresAt = now() + leaseMs;
      writeState(start);
    }, Math.max(100, Math.floor(leaseMs / 2)));
    return () => clearInterval(interval);
  }

  async function waitForPeer(startedAt: number, deadline: number, transport: SignalTransport): Promise<RefreshSignal | null> {
    while (now() < deadline) {
      const current = readState();
      if (current && isRelevantPeerTerminal(current, startedAt)) return current;

      const received = await transport.waitForSignal(Math.min(POLL_INTERVAL_MS, Math.max(1, deadline - now())));
      if (received && isRelevantPeerTerminal(received, startedAt)) return received;
    }
    return null;
  }

  function readState(): RefreshSignal | null {
    if (!storage) return null;
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isSignal(parsed)) return null;
      if (parsed.expiresAt <= now()) {
        try {
          storage.removeItem(STORAGE_KEY);
        } catch {
          // Storage can be disabled between reads; coordination falls back safely.
        }
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function readRelevantPeerTerminal(startedAt: number): RefreshSignal | null {
    const current = readState();
    return current && isRelevantPeerTerminal(current, startedAt) ? current : null;
  }

  function isRelevantPeerTerminal(signal: RefreshSignal, startedAt: number) {
    return signal.ownerId !== ownerId && isTerminal(signal) && terminalIsRelevant(signal, startedAt);
  }

  function writeState(signal: RefreshSignal): boolean {
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(signal));
      return true;
    } catch {
      return false;
    }
  }

  return { runAuthRefreshSingleFlight };
}

type SignalTransport = {
  publish(signal: RefreshSignal): void;
  waitForSignal(timeout: number): Promise<RefreshSignal | undefined>;
  close(): void;
};

function createTransport(BroadcastChannelImpl: SignalChannelConstructor | null): SignalTransport {
  const queued: RefreshSignal[] = [];
  let pending: ((signal: RefreshSignal | undefined) => void) | null = null;
  let channel: SignalChannel | null = null;
  try {
    if (BroadcastChannelImpl) {
      channel = new BroadcastChannelImpl(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (!isSignal(event.data)) return;
        if (pending) {
          const resolve = pending;
          pending = null;
          resolve(event.data);
          return;
        }
        queued.push(event.data);
      };
    }
  } catch {
    channel = null;
  }

  return {
    publish(signal) {
      try {
        channel?.postMessage(signal);
      } catch {
        // The storage lease remains the recovery path when the channel is unavailable.
      }
    },
    waitForSignal(timeout) {
      const queuedSignal = queued.shift();
      if (queuedSignal) return Promise.resolve(queuedSignal);
      return new Promise((resolve) => {
        const finish = (signal: RefreshSignal | undefined) => {
          clearTimeout(timer);
          if (pending === finish) pending = null;
          resolve(signal);
        };
        const timer = setTimeout(() => finish(undefined), timeout);
        pending = finish;
      });
    },
    close() {
      pending?.(undefined);
      pending = null;
      try {
        if (channel) channel.onmessage = null;
        channel?.close();
      } catch {
        // Closing a channel is best effort and never changes authentication state.
      }
    },
  };
}

function resolveTerminal<T>(signal: RefreshSignal): T {
  if (signal.type === "refresh-success") return undefined as T;
  throw new AuthRefreshCoordinationError(signal.status === 401 ? 401 : signal.status || 0);
}

function isTerminal(signal: RefreshSignal) {
  return signal.type === "refresh-success" || signal.type === "refresh-failure" || signal.type === "refresh-logout";
}

function terminalIsRelevant(signal: RefreshSignal, startedAt: number) {
  if (!signal.completedAt) return false;
  if (signal.completedAt >= startedAt) return true;
  return signal.type === "refresh-success" && startedAt - signal.completedAt <= TERMINAL_TTL_MS;
}

function sameLease(left: RefreshSignal | null, right: RefreshSignal) {
  return Boolean(left && left.ownerId === right.ownerId && left.correlationId === right.correlationId);
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
}

function isSignal(value: unknown): value is RefreshSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as Partial<RefreshSignal>;
  if (signal.version !== COORDINATION_VERSION) return false;
  if (!isSignalType(signal.type) || !isOpaqueId(signal.correlationId) || !isOpaqueId(signal.ownerId)) return false;
  if (!isFiniteTimestamp(signal.startedAt) || !isFiniteTimestamp(signal.expiresAt)) return false;
  if (isTerminalType(signal.type) && !isFiniteTimestamp(signal.completedAt)) return false;
  if (signal.status !== undefined && (!Number.isInteger(signal.status) || signal.status < 0 || signal.status > 599)) return false;
  return true;
}

function isSignalType(value: unknown): value is SignalType {
  return value === "refresh-start" || value === "refresh-success" || value === "refresh-failure" || value === "refresh-logout";
}

function isTerminalType(type: SignalType) {
  return type !== "refresh-start";
}

function isOpaqueId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,160}$/.test(value);
}

function isFiniteTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function randomOpaqueId(prefix: string) {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`.slice(0, 160);
}

function opaqueId(value: string | undefined, prefix: string) {
  return value && isOpaqueId(value) ? value : randomOpaqueId(prefix);
}

function boundedDuration(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function browserLocks(): WebLocksLike | null {
  if (typeof navigator === "undefined" || !navigator.locks || typeof navigator.locks.request !== "function") return null;
  return navigator.locks as unknown as WebLocksLike;
}

function browserBroadcastChannel(): SignalChannelConstructor | null {
  return typeof BroadcastChannel === "undefined" ? null : (BroadcastChannel as unknown as SignalChannelConstructor);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

const defaultCoordinator = createAuthRefreshCoordinator();

export function runAuthRefreshSingleFlight<T>(refresh: () => Promise<T>): Promise<T> {
  return defaultCoordinator.runAuthRefreshSingleFlight(refresh);
}
