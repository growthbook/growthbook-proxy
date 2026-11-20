import http from "http";
import { AddressInfo } from "net";
import { createLoader } from "./loader";
import { LoaderRedis } from "./redis";

/** An in-memory Redis with just the commands the loader uses. */
class FakeRedis implements LoaderRedis {
  strings = new Map<string, string>();
  hashes = new Map<string, Map<string, string>>();
  sets = new Map<string, Set<string>>();
  calls: string[] = [];
  /** Makes a matching `sadd`, `srem` or `hset` call fail, like a dropped connection. */
  failOn?: (call: string) => boolean;
  /** The error message of a call that `failOn` matches. */
  failMessage = "Redis failed";

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }
  async set(key: string, value: string, ...args: (string | number)[]) {
    if (args.includes("NX") && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return "OK" as const;
  }
  async eval(
    script: string,
    _n: number,
    key: string,
    ...args: (string | number)[]
  ) {
    // Removing a group's attribute and recording the change time
    if (script.includes('"hdel"')) {
      const [field, timeField, time] = args.map(String);
      this.hashes.get(key)?.delete(field);
      return this.hset(key, timeField, time);
    }
    // Renewing or releasing a lock
    if (this.strings.get(key) !== args[0]) return 0;
    if (script.includes('"del"')) this.strings.delete(key);
    return 1;
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  async hset(key: string, ...fieldsAndValues: string[]) {
    if (this.failOn?.(`hset ${key} ${fieldsAndValues[0]}`)) {
      throw new Error(this.failMessage);
    }
    const hash = this.hashes.get(key) ?? new Map();
    for (let i = 0; i < fieldsAndValues.length; i += 2) {
      hash.set(fieldsAndValues[i], fieldsAndValues[i + 1]);
    }
    this.hashes.set(key, hash);
    return fieldsAndValues.length / 2;
  }

  /** Each group's recorded attribute, without the change time. */
  async attributes() {
    const attributes = await this.hgetall("gb:group-attributes");
    delete attributes.__updatedAt;
    return attributes;
  }

  async updatedAt() {
    return (await this.hgetall("gb:group-attributes")).__updatedAt;
  }
  async hdel(key: string, field: string) {
    return this.hashes.get(key)?.delete(field) ? 1 : 0;
  }
  async sadd(key: string, ...members: string[]) {
    if (this.failOn?.(`sadd ${key} ${members.join(",")}`)) {
      throw new Error(this.failMessage);
    }
    this.calls.push(`sadd ${key} ${members.join(",")}`);
    const set = this.sets.get(key) ?? new Set();
    const before = set.size;
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
    return set.size - before;
  }
  async srem(key: string, ...members: string[]) {
    if (this.failOn?.(`srem ${key} ${members.join(",")}`)) {
      throw new Error(this.failMessage);
    }
    this.calls.push(`srem ${key} ${members.join(",")}`);
    const set = this.sets.get(key);
    members.forEach((m) => set?.delete(m));
    if (set && !set.size) this.sets.delete(key);
    return members.length;
  }
  // Two IDs per page, to exercise the cursor
  async sscan(key: string, cursor: string): Promise<[string, string[]]> {
    const all = [...(this.sets.get(key) ?? [])];
    const start = Number(cursor);
    const next = start + 2 >= all.length ? "0" : String(start + 2);
    return [next, all.slice(start, start + 2)];
  }
  async smismember(key: string, ...members: string[]) {
    const set = this.sets.get(key);
    return members.map((m) => (set?.has(m) ? 1 : 0));
  }
  async scard(key: string) {
    return this.sets.get(key)?.size ?? 0;
  }
  // Seconds until each key expires; keys without one are permanent
  ttls = new Map<string, number>();

  async expire(key: string, seconds: number) {
    this.ttls.set(key, seconds);
    return 1;
  }
  async persist(key: string) {
    return this.ttls.delete(key) ? 1 : 0;
  }
  async rename(key: string, newKey: string) {
    const set = this.sets.get(key);
    if (!set) throw new Error("ERR no such key");
    this.sets.delete(key);
    this.sets.set(newKey, set);
    // RENAME keeps the key's expiry.
    const ttl = this.ttls.get(key);
    this.ttls.delete(key);
    if (ttl === undefined) this.ttls.delete(newKey);
    else this.ttls.set(newKey, ttl);
    return "OK" as const;
  }
  async unlink(key: string) {
    this.ttls.delete(key);
    return this.sets.delete(key) || this.strings.delete(key) ? 1 : 0;
  }

  members(key: string) {
    return [...(this.sets.get(key) ?? [])].sort();
  }
}

type Group = {
  id: string;
  attributeKey: string;
  currentUpload: { version: number; numeric?: boolean } | null;
};

/** Fakes GrowthBook's API: the group list, file redirects and load reports. */
async function mockApi(
  groups: Group[],
  files: Record<string, string>,
  reportStatus = 200,
  // What the list returns, when it's older than each group's own endpoint
  listed: Group[] = groups,
) {
  const reports: { url: string; body: { status: { type: string } } }[] = [];
  const fileRequests: { url: string; auth: string | undefined }[] = [];
  server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url.startsWith("/api/v1/saved-groups?")) {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          savedGroups: listed.map((g) => ({ ...g, type: "remote" })),
          hasMore: false,
          nextOffset: null,
        }),
      );
    }
    const single = url.match(/^\/api\/v1\/saved-groups\/([^/?]+)$/);
    if (single) {
      const group = groups.find((g) => g.id === decodeURIComponent(single[1]));
      res.writeHead(group ? 200 : 404, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify(
          group ? { savedGroup: { ...group, type: "remote" } } : {},
        ),
      );
    }
    const file = url.match(/saved-groups\/(.+)\/uploads\/(\d+)\/file$/);
    if (file) {
      res.writeHead(302, { Location: `/storage/${file[1]}/${file[2]}` });
      return res.end();
    }
    if (url.startsWith("/storage/")) {
      fileRequests.push({ url, auth: req.headers.authorization });
      const body = files[url.slice("/storage/".length)];
      res.writeHead(body === undefined ? 404 : 200);
      return res.end(body ?? "missing");
    }
    if (url.endsWith("/loads")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        reports.push({ url, body: JSON.parse(body) });
        res.writeHead(reportStatus);
        res.end("{}");
      });
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  apiHost = `http://localhost:${port}`;
  return { reports, fileRequests };
}

let server: http.Server | undefined;
let apiHost = "";

const quietLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function setup(redis = new FakeRedis()) {
  const loader = createLoader({
    apiHost,
    apiKey: "secret_abc",
    redis,
    storeId: "redis-test",
    logger: quietLogger,
  });
  return { redis, loader };
}

/** Makes a load stop (lose its lock) when it adds the group to `memberKey`. */
function stopAt(redis: FakeRedis, memberKey: string) {
  const start = Date.now();
  const sadd = redis.sadd.bind(redis);
  jest.spyOn(redis, "sadd").mockImplementation(async (key, ...members) => {
    if (key === memberKey) {
      jest.spyOn(Date, "now").mockReturnValue(start + 55 * 1000);
    }
    return sadd(key, ...members);
  });
}

afterEach(async () => {
  jest.restoreAllMocks();
  const running = server;
  if (running) await new Promise((resolve) => running.close(resolve));
  server = undefined;
});

describe("RemoteGroupsLoader", () => {
  it("loads a group's current upload into member sets", async () => {
    const { reports, fileRequests } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "id\na\nb\n b\nc\n" },
    );
    const { redis, loader } = setup();
    await loader.poll();

    expect(redis.members("gb:group:{grp_1}:1")).toEqual(["a", "b", "c"]);
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(redis.strings.has("gb:lock:{grp_1}")).toBe(false);
    // The signed URL is fetched without the API key
    expect(fileRequests).toEqual([
      { url: "/storage/grp_1/1", auth: undefined },
    ]);
    expect(reports.map((r) => r.body.status)).toEqual([
      { type: "loading" },
      { type: "loaded", rowCount: 3 },
    ]);
  });

  it("stores numbers in their shortest form", async () => {
    await mockApi(
      [
        {
          id: "grp_1",
          attributeKey: "n",
          currentUpload: { version: 1, numeric: true },
        },
      ],
      { "grp_1/1": "001\n2.50\n" },
    );
    const { redis, loader } = setup();
    await loader.poll();
    expect(redis.members("gb:group:{grp_1}:1")).toEqual(["1", "2.5"]);
  });

  it("only updates member sets of IDs that changed", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\nc\n", "grp_1/2": "b\nc\nd\n" });
    const { redis, loader } = setup();
    await loader.poll();

    groups[0].currentUpload = { version: 2 };
    redis.calls = [];
    await loader.poll();

    expect(redis.calls.filter((c) => c.includes("gb:member"))).toEqual([
      "sadd gb:member:id:d grp_1",
      "srem gb:member:id:a grp_1",
    ]);
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:d")).toEqual(["grp_1"]);
    expect(redis.sets.has("gb:group:{grp_1}:1")).toBe(false);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });

    // Reverting loads the lower version again
    groups[0].currentUpload = { version: 1 };
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:d")).toEqual([]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
  });

  it("does nothing when the current version is loaded", async () => {
    const { fileRequests } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\n" },
    );
    const { loader } = setup();
    await loader.poll();
    await loader.poll();
    expect(fileRequests).toHaveLength(1);
  });

  it("keeps the previous version when an upload is invalid", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { reports, fileRequests } = await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "b\nc,d\n",
    });
    const { redis, loader } = setup();
    await loader.poll();

    groups[0].currentUpload = { version: 2 };
    await loader.poll();
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.has("gb:group:{grp_1}:2:loading")).toBe(false);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(reports.at(-1)?.body.status).toMatchObject({
      type: "invalid",
      invalidLineCount: 1,
    });
    // Not downloaded again
    expect(fileRequests).toHaveLength(2);
  });

  it("reports a failed download and retries it", async () => {
    const { reports, fileRequests } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      {},
    );
    const { redis, loader } = setup();
    await loader.poll();
    await loader.poll();
    expect(reports.at(-1)?.body.status.type).toBe("failed");
    expect(fileRequests).toHaveLength(2);
    expect(await redis.hgetall("gb:groups")).toEqual({});
  });

  it("empties groups without an upload and removes deleted ones", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
      { id: "grp_2", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n", "grp_2/1": "b\n" });
    const { redis, loader } = setup();
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1", "grp_2"]);

    groups[0].currentUpload = null;
    groups.pop();
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.size).toBe(0);
    // grp_1 still exists, with no IDs; grp_2 was deleted.
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "0" });
    expect(await redis.attributes()).toEqual({ grp_1: "id" });
  });

  it("records a new group with no upload as loaded and empty", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: null },
    ];
    await mockApi(groups, { "grp_1/1": "a\n" });
    const { redis, loader } = setup();
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "0" });
    expect(await redis.attributes()).toEqual({ grp_1: "id" });

    // Its first upload loads as usual.
    groups[0].currentUpload = { version: 1 };
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
  });

  it("moves IDs when the group's attribute changes", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n" });
    const { redis, loader } = setup();
    await loader.poll();

    groups[0].attributeKey = "account";
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:account:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:group:{grp_1}:1")).toEqual(["a"]);
  });

  it("skips groups another loader is loading", async () => {
    const { fileRequests } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\n" },
    );
    const { redis, loader } = setup();
    redis.strings.set("gb:lock:{grp_1}", "other");
    await loader.poll();
    expect(fileRequests).toHaveLength(0);
    expect(redis.strings.get("gb:lock:{grp_1}")).toBe("other");
  });

  it("keeps loading when the key can't report loads", async () => {
    await mockApi(
      [
        { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
        { id: "grp_2", attributeKey: "id", currentUpload: { version: 1 } },
      ],
      { "grp_1/1": "a\n", "grp_2/1": "a\n" },
      403,
    );
    const warn = jest.fn();
    const redis = new FakeRedis();
    const loader = createLoader({
      apiHost,
      apiKey: "secret_readonly",
      redis,
      storeId: "redis-test",
      logger: { ...quietLogger, warn },
    });
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1", "grp_2"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reports with the configured store ID", async () => {
    const { reports } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\n" },
    );
    const { loader } = setup();
    await loader.poll();
    expect(reports.map((r) => r.body)).toEqual([
      { storeId: "redis-test", status: { type: "loading" } },
      { storeId: "redis-test", status: { type: "loaded", rowCount: 1 } },
    ]);
  });

  it("requires a store ID of 1 to 100 characters", () => {
    const options = { apiHost, apiKey: "secret_abc", redis: new FakeRedis() };
    expect(() => createLoader({ ...options, storeId: "" })).toThrow(
      "Invalid store ID: it's required",
    );
    expect(() =>
      createLoader({ ...options, storeId: "x".repeat(101) }),
    ).toThrow("longer than 100 characters");
    expect(() =>
      createLoader({ ...options, storeId: "x".repeat(100) }),
    ).not.toThrow();
  });

  it("removes members a stopped load added when another version loads", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_2/1": "",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\nc\n",
    });
    const { redis, loader } = setup();
    await loader.poll();

    // Version 2 adds b, then Redis fails before the load finishes.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });

    // GrowthBook moves on to version 3 before a retry.
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 3 };
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect(redis.sets.has("gb:group-pending:{grp_1}")).toBe(false);
    expect(
      [...redis.sets.keys()].filter((k) => k.startsWith("gb:group:")),
    ).toEqual(["gb:group:{grp_1}:3"]);
  });

  it("only records a version once its set is in place", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({});
    // A first load is undone when it fails before its version is recorded.
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(await redis.attributes()).toEqual({});

    // The next poll finishes the load.
    redis.failOn = undefined;
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
  });

  it("only records an update once its set is in place", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n", "grp_1/2": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(redis.members("gb:group:{grp_1}:2")).toEqual(["a", "b"]);

    // The next poll finishes the load.
    redis.failOn = undefined;
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
  });

  it("stops loading once the lock can't be renewed in time", async () => {
    const { reports } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\nb\n" },
    );
    const { redis, loader } = setup();
    // The lock was taken, then no renewal succeeded for 55 seconds by the
    // time the download is written to Redis.
    const start = Date.now();
    const sadd = redis.sadd.bind(redis);
    jest.spyOn(redis, "sadd").mockImplementation(async (...args) => {
      jest.spyOn(Date, "now").mockReturnValue(start + 55 * 1000);
      return sadd(...args);
    });
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(await redis.hgetall("gb:groups")).toEqual({});
    expect(reports.map((r) => r.body.status.type)).toEqual(["loading"]);
  });

  it("doesn't load an older version than the group's current one", async () => {
    const latest: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 2 } },
    ];
    const stale: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { fileRequests } = await mockApi(
      latest,
      { "grp_1/1": "a\n", "grp_1/2": "b\n" },
      200,
      stale,
    );
    const { redis, loader } = setup();
    // Another loader already loaded version 2.
    await redis.hset("gb:groups", "grp_1", "2");
    await redis.hset("gb:group-attributes", "grp_1", "id");
    await redis.sadd("gb:group:{grp_1}:2", "b");
    await redis.sadd("gb:member:id:b", "grp_1");

    await loader.poll();
    expect(fileRequests).toHaveLength(0);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    expect(redis.members("gb:member:id:a")).toEqual([]);
  });

  it("undoes several loads that stopped in a row", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\nc\n",
      "grp_1/4": "a\nd\n",
    });
    const { redis, loader } = setup();
    await loader.poll();

    // Version 2 adds b, then stops before recording the version.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();

    // Version 3 undoes version 2 first, adds c, then also stops before
    // recording the version.
    groups[0].currentUpload = { version: 3 };
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);
    expect(redis.members("gb:group-pending:{grp_1}")).toEqual(["3:0:id"]);
    expect([...redis.sets.keys()].some((k) => k.includes("{grp_1}:2"))).toBe(
      false,
    );

    // Version 4 undoes version 3, which also undid version 2.
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 4 };
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.members("gb:member:id:c")).toEqual([]);
    expect(redis.members("gb:member:id:d")).toEqual(["grp_1"]);
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:4"],
    );
  });

  it("leaves only expiring keys behind when a load stops", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n", "grp_1/2": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();
    expect(redis.ttls.has("gb:group:{grp_1}:1")).toBe(false);

    // Version 2 fails while adding b, and Redis fails again while the
    // failed load is undone.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call.includes("gb:member:id:b");
    await loader.poll();
    expect(redis.members("gb:group:{grp_1}:2:applying")).toEqual(["a", "b"]);
    expect(redis.ttls.get("gb:group:{grp_1}:2:applying")).toBe(
      7 * 24 * 60 * 60,
    );
    expect(redis.members("gb:group-pending:{grp_1}")).toEqual(["2:0:id"]);
    expect(redis.ttls.get("gb:group-pending:{grp_1}")).toBe(7 * 24 * 60 * 60);
    // The loaded version stays permanent.
    expect(redis.ttls.has("gb:group:{grp_1}:1")).toBe(false);
  });

  it("logs and moves on when a stopped load's upload was deleted", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const files: Record<string, string> = {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\nc\n",
    };
    await mockApi(groups, files);
    const error = jest.fn();
    const redis = new FakeRedis();
    const loader = createLoader({
      apiHost,
      apiKey: "secret_abc",
      redis,
      storeId: "redis-test",
      logger: { ...quietLogger, error },
    });
    await loader.poll();

    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();

    // Version 2's upload is deleted, and its set is gone, before version 3
    // loads.
    redis.failOn = undefined;
    delete files["grp_1/2"];
    await redis.unlink("gb:group:{grp_1}:2");
    groups[0].currentUpload = { version: 3 };
    await loader.poll();

    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);
    // b can't be found without the file, so it stays.
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(error).toHaveBeenCalledWith(
      { savedGroupId: "grp_1", version: 2 },
      expect.stringContaining("upload was deleted"),
    );
    expect(redis.sets.has("gb:group-pending:{grp_1}")).toBe(false);
  });

  it("undoes a failed load's changes right away", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { reports } = await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\nc\n",
    });
    const { redis, loader } = setup();
    await loader.poll();

    // Version 2 adds b, then Redis is full when it adds c.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "sadd gb:member:id:c grp_1";
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.members("gb:member:id:c")).toEqual([]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:1"],
    );
    expect(reports.at(-1)?.body.status).toEqual({
      type: "failed",
      error: "Redis failed",
    });
  });

  it("waits longer before each retry of a version Redis had no memory for", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { fileRequests } = await mockApi(groups, {
      "grp_1/1": "a\nb\n",
      "grp_1/2": "a\n",
    });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    const minutes = (n: number) => now.mockReturnValue(start + n * 60 * 1000);
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "sadd gb:member:id:b grp_1";

    await loader.poll();
    expect(fileRequests).toHaveLength(1);
    // The next poll skips it; the one after retries, and fails again.
    minutes(5);
    await loader.poll();
    expect(fileRequests).toHaveLength(1);
    minutes(10);
    await loader.poll();
    expect(fileRequests).toHaveLength(2);
    // Then it waits twice as long.
    minutes(25);
    await loader.poll();
    expect(fileRequests).toHaveLength(2);
    minutes(30);
    await loader.poll();
    expect(fileRequests).toHaveLength(3);

    // A new version loads at once.
    groups[0].currentUpload = { version: 2 };
    minutes(31);
    await loader.poll();
    expect(fileRequests).toHaveLength(4);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
  });

  it("shares the wait before a retry with other loaders on the same Redis", async () => {
    const { fileRequests } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\nb\n" },
    );
    const redis = new FakeRedis();
    const first = setup(redis).loader;
    const second = setup(redis).loader;
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "sadd gb:member:id:b grp_1";

    await first.poll();
    expect(fileRequests).toHaveLength(1);
    now.mockReturnValue(start + 5 * 60 * 1000);
    await second.poll();
    expect(fileRequests).toHaveLength(1);
    now.mockReturnValue(start + 10 * 60 * 1000);
    await second.poll();
    expect(fileRequests).toHaveLength(2);
  });

  it("leaves nothing behind when a load fails while it records itself", async () => {
    await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\n" },
    );
    const { redis, loader } = setup();
    redis.failOn = (call) => call === "sadd gb:groups-pending grp_1";
    await loader.poll();
    expect(redis.sets.size).toBe(0);
  });

  it("removes the record of a load that fails before it adds members", async () => {
    const { reports } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\n" },
    );
    const { redis, loader } = setup();
    jest
      .spyOn(redis, "rename")
      .mockRejectedValueOnce(new Error("Redis failed"));
    await loader.poll();
    expect(redis.sets.size).toBe(0);
    expect(reports.at(-1)?.body.status.type).toBe("failed");
  });

  it("reports a failed load before undoing it", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { reports } = await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\nc\n",
    });
    const { redis, loader } = setup();
    await loader.poll();

    let membersAtReport: string[] | undefined;
    const push = reports.push.bind(reports);
    jest.spyOn(reports, "push").mockImplementation((...items) => {
      if (items[0].body.status.type === "failed") {
        membersAtReport = redis.members("gb:member:id:b");
      }
      return push(...items);
    });
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "sadd gb:member:id:c grp_1";
    await loader.poll();

    expect(membersAtReport).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
  });

  it("undoes a failed first load", async () => {
    await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\nb\nc\n" },
    );
    const { redis, loader } = setup();
    redis.failOn = (call) => call === "sadd gb:member:id:c grp_1";
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(await redis.hgetall("gb:groups")).toEqual({});
    expect(redis.sets.size).toBe(0);
  });

  it("undoes a failed attribute change", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();

    groups[0].attributeKey = "account";
    redis.failOn = (call) => call === "sadd gb:member:account:b grp_1";
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:account:a")).toEqual([]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(await redis.attributes()).toEqual({ grp_1: "id" });
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:1"],
    );
  });

  it("removes the staging set of a load that fails while reading", async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `id${i}`);
    await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": ids.join("\n") },
    );
    const { redis, loader } = setup();
    // The first batch of 1,000 IDs is staged, then Redis is full.
    let staged = 0;
    redis.failOn = (call) =>
      call.startsWith("sadd gb:group:{grp_1}:1:loading") && staged++ > 0;
    await loader.poll();

    expect(staged).toBe(2);
    expect(redis.sets.size).toBe(0);
    expect(await redis.hgetall("gb:groups")).toEqual({});
  });

  it("undoes a stopped load from its stored IDs when its upload was deleted", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const files: Record<string, string> = {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\nc\n",
    };
    const { fileRequests } = await mockApi(groups, files);
    const { redis, loader } = setup();
    await loader.poll();

    // Version 2 stops after its set is in place, before it's recorded.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();

    redis.failOn = undefined;
    delete files["grp_1/2"];
    groups[0].currentUpload = { version: 3 };
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:3"],
    );
    // Only its own load downloaded version 2; the undo read the stored IDs.
    expect(
      fileRequests.filter((r) => r.url === "/storage/grp_1/2"),
    ).toHaveLength(1);
  });

  it("clears a deleted group whose first load stopped", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const files: Record<string, string> = { "grp_1/1": "a\nb\nc\n" };
    await mockApi(groups, files);
    const { redis, loader } = setup();
    // The lock can't be renewed in time once a and b are added, so the load
    // stops before c.
    const start = Date.now();
    const sadd = redis.sadd.bind(redis);
    jest.spyOn(redis, "sadd").mockImplementation(async (key, ...members) => {
      if (key === "gb:member:id:a") {
        jest.spyOn(Date, "now").mockReturnValue(start + 55 * 1000);
      }
      return sadd(key, ...members);
    });
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:c")).toEqual([]);
    expect(await redis.hgetall("gb:groups")).toEqual({});
    jest.restoreAllMocks();

    // The group and its upload are deleted.
    groups.pop();
    delete files["grp_1/1"];
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.size).toBe(0);
    // Lookups never saw the group, so they aren't told that it changed.
    expect(await redis.updatedAt()).toBeUndefined();
  });

  it("clears a deleted group whose failed first load couldn't be undone", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const files: Record<string, string> = { "grp_1/1": "a\nb\nc\n" };
    await mockApi(groups, files);
    const { redis, loader } = setup();
    // Redis is full when it adds c, and the undo fails too.
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) =>
      call === "sadd gb:member:id:c grp_1" || call.startsWith("srem gb:member");
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);

    redis.failOn = undefined;
    groups.pop();
    delete files["grp_1/1"];
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.size).toBe(0);
  });

  it("undoes an earlier failed try when a full Redis fails the retry", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { fileRequests } = await mockApi(groups, { "grp_1/1": "a\nb\nc\n" });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    // Redis is full when it adds c, and the undo fails too.
    redis.failOn = (call) =>
      call === "sadd gb:member:id:c grp_1" || call.startsWith("srem gb:member");
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);

    // Redis refuses every SADD and HSET. (Real Redis over maxmemory also
    // refuses the lock; this models it just under.)
    redis.failOn = (call) => call.startsWith("sadd") || call.startsWith("hset");
    now.mockReturnValue(start + 10 * 60 * 1000);
    await loader.poll();
    expect(fileRequests).toHaveLength(1);
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.size).toBe(0);

    redis.failOn = undefined;
    now.mockReturnValue(start + 30 * 60 * 1000);
    await loader.poll();
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
  });

  it.each(["hset gb:group-attributes grp_1", "hset gb:groups grp_1"])(
    "undoes a first load that runs out of memory at %s",
    async (failing) => {
      await mockApi(
        [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
        { "grp_1/1": "a\nb\n" },
      );
      const { redis, loader } = setup();
      const start = Date.now();
      const now = jest.spyOn(Date, "now").mockReturnValue(start);
      redis.failMessage =
        "OOM command not allowed when used memory > 'maxmemory'.";
      redis.failOn = (call) => call === failing;
      await loader.poll();

      expect(redis.members("gb:member:id:a")).toEqual([]);
      expect(redis.sets.size).toBe(0);
      expect(await redis.attributes()).toEqual({});
      expect(await redis.hgetall("gb:groups")).toEqual({});
      expect(Object.keys(await redis.hgetall("gb:group-retries"))).toEqual([
        "grp_1",
      ]);

      redis.failOn = undefined;
      now.mockReturnValue(start + 10 * 60 * 1000);
      await loader.poll();
      expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
      expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    },
  );

  it("doesn't reuse a set another attribute's load of the version wrote", async () => {
    // The first line is a header only for the attribute it names.
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "id\na\nb\n" });
    const { redis, loader } = setup();
    stopAt(redis, "gb:member:id:a");
    await loader.poll();
    jest.restoreAllMocks();
    groups[0].attributeKey = "user";
    stopAt(redis, "gb:member:user:a");
    await loader.poll();
    jest.restoreAllMocks();

    groups[0].attributeKey = "id";
    await loader.poll();
    expect(redis.members("gb:group:{grp_1}:1")).toEqual(["a", "b"]);
    expect(redis.members("gb:member:id:id")).toEqual([]);
  });

  it("doesn't reuse a kept set another attribute built after its load was undone", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "id\na\nb\n" });
    const { redis, loader } = setup();
    stopAt(redis, "gb:member:id:a");
    await loader.poll();
    jest.restoreAllMocks();
    // The load for another attribute fails and is undone, but its set stays
    // for the stopped load's undo.
    groups[0].attributeKey = "user";
    redis.failOn = (call) => call === "sadd gb:member:user:b grp_1";
    await loader.poll();

    redis.failOn = undefined;
    groups[0].attributeKey = "id";
    await loader.poll();
    expect(redis.members("gb:group:{grp_1}:1")).toEqual(["a", "b"]);
    expect(redis.members("gb:member:id:id")).toEqual([]);
  });

  it("undoes an earlier failed try before a new version reads its upload", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\nc\n", "grp_1/2": "d\n" });
    const { redis, loader } = setup();
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    // Redis is full when it adds c, and the undo fails too.
    redis.failOn = (call) =>
      call === "sadd gb:member:id:c grp_1" || call.startsWith("srem gb:member");
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);

    // A new version comes while Redis is still full.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call.startsWith("sadd") || call.startsWith("hset");
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    // Its set goes too, not just its members.
    expect([...redis.sets.keys()].some((k) => k.includes("{grp_1}:1"))).toBe(
      false,
    );

    // With room again, it loads.
    redis.failOn = undefined;
    await redis.hdel("gb:group-retries", "grp_1");
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    expect(redis.members("gb:member:id:d")).toEqual(["grp_1"]);
    expect(
      [...redis.sets.keys()].filter((k) => k.startsWith("gb:group")),
    ).toEqual(["gb:group:{grp_1}:2"]);
  });

  it("adds back members a stopped update removed when another version loads", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\nx\n",
      "grp_1/2": "a\n",
      "grp_1/3": "a\nx\n",
    });
    const { redis, loader } = setup();
    await loader.poll();
    // Version 2 removes x, then stops before recording the version.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:x")).toEqual([]);

    redis.failOn = undefined;
    groups[0].currentUpload = { version: 3 };
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect(redis.members("gb:member:id:x")).toEqual(["grp_1"]);
  });

  it("keeps old members when an update's retry is undone after it failed while recording", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\nb\n",
      "grp_1/2": "a\nc\n",
      "grp_1/3": "a\nb\nd\n",
    });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    await loader.poll();
    // Version 2 removes b, then runs out of memory when it records itself.
    groups[0].currentUpload = { version: 2 };
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual([]);

    // Its retry runs out of memory while adding, and is undone to version 1.
    redis.failOn = (call) => call.startsWith("sadd gb:member:");
    now.mockReturnValue(start + 60 * 60 * 1000);
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(redis.members("gb:group-repair:{grp_1}")).toEqual(["1"]);

    // The next version adds b back.
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 3 };
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.sets.has("gb:group-repair:{grp_1}")).toBe(false);
  });

  it("adds back members an interrupted clear removed when a new upload loads", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\nb\nc\n",
      "grp_1/2": "a\nb\nc\nd\n",
    });
    const { redis, loader } = setup();
    await loader.poll();
    // The upload is removed, and the clear fails after removing one member.
    groups[0].currentUpload = null;
    let removals = 0;
    redis.failOn = (call) =>
      call.startsWith("srem gb:member:id:") && ++removals === 2;
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });

    // A new upload loads before the clear finishes.
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 2 };
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    for (const m of ["a", "b", "c", "d"]) {
      expect(redis.members(`gb:member:id:${m}`)).toEqual(["grp_1"]);
    }
    expect(redis.sets.has("gb:group-repair:{grp_1}")).toBe(false);
  });

  it("doesn't leak a stopped update's set when its cleanup fails", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\nc\n",
    });
    const { redis, loader } = setup();
    await loader.poll();
    // Version 2 makes its set permanent, then fails while recording.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    redis.failOn = undefined;

    // Version 3's cleanup of version 2 fails once.
    groups[0].currentUpload = { version: 3 };
    const unlink = redis.unlink.bind(redis);
    let dropped = false;
    jest.spyOn(redis, "unlink").mockImplementation(async (key) => {
      if (!dropped && key === "gb:group:{grp_1}:2:loading") {
        dropped = true;
        throw new Error("Connection is closed.");
      }
      return unlink(key);
    });
    await loader.poll();
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:3"],
    );
  });

  it("doesn't leak a failed first load's set when its undo fails", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n", "grp_1/2": "a\nc\n" });
    const { redis, loader } = setup();
    // The first load fails while recording, and every try of its undo
    // fails at the same step.
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    const unlink = redis.unlink.bind(redis);
    let failing = true;
    jest.spyOn(redis, "unlink").mockImplementation(async (key) => {
      if (failing && key === "gb:group:{grp_1}:1:applying") {
        throw new Error("Connection is closed.");
      }
      return unlink(key);
    });
    await loader.poll();
    failing = false;
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 2 };
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:2"],
    );
    expect(redis.members("gb:member:id:b")).toEqual([]);
  });

  it("repairs a group that comes back after its clear was interrupted", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\nc\n" });
    const { redis, loader } = setup();
    await loader.poll();
    // The group is deleted, and its clear fails after removing one member.
    const group = groups.pop()!;
    let removals = 0;
    redis.failOn = (call) =>
      call.startsWith("srem gb:member:id:") && ++removals === 2;
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });

    // It comes back with the same version.
    redis.failOn = undefined;
    groups.push(group);
    await loader.poll();
    for (const m of ["a", "b", "c"]) {
      expect(redis.members(`gb:member:id:${m}`)).toEqual(["grp_1"]);
    }
    expect(redis.sets.has("gb:group-repair:{grp_1}")).toBe(false);
    expect(redis.members("gb:groups-pending")).toEqual([]);
  });

  it("retries an invalid upload's repair after it runs out of memory", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\nb\n",
      "grp_1/2": "a\n",
      "grp_1/3": "a\nx,y\n",
    });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    await loader.poll();
    // Version 2 removes b, then stops while recording its attribute.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:group-attributes grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual([]);

    // Version 3 is invalid, and adding version 1's IDs back runs out of
    // memory.
    groups[0].currentUpload = { version: 3 };
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call.startsWith("sadd gb:member:");
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual([]);

    // After the retry wait, it adds them back.
    redis.failOn = undefined;
    now.mockReturnValue(start + 60 * 60 * 1000);
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.sets.has("gb:group-repair:{grp_1}")).toBe(false);
  });

  it("hides a never-recorded group when undoing its earlier load", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n", "grp_1/2": "a\nc\n" });
    const { redis, loader } = setup();
    // The first load fails after recording its attribute, and its undo
    // fails at the start, so the attribute stays.
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    const evalScript = redis.eval.bind(redis);
    const failingEval = jest
      .spyOn(redis, "eval")
      .mockImplementation(async (script, n, key, ...args) => {
        if (script.includes('"hdel"')) throw new Error("Connection is closed.");
        return evalScript(script, n, key, ...args);
      });
    await loader.poll();
    failingEval.mockRestore();
    expect(await redis.attributes()).toEqual({ grp_1: "id" });

    // Version 2 undoes it, then runs out of memory while reading.
    groups[0].currentUpload = { version: 2 };
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call.startsWith("sadd gb:group:");
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    // Lookups treat it as not loaded, not as loaded and empty.
    expect(await redis.attributes()).toEqual({});
  });

  it("repairs a group whose clear stopped while recording it as empty", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();
    // The upload is removed, and the clear fails when it records the
    // group as empty, after removing its members and keys.
    groups[0].currentUpload = null;
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "hset gb:group-attributes grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);

    // The same version comes back.
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 1 };
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
  });

  it("removes the previous version's set right after recording the new one", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n", "grp_1/2": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();
    // Version 2 is recorded, then a cleanup command fails. Its guard key is
    // also removed once before the rename, so the second removal fails.
    groups[0].currentUpload = { version: 2 };
    const unlink = redis.unlink.bind(redis);
    let guardRemovals = 0;
    jest.spyOn(redis, "unlink").mockImplementation(async (key) => {
      if (
        key === "gb:group:{grp_1}:2:applying:attribute" &&
        ++guardRemovals === 2
      ) {
        throw new Error("Connection is closed.");
      }
      return unlink(key);
    });
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    // Nothing refers to version 1 any more, so its set must be gone.
    expect(redis.sets.has("gb:group:{grp_1}:1")).toBe(false);
  });

  it("finishes undoing a failed load when the loader stops", async () => {
    await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\nb\nc\n" },
    );
    const { redis, loader } = setup();
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "sadd gb:member:id:c grp_1";
    // The loader is told to stop (a deploy) as the undo starts.
    const srem = redis.srem.bind(redis);
    jest.spyOn(redis, "srem").mockImplementation(async (key, ...members) => {
      if (key.startsWith("gb:member:")) void loader.stop();
      return srem(key, ...members);
    });
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.has("gb:group-pending:{grp_1}")).toBe(false);
  });

  it("tries a failed load's undo again after a dropped command", async () => {
    await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\nb\nc\n" },
    );
    const { redis, loader } = setup();
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    let undoDrops = 0;
    redis.failOn = (call) =>
      call === "sadd gb:member:id:c grp_1" ||
      (call.startsWith("srem gb:member:") && ++undoDrops === 1);
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.has("gb:group-pending:{grp_1}")).toBe(false);
  });

  it("doesn't leak a stopped update's set after a failed attribute change", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\n",
    });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    await loader.poll();
    // Version 2 makes its set permanent, then stops while recording.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:group-attributes grp_1";
    await loader.poll();
    // The attribute changes at the same version, and that load fails too.
    groups[0].attributeKey = "user";
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "sadd gb:member:user:b grp_1";
    await loader.poll();

    redis.failOn = undefined;
    groups[0].currentUpload = { version: 3 };
    now.mockReturnValue(start + 10 * 60 * 60 * 1000);
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:3"],
    );
  });

  it("refreshes the repair marker's expiry on each try", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n", "grp_1/2": "a\n" });
    const { redis, loader } = setup();
    await loader.poll();
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    redis.ttls.set("gb:group-repair:{grp_1}", 60);
    await loader.poll();
    expect(redis.ttls.get("gb:group-repair:{grp_1}")).toBe(7 * 24 * 60 * 60);
  });

  it("keeps adding back removed members when the next upload is invalid", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\nx\n",
      "grp_1/2": "a\n",
      "grp_1/3": "a\nb,c\n",
      "grp_1/4": "a\nx\n",
    });
    const { redis, loader } = setup();
    await loader.poll();
    // Version 2 removes x, then stops before recording the version.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:x")).toEqual([]);

    // Version 3 undoes it, but its upload is invalid.
    redis.failOn = undefined;
    groups[0].currentUpload = { version: 3 };
    await loader.poll();
    // Version 1 stays, so it gets x back right away.
    expect(redis.members("gb:member:id:x")).toEqual(["grp_1"]);
    groups[0].currentUpload = { version: 4 };
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "4" });
    expect(redis.members("gb:member:id:x")).toEqual(["grp_1"]);
    expect(redis.sets.has("gb:group-repair:{grp_1}")).toBe(false);
  });

  it("keeps adding back removed members when the next load runs out of memory", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\nx\n",
      "grp_1/2": "a\n",
      "grp_1/3": "a\nx\n",
    });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    await loader.poll();
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:x")).toEqual([]);

    // Version 3 undoes version 2, then runs out of memory while reading.
    groups[0].currentUpload = { version: 3 };
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call.startsWith("sadd gb:group:{grp_1}:3:loading");
    await loader.poll();
    redis.failOn = undefined;
    now.mockReturnValue(start + 60 * 60 * 1000);
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "3" });
    expect(redis.members("gb:member:id:x")).toEqual(["grp_1"]);
  });

  it("keeps repairing a changed-back attribute when its load fails before adding", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();
    // The change to user stops while removing b from id.
    groups[0].attributeKey = "user";
    redis.failOn = (call) => call === "srem gb:member:id:b grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);

    // The change back fails at its first member write.
    groups[0].attributeKey = "id";
    redis.failOn = (call) => call.startsWith("sadd gb:member:id:");
    await loader.poll();
    redis.failOn = undefined;
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:user:a")).toEqual([]);
    expect(redis.sets.has("gb:group-repair:{grp_1}")).toBe(false);
  });

  it("recovers when undoing an earlier stopped load fails partway", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, {
      "grp_1/1": "a\n",
      "grp_1/2": "a\nb\n",
      "grp_1/3": "a\nc\n",
      "grp_1/4": "a\nd\n",
    });
    const { redis, loader } = setup();
    await loader.poll();
    // Version 2 adds b, then stops before recording the version.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    // Version 3 stops while removing version 2's b.
    groups[0].currentUpload = { version: 3 };
    redis.failOn = (call) => call === "srem gb:member:id:b grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.members("gb:group-pending:{grp_1}")).toEqual(["2:0:id"]);

    redis.failOn = undefined;
    groups[0].currentUpload = { version: 4 };
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.members("gb:member:id:c")).toEqual([]);
    expect(redis.members("gb:member:id:d")).toEqual(["grp_1"]);
    expect([...redis.sets.keys()].filter((k) => k.includes("{grp_1}"))).toEqual(
      ["gb:group:{grp_1}:4"],
    );
  });

  it("repairs members when a stopped attribute change is changed back", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n" });
    const { redis, loader } = setup();
    await loader.poll();
    // The change to user moves a, then stops before recording the version.
    groups[0].attributeKey = "user";
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:user:a")).toEqual(["grp_1"]);

    // The attribute changes back, so the recorded version is current again.
    redis.failOn = undefined;
    groups[0].attributeKey = "id";
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:user:a")).toEqual([]);
    expect(redis.sets.has("gb:group-pending:{grp_1}")).toBe(false);
    expect(redis.members("gb:groups-pending")).toEqual([]);
  });

  it("undoes a first upload to an empty group that fails while recording", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: null },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "0" });

    groups[0].currentUpload = { version: 1 };
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.sets.size).toBe(0);
    // It stays recorded as empty, with its attribute.
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "0" });
    expect(await redis.attributes()).toEqual({ grp_1: "id" });
    expect(Object.keys(await redis.hgetall("gb:group-retries"))).toEqual([
      "grp_1",
    ]);
  });

  it("only reuses a set while the load's own record exists", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "x\na\nb\n" });
    const { redis, loader } = setup();
    stopAt(redis, "gb:member:id:a");
    await loader.poll();
    jest.restoreAllMocks();
    // The load for another attribute fails and is undone, so its record is
    // gone, but its set stays for the stopped load's undo.
    groups[0].attributeKey = "user";
    redis.failOn = (call) => call === "sadd gb:member:user:b grp_1";
    await loader.poll();
    redis.failOn = undefined;

    // Its retry stops too, then the group is deleted.
    stopAt(redis, "gb:member:user:b");
    await loader.poll();
    jest.restoreAllMocks();
    groups.length = 0;
    await loader.poll();
    expect(redis.members("gb:member:user:a")).toEqual([]);
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.sets.size).toBe(0);
  });

  it("reuses a failed first load's renamed set when its undo failed too", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const { fileRequests } = await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    const start = Date.now();
    const now = jest.spyOn(Date, "now").mockReturnValue(start);
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    // Redis is full when it records the version, and the undo fails too.
    redis.failOn = (call) =>
      call === "hset gb:groups grp_1" || call.startsWith("srem gb:member");
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1"]);

    // Redis refuses every SADD and HSET. (Real Redis over maxmemory also
    // refuses the lock; this models it just under.)
    redis.failOn = (call) => call.startsWith("sadd") || call.startsWith("hset");
    now.mockReturnValue(start + 60 * 60 * 1000);
    await loader.poll();
    expect(fileRequests).toHaveLength(1);
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.size).toBe(0);

    redis.failOn = undefined;
    now.mockReturnValue(start + 3 * 60 * 60 * 1000);
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
  });

  it("hides a failed first load from lookups before removing its members", async () => {
    await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\nb\n" },
    );
    const { redis, loader } = setup();
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    const attributesSeen: object[] = [];
    const srem = redis.srem.bind(redis);
    jest.spyOn(redis, "srem").mockImplementation(async (key, ...members) => {
      if (key.startsWith("gb:member:")) {
        attributesSeen.push(await redis.attributes());
      }
      return srem(key, ...members);
    });
    await loader.poll();
    expect(attributesSeen.length).toBeGreaterThan(0);
    expect(attributesSeen.every((a) => !Object.keys(a).length)).toBe(true);
  });

  it("removes a failed first load's set after undoing another attribute's load", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    stopAt(redis, "gb:member:id:a");
    await loader.poll();
    jest.restoreAllMocks();
    // The load for another attribute undoes the stopped one, then fails
    // while recording its version.
    groups[0].attributeKey = "user";
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:user:a")).toEqual([]);
    expect(redis.sets.size).toBe(0);
  });

  it("keeps a version's stored IDs while another load of it still needs them", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    const files: Record<string, string> = { "grp_1/1": "a\nb\nc\n" };
    await mockApi(groups, files);
    const { redis, loader } = setup();
    // The first load stops after it adds a and b.
    const start = Date.now();
    const sadd = redis.sadd.bind(redis);
    jest.spyOn(redis, "sadd").mockImplementation(async (key, ...members) => {
      if (key === "gb:member:id:a") {
        jest.spyOn(Date, "now").mockReturnValue(start + 55 * 1000);
      }
      return sadd(key, ...members);
    });
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    jest.restoreAllMocks();

    // The same version loads for a new attribute, and Redis is full.
    groups[0].attributeKey = "account";
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "sadd gb:member:account:b grp_1";
    await loader.poll();
    expect(redis.members("gb:member:account:a")).toEqual([]);

    redis.failOn = undefined;
    groups.pop();
    delete files["grp_1/1"];
    await loader.poll();

    expect(redis.members("gb:member:id:a")).toEqual([]);
    expect(redis.members("gb:member:id:b")).toEqual([]);
    expect(redis.sets.size).toBe(0);
  });

  it("removes the retry wait of a deleted group that never loaded", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\nb\n" });
    const { redis, loader } = setup();
    redis.failMessage =
      "OOM command not allowed when used memory > 'maxmemory'.";
    redis.failOn = (call) => call === "sadd gb:member:id:b grp_1";
    await loader.poll();
    expect(Object.keys(await redis.hgetall("gb:group-retries"))).toEqual([
      "grp_1",
    ]);

    redis.failOn = undefined;
    groups.pop();
    await loader.poll();

    expect(await redis.hgetall("gb:group-retries")).toEqual({});
  });

  it("records when members last changed, together with the attribute", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n", "grp_1/2": "b\n" });
    const { redis, loader } = setup();
    await loader.poll();
    const loadedAt = await redis.updatedAt();
    expect(Date.parse(loadedAt ?? "")).not.toBeNaN();

    // Nothing changed, so nothing is written.
    await loader.poll();
    expect(await redis.updatedAt()).toBe(loadedAt);

    // A load that stops after recording the attribute but before the
    // version is loaded again, and records a new time.
    groups[0].currentUpload = { version: 2 };
    const times = jest.spyOn(Date.prototype, "toISOString");
    times.mockReturnValue("2030-01-01T00:00:00.000Z");
    redis.failOn = (call) => call === "hset gb:groups grp_1";
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    redis.failOn = undefined;
    times.mockReturnValue("2030-01-02T00:00:00.000Z");
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "2" });
    expect(await redis.updatedAt()).toBe("2030-01-02T00:00:00.000Z");

    // Removing the group records a new time too.
    groups.pop();
    times.mockReturnValue("2030-01-03T00:00:00.000Z");
    await loader.poll();
    expect(await redis.attributes()).toEqual({});
    expect(await redis.updatedAt()).toBe("2030-01-03T00:00:00.000Z");
  });

  it("finishes a clear that stopped after removing the attribute", async () => {
    const groups: Group[] = [
      { id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } },
    ];
    await mockApi(groups, { "grp_1/1": "a\n" });
    const { redis, loader } = setup();
    await loader.poll();

    // The group is deleted; the clear stops before removing its version.
    groups.pop();
    const hdel = redis.hdel.bind(redis);
    jest.spyOn(redis, "hdel").mockImplementationOnce(async () => {
      throw new Error("Redis failed");
    });
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
    expect(await redis.attributes()).toEqual({});
    expect(redis.members("gb:member:id:a")).toEqual([]);

    jest.spyOn(redis, "hdel").mockImplementation(hdel);
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({});
    expect(redis.sets.size).toBe(0);
  });
});
