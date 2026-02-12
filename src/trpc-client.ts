import { createTRPCUntypedClient, httpBatchLink, loggerLink } from "@trpc/client";
import type { TrpcLikeClient } from "./typed-procedures";

export interface TrpcLikeClientOptions {
  url: string;
  apiKey?: string;
  logger?: boolean;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type UntypedClient = {
  query: (path: string, input: unknown) => Promise<unknown>;
};

export function createTrpcClient(options: TrpcLikeClientOptions): TrpcLikeClient {
  const client = createTRPCUntypedClient({
    links: [
      ...(options.logger === false ? [] : [loggerLink()]),
      httpBatchLink({
        url: options.url,
        fetch: options.fetch,
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
      async apply(_t, _thisArg, argArray) {
        const path = parts.join(".");
        const input = argArray?.[0] ?? {};
        return client.query(path, input);
      }
    });

  return makeProxy([]) as TrpcLikeClient;
}
