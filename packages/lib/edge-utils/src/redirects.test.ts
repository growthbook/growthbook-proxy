import { fetchFollowingRedirects } from "./redirects";

type FollowConfig = Parameters<typeof fetchFollowingRedirects>[0];

// Fake origin (url -> [status, location]) behind https://site.test; records each URL
// and the cookie it received.
function follow(
  config: FollowConfig,
  url: string,
  routes: Record<string, [number, string?]>,
  method = "GET",
) {
  const calls: [string, string | null][] = [];
  let cancelled = 0;
  const result = fetchFollowingRedirects(
    config,
    url,
    method,
    new Headers({ cookie: "session=secret", "x-gbuuid": "u1" }),
    "https://site.test/start",
    async (u, headers) => {
      calls.push([u, headers.get("cookie") ?? headers.get("x-gbuuid")]);
      const [status, location] = routes[u] ?? [200];
      return {
        status,
        headers: {
          get: (n: string) => (n === "location" ? (location ?? null) : null),
        },
        body: { cancel: async () => void cancelled++ },
      };
    },
  );
  return result.then((res) => ({
    status: res.status,
    urls: calls.map(([u]) => u),
    cookies: calls.map(([, c]) => c),
    cancelled,
  }));
}

const sameHost = { followRedirects: true };

describe("fetchFollowingRedirects", () => {
  it("follows same-host redirects, relative or absolute", async () => {
    const res = await follow(sameHost, "http://o.test/a", {
      "http://o.test/a": [301, "https://o.test/a"],
      "https://o.test/a": [301, "/a/"],
      "https://o.test/a/": [302, "https://o.test/b"],
    });
    expect(res.status).toBe(200);
    expect(res.urls).toEqual([
      "http://o.test/a",
      "https://o.test/a",
      "https://o.test/a/",
      "https://o.test/b",
    ]);
    expect(res.cookies.every((c) => c === "session=secret")).toBe(true);
    expect(res.cancelled).toBe(3);
  });

  it("follows a redirect back to the URL the visitor requested, with credentials", async () => {
    const res = await follow(sameHost, "https://o.test/start", {
      "https://o.test/start": [301, "https://site.test/start"],
    });
    expect(res.status).toBe(200);
    expect(res.urls).toEqual([
      "https://o.test/start",
      "https://site.test/start",
    ]);
    expect(res.cookies).toEqual(["session=secret", "session=secret"]);
  });

  it.each([
    ["another host", "https://evil.test/"],
    ["another page on the site's own host", "https://site.test/other"],
    ["an https -> http downgrade", "http://o.test/plain"],
    ["a non-http URL", "ftp://o.test/x"],
  ])("returns redirects to %s", async (_, location) => {
    const res = await follow(sameHost, "https://o.test/logout", {
      "https://o.test/logout": [302, location],
    });
    expect(res.status).toBe(302);
    expect(res.urls).toEqual(["https://o.test/logout"]);
  });

  it("follows cross-origin redirects with followCrossOriginRedirects, without credentials", async () => {
    const res = await follow(
      { followRedirects: true, followCrossOriginRedirects: true },
      "https://o.test/x",
      {
        "https://o.test/x": [302, "http://o.test/plain"],
        "http://o.test/plain": [302, "https://other.test/y"],
        "https://other.test/y": [302, "https://o.test/z"],
      },
    );
    expect(res.status).toBe(200);
    expect(res.urls).toEqual([
      "https://o.test/x",
      "http://o.test/plain",
      "https://other.test/y",
      "https://o.test/z",
    ]);
    // dropped at the downgrade, and not restored back on o.test
    expect(res.cookies).toEqual(["session=secret", null, null, null]);
  });

  it.each([
    ["followRedirects is off", { followRedirects: false }, "GET"],
    ["the request isn't GET or HEAD", sameHost, "POST"],
  ])("doesn't follow when %s", async (_, config, method) => {
    const res = await follow(
      config,
      "https://o.test/x",
      { "https://o.test/x": [303, "/y"] },
      method,
    );
    expect(res.status).toBe(303);
    expect(res.urls).toHaveLength(1);
  });

  it("stops after 5 redirects or an invalid Location", async () => {
    const loop = await follow(sameHost, "https://o.test/x", {
      "https://o.test/x": [302, "/x"],
    });
    expect(loop.status).toBe(302);
    expect(loop.urls).toHaveLength(6);

    const bad = await follow(sameHost, "https://o.test/x", {
      "https://o.test/x": [302, "http://["],
    });
    expect(bad.status).toBe(302);
  });
});
