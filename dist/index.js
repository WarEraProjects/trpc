// src/trpc-client.ts
import { createTRPCUntypedClient, httpBatchLink, loggerLink } from "@trpc/client";
function createRateLimitedFetch(origFetch, rateLimit = 100) {
  const f = origFetch ?? globalThis.fetch;
  const delayMs = Math.max(1, Math.floor(6e4 / rateLimit));
  const queue = [];
  let running = false;
  let lastTime = 0;
  const runNext = async () => {
    if (queue.length === 0) {
      running = false;
      return;
    }
    running = true;
    const now = Date.now();
    const elapsed = now - lastTime;
    const wait = Math.max(0, delayMs - elapsed);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    const item = queue.shift();
    lastTime = Date.now();
    f(item.args[0], item.args[1]).then(item.resolve).catch(item.reject).finally(() => {
      if (queue.length > 0) {
        setTimeout(runNext, 0);
      } else {
        running = false;
      }
    });
  };
  return ((input, init) => new Promise((resolve, reject) => {
    queue.push({ args: [input, init], resolve, reject });
    if (!running) runNext();
  }));
}
function createTrpcClient(options) {
  const appliedRateLimit = options.rateLimit ?? (options.apiKey !== void 0 ? 200 : 100);
  const client = createTRPCUntypedClient({
    links: [
      ...options.logger === false ? [] : [loggerLink()],
      httpBatchLink({
        url: options.url,
        fetch: createRateLimitedFetch(options.fetch, appliedRateLimit),
        maxURLLength: 2e3,
        headers() {
          return {
            ...options.headers ?? {},
            ...options.apiKey ? { "x-api-key": options.apiKey } : {}
          };
        }
      })
    ]
  });
  const makeProxy = (parts) => new Proxy(() => {
  }, {
    get(_t, prop) {
      if (typeof prop !== "string") return void 0;
      return makeProxy([...parts, prop]);
    },
    async apply(_t, _thisArg, argArray) {
      const path = parts.join(".");
      const input = argArray?.[0] ?? {};
      return client.query(path, input);
    }
  });
  return makeProxy([]);
}
export {
  createTrpcClient as createTrpcLikeClient
};
//# sourceMappingURL=index.js.map