import { createTRPCUntypedClient, httpBatchLink, loggerLink } from "@trpc/client";
import type { PageResult, ProcedureKey, TrpcLikeClient } from "./typed-procedures";

export interface TrpcLikeClientOptions {
  url: string;
  apiKey?: string;
  logger?: boolean;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  maxBatchSize?: number;
  batchIntervalMs?: number;
}

type UntypedClient = {
  query: (path: string, input: unknown) => Promise<unknown>;
};

/**
 * Parse the date from a cursor string in the format "{date}|{id}".
 * Returns null if the cursor is invalid, empty, or the date cannot be parsed.
 */
function parseCursorDate(cursor: string | null | undefined): Date | null {
  if (!cursor || typeof cursor !== "string") return null;
  
  const pipeIndex = cursor.indexOf("|");
  if (pipeIndex === -1) return null;
  
  const dateStr = cursor.substring(0, pipeIndex);
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Async generator that auto-paginates through a cursor-based endpoint.
 * Yields pages until nextCursor is null/empty, maxPages is reached, or cursorEnd is exceeded.
 */
async function* autoPaginate<K extends ProcedureKey>(
  client: UntypedClient,
  path: string,
  input: Record<string, unknown>,
  options: { maxPages?: number; cursorEnd?: Date }
): AsyncIterableIterator<PageResult<K>> {
  let currentCursor: string | undefined = input.cursor as string | undefined;
  let pageCount = 0;
  const maxPages = options.maxPages ?? Infinity;

  while (pageCount < maxPages) {
    // Make the request with the current cursor
    const requestInput = { ...input, cursor: currentCursor };
    const response = (await client.query(path, requestInput)) as {
      items: unknown[];
      nextCursor: string;
    };

    // Yield the current page
    yield {
      items: response.items,
      cursor: response.nextCursor || "",
    } as PageResult<K>;

    pageCount++;

    // Check termination conditions
    if (!response.nextCursor) {
      break; // No more pages
    }

    // Check cursorEnd condition
    if (options.cursorEnd) {
      const cursorDate = parseCursorDate(response.nextCursor);
      if (cursorDate && cursorDate < options.cursorEnd) {
        break; // Next cursor is older than cutoff date
      }
    }

    currentCursor = response.nextCursor;
  }
}

function createRateLimitedFetch(origFetch?: typeof fetch, rateLimit = 100): typeof fetch {
  const f: typeof fetch = origFetch ?? (globalThis as any).fetch;
  const delayMs = Math.max(1, Math.floor(60000 / rateLimit));

  type QueueItem = {
    args: [RequestInfo | URL, RequestInit | undefined];
    resolve: (r: Response | PromiseLike<Response>) => void;
    reject: (e: unknown) => void;
  };

  const queue: QueueItem[] = [];
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

    const item = queue.shift()!;
    lastTime = Date.now();
    // cast to any to satisfy overloads on fetch implementations
    f(item.args[0] as any, item.args[1])
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        if (queue.length > 0) {
          setTimeout(runNext, 0);
        } else {
          running = false;
        }
      });
  };

  return ((input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      queue.push({ args: [input, init], resolve, reject });
      if (!running) runNext();
    })) as unknown as typeof fetch;
}

/**
 * Create a lightweight TRPC-like client proxy backed by an untyped @trpc/client.
 *
 * The returned value is a proxy that supports nested property access and function
 * invocation to call remote procedures. For example:
 *
 * ```ts
 * const client = createTrpcClient({ url: 'https://api.example' });
 * const result = await client.article.getById({ id: 1 });
 * ```
 *
 * Internally each invocation builds a dot-joined path from the accessed properties
 * (e.g. `article.getById`) and calls the underlying client's `query(path, input)`.
 *
 * @param options - Configuration options for the TRPC-like client
 * @param options.url - The base URL used by the HTTP batch link
 * @param options.apiKey - Optional API key to include as `x-api-key` header
 * @param options.logger - Pass `false` to disable the `loggerLink`
 * @param options.fetch - Optional fetch implementation to use for requests
 * @param options.headers - Additional headers to include on every request
 * @param options.rateLimit - Set the rate limit for requests per minute. Defaults to `200` if API key provided, otherwise default to 100
 * @param options.maxBatchSize - Max number of operations per HTTP batch. Set to `1` to disable batching.
 * @param options.batchIntervalMs - Time window to batch operations before sending.
 * @returns A `TrpcLikeClient` proxy which can be invoked like `client.foo.bar(input)`
 */
export function createTrpcClient(options: TrpcLikeClientOptions & {rateLimit?: number}): TrpcLikeClient {
  const appliedRateLimit = options.rateLimit ?? (options.apiKey !== undefined ? 200 : 100);
  
  const client = createTRPCUntypedClient({
    links: [
      ...(options.logger === false ? [] : [loggerLink()]),
      httpBatchLink({
        url: options.url ?? "https://api2.warera.io/trpc",
        fetch: createRateLimitedFetch(options.fetch, appliedRateLimit),
        maxURLLength: 2000,
        headers() {
          return {
            ...(options.headers ?? {}),
            ...(options.apiKey ? { "x-api-key": options.apiKey } : {})
          };
        }
      })
    ]
  }) as unknown as UntypedClient;

  const makeProxy = (parts: string[]): any =>
    new Proxy(() => {}, {
      get(_t, prop) {
        if (typeof prop !== "string") return undefined;
        return makeProxy([...parts, prop]);
      },
      apply(_t, _thisArg, argArray) {
        const path = parts.join(".");
        const input = argArray?.[0] ?? {};
        
        // Check if auto-pagination is requested
        if (input.autoPaginate === true) {
          const { autoPaginate: _unused, maxPages, cursorEnd, ...cleanedInput } = input;
          return autoPaginate(client, path, cleanedInput, {
            maxPages,
            cursorEnd,
          });
        }
        
        // Regular query
        return client.query(path, input);
      }
    });

  return makeProxy([]) as TrpcLikeClient;
}
