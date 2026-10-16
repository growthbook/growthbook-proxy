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
      throw new Error("Redis failed");
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
      throw new Error("Redis failed");
    }
    this.calls.push(`sadd ${key} ${members.join(",")}`);
    const set = this.sets.get(key) ?? new Set();
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
    return members.length;
  }
  async srem(key: string, ...members: string[]) {
    if (this.failOn?.(`srem ${key} ${members.join(",")}`)) {
      throw new Error("Redis failed");
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
    expect(redis.members("gb:group:{grp_1}:1")).toEqual(["a", "b"]);

    // The next poll finishes the load.
    redis.failOn = undefined;
    await loader.poll();
    expect(await redis.hgetall("gb:groups")).toEqual({ grp_1: "1" });
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

    // Version 3 adds c, then stops while removing version 2's b.
    groups[0].currentUpload = { version: 3 };
    redis.failOn = (call) => call === "srem gb:member:id:b grp_1";
    await loader.poll();
    expect(redis.members("gb:member:id:b")).toEqual(["grp_1"]);
    expect(redis.members("gb:member:id:c")).toEqual(["grp_1"]);

    // Version 4 removes both stopped loads' members.
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

    // Version 2 stops after adding b, before renaming its set into place.
    groups[0].currentUpload = { version: 2 };
    redis.failOn = (call) => call === "sadd gb:member:id:b grp_1";
    await loader.poll();
    expect(redis.ttls.get("gb:group:{grp_1}:2:loading")).toBe(24 * 60 * 60);
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

    // Version 2's upload is deleted before version 3 loads.
    redis.failOn = undefined;
    delete files["grp_1/2"];
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
