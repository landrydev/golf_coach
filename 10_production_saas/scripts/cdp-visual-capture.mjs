import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [url, outputPath, rawWidth = "390", rawHeight = "844"] = process.argv.slice(2);

if (!url || !outputPath) {
  throw new Error(
    "Usage: node scripts/cdp-visual-capture.mjs <url> <output.png> [width] [height]",
  );
}

const width = positiveInteger(rawWidth, "width");
const height = positiveInteger(rawHeight, "height");
const endpoint = process.env.CHROME_DEBUG_ENDPOINT || "http://127.0.0.1:9222";
async function capture() {
  const target = await waitForPageTarget(endpoint);
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);

  try {
  await client.call("Page.enable");
  await client.call("Runtime.enable");
  await client.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
    positionX: 0,
    positionY: 0,
    dontSetVisibleSize: false,
  });
  await client.call("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });

  const loaded = client.once("Page.loadEventFired");
  await client.call("Page.navigate", { url });
  await loaded;
  await client.call("Runtime.evaluate", {
    awaitPromise: true,
    expression: `new Promise((resolve) => {
      const finish = () => requestAnimationFrame(() => requestAnimationFrame(resolve));
      if (document.fonts?.ready) document.fonts.ready.then(finish); else finish();
    })`,
  });

  const metricsResult = await client.call("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const root = document.documentElement;
      const body = document.body;
      const clientWidth = root.clientWidth;
      const overflowCandidates = [...document.querySelectorAll("body *")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || null,
            classes: typeof element.className === "string" ? element.className : null,
            left: Math.round(rect.left * 100) / 100,
            right: Math.round(rect.right * 100) / 100,
            width: Math.round(rect.width * 100) / 100,
            overflowX: style.overflowX,
          };
        })
        .filter((item) => item.left < -1 || item.right > clientWidth + 1)
        .slice(0, 25);
      return {
        url: location.href,
        title: document.title,
        innerWidth,
        innerHeight,
        devicePixelRatio,
        clientWidth,
        rootScrollWidth: root.scrollWidth,
        bodyScrollWidth: body?.scrollWidth ?? null,
        hasRootHorizontalOverflow: root.scrollWidth > clientWidth + 1,
        overflowCandidates,
      };
    })()`,
  });

  const screenshot = await client.call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const absoluteOutput = resolve(outputPath);
  await mkdir(dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, Buffer.from(screenshot.data, "base64"));
  process.stdout.write(`${JSON.stringify(metricsResult.result.value, null, 2)}\n`);
  } finally {
    client.close();
  }
}

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function waitForPageTarget(baseUrl) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/json/list`);
      if (!response.ok) throw new Error(`Chrome target list returned ${response.status}.`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw lastError || new Error("Chrome did not expose a page target.");
}

class CdpClient {
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolveConnection, rejectConnection) => {
      socket.addEventListener("open", resolveConnection, { once: true });
      socket.addEventListener("error", rejectConnection, { once: true });
    });
    return new CdpClient(socket);
  }

  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    socket.addEventListener("message", (event) => this.onMessage(event));
    socket.addEventListener("close", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("Chrome DevTools connection closed."));
      }
      this.pending.clear();
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    const promise = new Promise((resolveCall, rejectCall) => {
      this.pending.set(id, { resolve: resolveCall, reject: rejectCall });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  once(method) {
    return new Promise((resolveEvent) => {
      const queue = this.events.get(method) || [];
      queue.push(resolveEvent);
      this.events.set(method, queue);
    });
  }

  onMessage(event) {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message} (${message.error.code})`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    const queue = this.events.get(message.method);
    const resolveEvent = queue?.shift();
    if (resolveEvent) resolveEvent(message.params);
    if (queue && queue.length === 0) this.events.delete(message.method);
  }

  close() {
    this.socket.close();
  }
}

await capture();
