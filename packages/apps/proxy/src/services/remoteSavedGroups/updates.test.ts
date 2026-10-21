import { notifyRemoteEvalClients, RemoteGroupUpdateWatcher } from "./updates";

function makeWatcher(reads: (string | null | Error)[]) {
  const onChange = jest.fn(async () => {});
  const logger = { warn: jest.fn() };
  const watcher = new RemoteGroupUpdateWatcher({
    readUpdatedAt: async () => {
      const next = reads.shift();
      if (next instanceof Error) throw next;
      return next ?? null;
    },
    onChange,
    intervalMs: 5000,
    logger,
  });
  return { watcher, onChange, logger };
}

describe("RemoteGroupUpdateWatcher", () => {
  it("calls onChange when the change time changes", async () => {
    const { watcher, onChange } = makeWatcher(["t1", "t2"]);
    await watcher.check();
    await watcher.check();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onChange on the first read, or when unchanged", async () => {
    const { watcher, onChange } = makeWatcher(["t1", "t1", "t1"]);
    await watcher.check();
    await watcher.check();
    await watcher.check();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("treats the first change time after no upload as a change", async () => {
    const { watcher, onChange } = makeWatcher([null, "t1"]);
    await watcher.check();
    await watcher.check();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("logs a failed read and checks again next time", async () => {
    const { watcher, onChange, logger } = makeWatcher([
      "t1",
      new Error("down"),
      "t2",
    ]);
    await watcher.check();
    await watcher.check();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    await watcher.check();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("logs a failed onChange and tries again next time", async () => {
    const { watcher, onChange, logger } = makeWatcher(["t1", "t2", "t2"]);
    onChange.mockRejectedValueOnce(new Error("boom"));
    await watcher.check();
    await expect(watcher.check()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    await watcher.check();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("checks on a timer until stopped", async () => {
    jest.useFakeTimers();
    try {
      const { watcher, onChange } = makeWatcher(["t1", "t2", "t3"]);
      watcher.start();
      await jest.advanceTimersByTimeAsync(5000);
      await jest.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenCalledTimes(1);
      watcher.stop();
      await jest.advanceTimersByTimeAsync(5000);
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("notifyRemoteEvalClients", () => {
  it("notifies remote-eval connections using remote groups, or not cached", async () => {
    const payloads: Record<string, { remote: boolean } | undefined> = {
      withGroups: { remote: true },
      withoutGroups: { remote: false },
      notCached: undefined,
      plain: { remote: true },
    };
    const getPayload = jest.fn(async (apiKey: string) => {
      if (apiKey === "readFails") throw new Error("down");
      return payloads[apiKey];
    });
    const publishBeacon = jest.fn();
    await notifyRemoteEvalClients({
      apiKeys: [
        "withGroups",
        "withoutGroups",
        "notCached",
        "readFails",
        "plain",
      ],
      isRemoteEval: (apiKey) => apiKey !== "plain",
      getPayload,
      usesRemoteGroups: (payload) => payload.remote,
      publishBeacon,
    });
    expect(publishBeacon.mock.calls).toEqual([
      ["withGroups"],
      ["notCached"],
      ["readFails"],
    ]);
    expect(getPayload).not.toHaveBeenCalledWith("plain");
  });
});
