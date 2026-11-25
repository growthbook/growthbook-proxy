import { edgeApp } from "./app";
import { defaultContext } from "./config";

describe("edgeApp", () => {
  it("passes redirects it didn't follow back to the browser", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { location: "https://elsewhere.test/" },
    });
    const sendResponse = jest.fn();
    const context = {
      config: {
        ...defaultContext.config,
        proxyTarget: "https://origin.test",
        payload: { features: {} },
      },
      helpers: {
        ...defaultContext.helpers,
        getRequestURL: () => "https://site.test/logout",
        getRequestMethod: () => "GET",
        getRequestHeader: () => undefined,
        getCookie: () => "",
        setCookie: () => {},
        fetch: async () => redirect,
        sendResponse,
      },
      hooks: {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await edgeApp(context as any, {})).toBe(redirect);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
