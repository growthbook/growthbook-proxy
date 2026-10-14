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

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }
  async set(key: string, value: string, ...args: (string | number)[]) {
    if (args.includes("NX") && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return "OK" as const;
  }
  async eval(script: string, _n: number, key: string, token: string) {
    if (this.strings.get(key) !== token) return 0;
    if (script.includes("del")) this.strings.delete(key);
    return 1;
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  async hset(key: string, field: string, value: string) {
    const hash = this.hashes.get(key) ?? new Map();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }
  async hdel(key: string, field: string) {
    return this.hashes.get(key)?.delete(field) ? 1 : 0;
  }
  async sadd(key: string, ...members: string[]) {
    this.calls.push(`sadd ${key} ${members.join(",")}`);
    const set = this.sets.get(key) ?? new Set();
    members.forEach((m) => set.add(m));
    this.sets.set(key, set);
    return members.length;
  }
  async srem(key: string, ...members: string[]) {
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
  async expire() {
    return 1;
  }
  async persist() {
    return 1;
  }
  async rename(key: string, newKey: string) {
    const set = this.sets.get(key);
    if (!set) throw new Error("ERR no such key");
    this.sets.delete(key);
    this.sets.set(newKey, set);
    return "OK" as const;
  }
  async unlink(key: string) {
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
) {
  const reports: { url: string; body: { status: { type: string } } }[] = [];
  const fileRequests: { url: string; auth: string | undefined }[] = [];
  server = http.createServer((req, res) => {
    const url = req.url ?? "";
    if (url.startsWith("/api/v1/saved-groups?")) {
      res.setHeader("Content-Type", "application/json");
      return res.end(
        JSON.stringify({
          savedGroups: groups.map((g) => ({ ...g, type: "remote" })),
          hasMore: false,
          nextOffset: null,
        }),
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
    logger: quietLogger,
  });
  return { redis, loader };
}

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
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
    expect(redis.strings.get("gb:store-id")).toBeTruthy();
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

  it("clears groups without an upload or no longer listed", async () => {
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
    expect(await redis.hgetall("gb:groups")).toEqual({});
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
      logger: { ...quietLogger, warn },
    });
    await loader.poll();
    expect(redis.members("gb:member:id:a")).toEqual(["grp_1", "grp_2"]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("shares one store ID between loaders on the same Redis", async () => {
    const { reports } = await mockApi(
      [{ id: "grp_1", attributeKey: "id", currentUpload: { version: 1 } }],
      { "grp_1/1": "a\n" },
    );
    const redis = new FakeRedis();
    redis.strings.set("gb:store-id", "store-1");
    await setup(redis).loader.poll();
    expect(reports[0].body).toMatchObject({ storeId: "store-1" });
  });
});
