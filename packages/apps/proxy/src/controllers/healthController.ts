import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { Context, version } from "../app";
import { registrar } from "../services/registrar";
import { featuresCache } from "../services/cache";

let build: { sha: string; date: string };
function getBuild() {
  if (!build) {
    build = {
      sha: "",
      date: "",
    };
    const rootPath = path.join(__dirname, "../..", "buildinfo");
    if (fs.existsSync(path.join(rootPath, "SHA"))) {
      build.sha = fs.readFileSync(path.join(rootPath, "SHA")).toString().trim();
    }
    if (fs.existsSync(path.join(rootPath, "DATE"))) {
      build.date = fs
        .readFileSync(path.join(rootPath, "DATE"))
        .toString()
        .trim();
    }
  }
  return build;
}

async function getChecks(ctx: Context) {
  const checks: Record<string, any> = {
    apiServer: "down",
    registrar: registrar.status,
  };
  const cacheType = ctx?.cacheSettings?.cacheEngine || "memory";
  checks[`cache:${cacheType}`] = await featuresCache?.getStatus?.() || "pending";

  try {
    const resp = await fetch(ctx.growthbookApiHost + "/healthcheck");
    const data = await resp.json();
    if (data?.healthy) checks.apiServer = "up";
  } catch(e) {
    console.error("healthcheck API sever error", e);
  }
  return checks;
}

const getHealthChecks = async (req: Request, res: Response) => {
  const ctx = req.app.locals?.ctx;

  const build = getBuild();
  const checks = await getChecks(ctx);
  res.status(200).json({
    ok: true,
    proxyVersion: version,
    build,
    checks,
  });
};

const getHealth = async (req: Request, res: Response) => {
  const build = getBuild();
  res.status(200).json({
    ok: true,
    proxyVersion: version,
    build,
  });
};

export const healthRouter = express.Router();

healthRouter.get("/", getHealth);
healthRouter.get("/checks", getHealthChecks);
