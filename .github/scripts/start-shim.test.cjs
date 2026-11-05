const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const shim = path.resolve(__dirname, "../../bin/start-shim");

function fixture(t, entry, tracing = "global.tracingLoaded = true;") {
  const cwd = mkdtempSync(path.join(tmpdir(), "proxy-start-shim-"));
  mkdirSync(path.join(cwd, "dist"));
  writeFileSync(path.join(cwd, "dist/index.js"), entry);
  writeFileSync(path.join(cwd, "dist/tracing.js"), tracing);
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

for (const command of ["start", "start:with-tracing"]) {
  for (const signal of ["SIGTERM", "SIGINT"]) {
    test(`${command} runs in the shim process and drains on ${signal}`, async (t) => {
      // Exceed PM2's default 1600ms kill timeout to cover delayed draining.
      const cwd = fixture(
        t,
        `
        process.on("${signal}", () => {
          console.log("draining");
          setTimeout(() => { console.log("drained"); process.exit(0); }, 1800);
        });
        setInterval(() => {}, 1000);
        console.log(JSON.stringify({ pid: process.pid, tracing: !!global.tracingLoaded }));
      `,
      );
      const child = spawn(process.execPath, [shim, command], {
        cwd,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      t.after(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const exited = once(child, "close");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 6000);
      t.after(() => clearTimeout(timeout));
      const [chunk] = await Promise.race([
        once(child.stdout, "data"),
        exited.then(() => {
          throw new Error(`Application exited before starting: ${stderr}`);
        }),
      ]);
      const ready = JSON.parse(chunk.toString());
      assert.equal(
        ready.pid,
        child.pid,
        "the app must receive container signals directly",
      );
      assert.equal(ready.tracing, command === "start:with-tracing");
      child.kill(signal);
      assert.deepEqual(await exited, [0, null]);
      assert.match(stdout, /draining\ndrained\n/);
      assert.equal(stderr, "");
    });
  }
}

test("propagates application failure status", (t) => {
  const cwd = fixture(t, "process.exit(23);");
  const result = spawnSync(process.execPath, [shim, "start"], {
    cwd,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 23);
});

test("rejects unsupported commands without starting the application", (t) => {
  const cwd = fixture(t, 'console.log("app started");');
  const result = spawnSync(process.execPath, [shim, "install"], {
    cwd,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not supported/);
  assert.equal(result.stdout, "");
});

test("does not start the application if tracing fails to load", (t) => {
  const cwd = fixture(
    t,
    'console.log("app started");',
    'throw new Error("tracing failed");',
  );
  const result = spawnSync(process.execPath, [shim, "start:with-tracing"], {
    cwd,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tracing failed/);
  assert.equal(result.stdout, "");
});
