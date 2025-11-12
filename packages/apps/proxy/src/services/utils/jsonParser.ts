import { Worker } from "worker_threads";
import * as path from "path";
import logger from "../logger";

// Threshold (10KB) for using worker threads to parse JSON.
// Payloads larger than this are parsed in a worker thread to avoid blocking the main event loop.
const WORKER_THREAD_THRESHOLD = 10 * 1024;
const WORKER_SCRIPT_NAME = "jsonParserWorker.js";
const MAX_WORKER_POOL_SIZE = 4;

interface WorkerResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

interface WorkerTask {
  buffer: ArrayBuffer;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface WorkerWrapper {
  worker: Worker;
  busy: boolean;
}

class WorkerPool {
  private workers: WorkerWrapper[] = [];
  private queue: WorkerTask[] = [];
  private readonly workerPath: string;

  constructor() {
    this.workerPath = path.join(__dirname, WORKER_SCRIPT_NAME);
    for (let i = 0; i < MAX_WORKER_POOL_SIZE; i++) {
      const worker = new Worker(this.workerPath);
      worker.on("error", (error) => {
        logger.error(error, "Worker thread error");
        this.removeWorker(worker);
      });
      worker.on("exit", (code) => {
        if (code !== 0) {
          logger.error({ code }, "Worker thread exited unexpectedly");
        }
        this.removeWorker(worker);
      });
      this.workers.push({ worker, busy: false });
    }
  }

  private removeWorker(worker: Worker) {
    const index = this.workers.findIndex((w) => w.worker === worker);
    if (index > -1) {
      this.workers[index].busy = false;
      this.workers.splice(index, 1);
      try {
        worker.terminate();
      } catch (err) {
        logger.warn(err, "Error terminating worker");
      }
      this.processQueue();
    }
  }

  private async runTask(workerObj: WorkerWrapper, buffer: ArrayBuffer): Promise<unknown> {
    workerObj.busy = true;

    return new Promise((resolve, reject) => {
      const handler = (result: WorkerResult) => {
        workerObj.worker.off("message", handler);
        workerObj.busy = false;
        if (result.success && result.data !== undefined) {
          resolve(result.data);
        } else {
          reject(new Error(result.error || "Worker parsing failed"));
        }
        this.processQueue();
      };

      workerObj.worker.once("message", handler);
      workerObj.worker.once("error", (error) => {
        workerObj.busy = false;
        reject(error);
        this.processQueue();
      });
      workerObj.worker.postMessage({ buffer: Buffer.from(buffer) });
    });
  }

  private processQueue() {
    if (this.queue.length === 0) return;

    const available = this.workers.find((w) => !w.busy);
    if (available) {
      const task = this.queue.shift();
      if (task) {
        this.runTask(available, task.buffer).then(task.resolve).catch(task.reject);
      }
    }
  }

  execute(buffer: ArrayBuffer): Promise<unknown> {
    const available = this.workers.find((w) => !w.busy);

    if (available) {
      return this.runTask(available, buffer);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ buffer, resolve, reject });
    });
  }

  shutdown() {
    this.queue.forEach((task) => {
      task.reject(new Error("Worker pool shutdown"));
    });
    this.queue = [];
    this.workers.forEach((workerObj) => {
      try {
        workerObj.worker.terminate();
      } catch (err) {
        logger.warn(err, "Error terminating worker during shutdown");
      }
    });
    this.workers = [];
  }
}

const workerPool = new WorkerPool();

function createJsonParserWorker(buffer: ArrayBuffer): Promise<unknown> {
  return workerPool.execute(buffer);
}

function parseJsonInMainThread(input: ArrayBuffer | string): unknown {
  if (input instanceof ArrayBuffer) {
    const jsonText = new TextDecoder().decode(input);
    return JSON.parse(jsonText);
  }
  return JSON.parse(input);
}

export async function parseJsonSafely(input: ArrayBuffer | string): Promise<unknown> {
  const size = input instanceof ArrayBuffer ? input.byteLength : input.length;

  if (size <= WORKER_THREAD_THRESHOLD) {
    try {
      return parseJsonInMainThread(input);
    } catch (error) {
      logger.error({ error, size }, "Failed to parse JSON in main thread");
      throw error;
    }
  }

  try {
    const buffer = input instanceof ArrayBuffer
      ? input
      : new TextEncoder().encode(input).buffer;
    return await createJsonParserWorker(buffer);
  } catch (workerError) {
    logger.warn(
      { error: workerError, size },
      "Worker thread parsing failed, falling back to main thread"
    );
    try {
      return parseJsonInMainThread(input);
    } catch (fallbackError) {
      logger.error(
        { error: fallbackError, size, workerError },
        "Both worker thread and main thread JSON parsing failed"
      );
      throw new Error(
        `JSON parsing failed in both worker and main thread: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      );
    }
  }
}


