const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

for (const intercept of [false, true]) {
  test(`HTTP proxy forwards requests without deprecations (intercept=${intercept})`, () => {
    const result = spawnSync(
      process.execPath,
      [
        "--throw-deprecation",
        "-e",
        `
      const assert = require("node:assert/strict");
      const http = require("node:http");
      const { once } = require("node:events");
      const { createProxyMiddleware, responseInterceptor } = require("http-proxy-middleware");

      (async () => {
        const upstream = http.createServer((req, res) => {
          if (req.url === "/redirect") {
            res.writeHead(302, { location: "/features" });
            return res.end();
          }
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Upstream", "ok");
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => res.end(JSON.stringify({ url: req.url, method: req.method, body })));
        });
        upstream.listen(0, "127.0.0.1");
        await once(upstream, "listening");
        const middleware = createProxyMiddleware({
          target: "http://127.0.0.1:" + upstream.address().port,
          changeOrigin: true,
          followRedirects: true,
          ...(${intercept} ? {
            selfHandleResponse: true,
            on: { proxyRes: responseInterceptor(async (buffer) => buffer) },
          } : {}),
        });
        const proxy = http.createServer(middleware);
        proxy.listen(0, "127.0.0.1");
        await once(proxy, "listening");
        try {
          const base = "http://127.0.0.1:" + proxy.address().port;
          const response = await fetch(base + "/features?key=test", { method: "POST", body: "payload" });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("x-upstream"), "ok");
          assert.deepEqual(await response.json(), { url: "/features?key=test", method: "POST", body: "payload" });
          const redirected = await fetch(base + "/redirect", { redirect: "manual" });
          assert.equal(redirected.status, 200);
          assert.deepEqual(await redirected.json(), { url: "/features", method: "GET", body: "" });
        } finally {
          proxy.closeAllConnections();
          upstream.closeAllConnections();
          await Promise.all([
            new Promise((resolve) => proxy.close(resolve)),
            new Promise((resolve) => upstream.close(resolve)),
          ]);
        }
      })().catch((error) => { console.error(error); process.exit(1); });
    `,
      ],
      {
        cwd: path.resolve(__dirname, "../../packages/apps/proxy"),
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.equal(result.stderr, "");
  });
}
