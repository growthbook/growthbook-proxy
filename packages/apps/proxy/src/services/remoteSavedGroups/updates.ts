/** A pino-style logger. */
type Logger = { warn(obj: object, msg: string): void };

export type RemoteGroupUpdateWatcherOptions = {
  /** Reads when remote group members last changed, as the loader recorded. */
  readUpdatedAt: () => Promise<string | null>;
  /** Called on the first read, and after the change time changes. */
  onChange: () => Promise<void>;
  intervalMs: number;
  logger: Logger;
};

/**
 * Checks Redis for remote group membership changes on a timer. It reads
 * what the loader recorded, so it works wherever the loader runs: in this
 * Proxy, another one, standalone, or a customer's own loader.
 */
export class RemoteGroupUpdateWatcher {
  private readonly options: RemoteGroupUpdateWatcherOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
  // undefined until the first read, which also notifies: a group may have
  // changed after clients fetched during startup.
  private lastUpdatedAt: string | null | undefined = undefined;
  private stopped = true;

  constructor(options: RemoteGroupUpdateWatcherOptions) {
    this.options = options;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Checks once. A failed read is logged and retried on the next check. */
  async check(): Promise<void> {
    let updatedAt: string | null;
    try {
      updatedAt = await this.options.readUpdatedAt();
    } catch (err) {
      this.options.logger.warn(
        { err },
        "Could not check for remote saved group changes",
      );
      return;
    }
    if (updatedAt === this.lastUpdatedAt) return;
    try {
      await this.options.onChange();
      this.lastUpdatedAt = updatedAt;
    } catch (err) {
      // Not recorded, so the next check tries again.
      this.options.logger.warn(
        { err },
        "Could not notify clients of remote saved group changes",
      );
    }
  }

  private schedule(delayMs: number) {
    this.timer = setTimeout(() => {
      this.check().finally(() => {
        if (!this.stopped) this.schedule(this.options.intervalMs);
      });
    }, delayMs);
  }
}

/**
 * Sends a refetch beacon to each streaming remote-eval connection whose
 * payload uses remote groups, or whose payload isn't cached, since a missed
 * beacon leaves stale results and an extra refetch is cheap. Other
 * connections don't need one: their payload hasn't changed, and their SDKs
 * look memberships up on each evaluation.
 */
export async function notifyRemoteEvalClients<P>({
  apiKeys,
  isRemoteEval,
  getPayload,
  usesRemoteGroups,
  publishBeacon,
}: {
  /** Connections with streaming subscribers */
  apiKeys: string[];
  isRemoteEval: (apiKey: string) => boolean;
  getPayload: (apiKey: string) => Promise<P | null | undefined>;
  usesRemoteGroups: (payload: P) => boolean;
  publishBeacon: (apiKey: string) => void;
}): Promise<void> {
  for (const apiKey of apiKeys) {
    if (!isRemoteEval(apiKey)) continue;
    const payload = await getPayload(apiKey).catch(() => null);
    if (!payload || usesRemoteGroups(payload)) publishBeacon(apiKey);
  }
}
