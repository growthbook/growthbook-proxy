import { injectScript, escapedJson } from "./inject";

const VALUE = "a<b \u2028 c\u2029";

function makeCtx() {
  return {
    config: {
      uuidKey: "id",
      uuidCookieName: "gbuuid",
      scriptInjectionPattern: "</head>",
      runVisualEditorExperiments: "everywhere",
      runUrlRedirectExperiments: "browser",
      runCrossOriginUrlRedirectExperiments: "browser",
      injectRedirectUrlScript: true,
    },
    helpers: {
      getCookie: () => "uuid-1",
      setCookie: () => {},
      getRequestHeader: () => "",
    },
    hooks: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function render(
  url: string,
  oldUrl: string,
  name = VALUE,
  trackingCallback?: string,
) {
  const ctx = makeCtx();
  ctx.config.trackingCallback = trackingCallback;
  const attributes = { id: "uuid-1", name };
  const growthbook = {
    getPayload: () => ({ features: { f: { defaultValue: VALUE } } }),
    getExperiments: () => [],
    getDeferredTrackingCalls: () => [
      { experiment: { key: VALUE, variations: [0, 1] }, result: { key: "0" } },
    ],
    getCompletedChangeIds: () => [],
    getStickyBucketAssignmentDocs: () => ({}),
  };
  let html = "";
  injectScript({
    context: ctx,
    body: "<html><head></head><body></body></html>",
    setBody: (s) => (html = s),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    growthbook: growthbook as any,
    attributes,
    preRedirectChangeIds: [],
    url,
    oldUrl,
  });
  return html;
}

describe("escapedJson", () => {
  it("escapes < and line separators without changing the value", () => {
    const json = escapedJson({ s: VALUE });
    expect(json).not.toMatch(/[<\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual({ s: VALUE });
  });
});

describe("injectScript", () => {
  it("escapes the values it injects", () => {
    const html = render("https://site.example/new", "https://site.example/old");

    const config = html.match(/window\.growthbook_config = (.*);\n/)?.[1];
    const tracking = html.match(
      /gb\.setDeferredTrackingCalls\(([\s\S]*?)\);\n/,
    )?.[1];
    const replaced = html.match(
      /replaceState\(undefined, undefined, (.*)\)/,
    )?.[1];
    for (const json of [config, tracking, replaced]) {
      expect(json).toBeDefined();
      expect(json).not.toMatch(/[<\u2028\u2029]/);
    }

    const parsed = JSON.parse(config ?? "");
    expect(parsed.attributes.name).toBe(VALUE);
    expect(parsed.payload.features.f.defaultValue).toBe(VALUE);
    expect(JSON.parse(tracking ?? "")[0].experiment.key).toBe(VALUE);
  });

  it("keeps attribute values from displacing the tracking callback", () => {
    const cb = `(k) => window.calls.push("$&" + k)`;
    for (const name of ["__TRACKING_CALLBACK__", 'x"__TRACKING_CALLBACK__']) {
      const html = render(
        "https://site.example/",
        "https://site.example/",
        name,
        cb,
      );
      const js = html
        .split("\n")
        .filter((l) => l.startsWith("  window.growthbook_config"))
        .join("\n");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win: any = { calls: [] };
      new Function("window", js)(win);

      expect(win.growthbook_config.attributes.name).toBe(name);
      win.growthbook_config.trackingCallback("k");
      expect(win.calls).toEqual(["$&k"]);
    }
  });
});
