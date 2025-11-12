import { parentPort } from "worker_threads";

if (!parentPort) {
  process.exit(1);
}

const port = parentPort;

port.on("message", (message: { buffer: Buffer }) => {
  try {
    const { buffer } = message;
    const decoder = new TextDecoder();
    const jsonText = decoder.decode(buffer);
    const parsed = JSON.parse(jsonText);
    port.postMessage({ success: true, data: parsed });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    port.postMessage({
      success: false,
      error: errorMessage,
    });
  }
});


