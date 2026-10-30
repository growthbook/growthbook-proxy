import { warnIfRedisCanEvict } from "./eviction";

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

describe("warnIfRedisCanEvict", () => {
  it("warns when Redis can evict keys", async () => {
    const log = logger();
    await warnIfRedisCanEvict(
      { config: async () => ["maxmemory-policy", "allkeys-lru"] },
      log,
    );
    expect(log.warn).toHaveBeenCalledWith(
      { maxmemoryPolicy: "allkeys-lru" },
      expect.stringContaining("noeviction"),
    );
  });

  it("stays quiet with noeviction", async () => {
    const log = logger();
    await warnIfRedisCanEvict(
      { config: async () => ["maxmemory-policy", "noeviction"] },
      log,
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("stays quiet when the config can't be read", async () => {
    const log = logger();
    await warnIfRedisCanEvict(
      {
        config: async () => {
          throw new Error("ERR unknown command 'CONFIG'");
        },
      },
      log,
    );
    expect(log.warn).not.toHaveBeenCalled();
  });
});
