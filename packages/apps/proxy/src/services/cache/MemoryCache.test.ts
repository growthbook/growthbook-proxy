import { CacheRefreshStrategy } from "../../types";
import { MemoryCache } from "./MemoryCache";

const keys = (cache: MemoryCache) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [...(cache as any).store.keys()];

describe("MemoryCache.removeExpired", () => {
  it("drops expired entries and keeps live ones", async () => {
    const cache = new MemoryCache({
      expiresTTL: 1,
      cacheRefreshStrategy: "schedule" as CacheRefreshStrategy,
    });
    await cache.set("old", { a: 1 });

    cache.removeExpired(new Date(Date.now() + 500));
    expect(keys(cache)).toEqual(["old"]);

    cache.removeExpired(new Date(Date.now() + 2000));
    expect(keys(cache)).toEqual([]);
  });
});
