import { getUserAttributes } from "./attributes";

function makeCtx(opts: {
  cookieValue?: string;
  uuidKey?: string;
  uuidCookieName?: string;
  persistUuid?: boolean;
  noAutoCookies?: boolean;
  skipAutoAttributes?: boolean;
  attributes?: Record<string, unknown>;
}) {
  let counter = 0;
  return {
    config: {
      uuidCookieName: opts.uuidCookieName ?? "gbuuid",
      uuidKey: opts.uuidKey ?? "id",
      persistUuid: opts.persistUuid ?? true,
      noAutoCookies: opts.noAutoCookies ?? false,
      skipAutoAttributes: opts.skipAutoAttributes ?? false,
      attributes: opts.attributes,
      crypto: { randomUUID: () => `uuid-${++counter}` },
    },
    helpers: {
      getCookie: () => opts.cookieValue ?? "",
      setCookie: () => {},
      getRequestHeader: () => "",
    },
    hooks: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getUserAttributes", () => {
  it("cookie value matches bucketing id for first-time visitor (regression)", () => {
    const cookies: Record<string, string> = {};
    const attrs = getUserAttributes(
      makeCtx({ cookieValue: "" }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(cookies["gbuuid"]).toBeTruthy();
    expect(cookies["gbuuid"]).toBe(attrs.id);
  });

  it("reuses existing cookie for returning visitor", () => {
    const cookies: Record<string, string> = {};
    const attrs = getUserAttributes(
      makeCtx({ cookieValue: "existing-uuid" }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(cookies["gbuuid"]).toBe("existing-uuid");
    expect(attrs.id).toBe("existing-uuid");
  });

  it("does not write cookie when persistUuid is false", () => {
    const cookies: Record<string, string> = {};
    const attrs = getUserAttributes(
      makeCtx({ cookieValue: "", persistUuid: false }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(cookies["gbuuid"]).toBeUndefined();
    expect(attrs.id).toBeTruthy();
  });

  it("does not write cookie when noAutoCookies is true", () => {
    const cookies: Record<string, string> = {};
    getUserAttributes(
      makeCtx({ cookieValue: "", noAutoCookies: true }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(cookies["gbuuid"]).toBeUndefined();
  });

  it("returns only providedAttributes when skipAutoAttributes is true", () => {
    const cookies: Record<string, string> = {};
    const attrs = getUserAttributes(
      makeCtx({
        skipAutoAttributes: true,
        attributes: { id: "supplied", foo: "bar" },
      }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(attrs).toEqual({ id: "supplied", foo: "bar" });
    expect(cookies["gbuuid"]).toBeUndefined();
  });

  it("config.attributes.id overrides bucketing id (cookie still gets auto uuid)", () => {
    const cookies: Record<string, string> = {};
    const attrs = getUserAttributes(
      makeCtx({
        cookieValue: "",
        attributes: { id: "override-id" },
      }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(attrs.id).toBe("override-id");
    expect(cookies["gbuuid"]).toBeTruthy();
    expect(cookies["gbuuid"]).not.toBe("override-id");
  });

  it("uuid wins when uuidKey collides with a reserved auto-attr name", () => {
    const cookies: Record<string, string> = {};
    const attrs = getUserAttributes(
      makeCtx({ cookieValue: "", uuidKey: "browser" }),
      {},
      "http://x.com/",
      (k, v) => {
        cookies[k] = v;
      },
    );
    expect(cookies["gbuuid"]).toBe(attrs.browser);
    expect(cookies["gbuuid"]).toMatch(/^uuid-/);
  });
});
