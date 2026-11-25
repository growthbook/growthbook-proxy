import { edgeApp } from "./app";
import { defaultContext } from "./config";

// Runs edgeApp for https://site.test/start against an origin that returns `originResponse`.
async function run(
  originResponse: Response,
  config: Partial<typeof defaultContext.config> = {},
) {
  const sendResponse = jest.fn();
  const context = {
    config: {
      ...defaultContext.config,
      proxyTarget: "https://origin.test",
      payload: { features: {} },
      ...config,
    },
    helpers: {
      ...defaultContext.helpers,
      getRequestURL: () => "https://site.test/start",
      getRequestMethod: () => "GET",
      getRequestHeader: () => undefined,
      getCookie: () => "",
      setCookie: (res: Response, key: string, value: string) =>
        res.headers.append("set-cookie", `${key}=${value}`),
      fetch: async () => originResponse,
      sendResponse,
    },
    hooks: {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await edgeApp(context as any, {})) as Response;
  expect(sendResponse).not.toHaveBeenCalled();
  return res;
}

function redirect(
  location: string,
  fetchedUrl?: string,
  headers: [string, string][] = [],
) {
  const res = new Response(null, {
    status: 302,
    headers: [["location", location], ...headers],
  });
  if (fetchedUrl) Object.defineProperty(res, "url", { value: fetchedUrl });
  return res;
}

describe("edgeApp", () => {
  it("passes redirects it didn't follow back to the browser", async () => {
    const res = await run(
      redirect("https://elsewhere.test/", undefined, [
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://elsewhere.test/");
    expect(res.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  it("adds its own cookies to passed-through redirects", async () => {
    const res = await run(redirect("https://elsewhere.test/"), {
      persistUuid: true,
    });
    expect(res.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^gbuuid=.+/),
    ]);
  });

  it("resolves a relative Location against the URL it fetched", async () => {
    const sameHost = await run(redirect("6", "https://origin.test/steps/5"));
    expect(sameHost.headers.get("location")).toBe("/steps/6");

    const otherHost = await run(redirect("6", "https://other.test/x/5"));
    expect(otherHost.headers.get("location")).toBe("https://other.test/x/6");
  });
});
