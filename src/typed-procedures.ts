import type { Responses } from "./api/Responses";
import type { operations } from "./api/warera-openapi";

export type ProcedureKey = keyof operations;

type JsonContent<T> = T extends { content: { "application/json": infer C } }
  ? C
  : never;

export type PaginationOptions = {
  autoPaginate?: boolean;
  maxPages?: number;
  cursorEnd?: Date;
};

type BaseInputFor<K extends ProcedureKey> = operations[K] extends {
  requestBody?: infer RB;
}
  ? JsonContent<RB>
  : never;

type IsPaginatedResponse<T> = T extends { items: any[]; nextCursor: string }
  ? true
  : false;

type ExtractItems<T> = T extends { items: infer I }
  ? I extends Array<infer Item>
    ? Item
    : never
  : never;

export type InputFor<K extends ProcedureKey> = IsPaginatedResponse<
  ResponseFor<K>
> extends true
  ? BaseInputFor<K> & Partial<PaginationOptions>
  : BaseInputFor<K>;

type ResponseFromOpenApi<K extends ProcedureKey> = operations[K] extends {
  responses: { 200: infer R };
}
  ? JsonContent<R> extends never
    ? unknown
    : JsonContent<R>
  : unknown;

export type ResponseFor<K extends ProcedureKey> = K extends keyof Responses
  ? Responses[K]
  : ResponseFromOpenApi<K>;

export type PageResult<K extends ProcedureKey> = {
  items: ExtractItems<ResponseFor<K>>[];
  cursor: string;
};

export type TrpcProcedure<K extends ProcedureKey> = {
  key: K;
};

type Split<S extends string, D extends string> = S extends `${infer A}${D}${infer B}`
  ? [A, ...Split<B, D>]
  : [S];

type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;

type MergeDeep<T> = { [K in keyof T]: T[K] };

type ProcedureFunction<K extends ProcedureKey> = IsPaginatedResponse<
  ResponseFor<K>
> extends true
  ? {
      (input: InputFor<K> & { autoPaginate: true }): AsyncIterableIterator<
        PageResult<K>
      >;
      (input: InputFor<K>): Promise<ResponseFor<K>>;
    }
  : (input: InputFor<K>) => Promise<ResponseFor<K>>;

type BuildPath<Parts extends string[], K extends ProcedureKey> = Parts extends [
  infer H extends string,
  ...infer R extends string[]
]
  ? R["length"] extends 0
    ? { [P in H]: ProcedureFunction<K> }
    : { [P in H]: BuildPath<R, K> }
  : never;

type TreeFromKeys<Keys extends string> = UnionToIntersection<
  Keys extends ProcedureKey
    ? BuildPath<Split<Extract<Keys, string>, ".">, Keys>
    : never
>;

export type TrpcLikeClient = MergeDeep<TreeFromKeys<Extract<ProcedureKey, string>>>;

export function procedure<K extends ProcedureKey>(key: K): TrpcProcedure<K> {
  return { key };
}

export async function trpcQuery<K extends ProcedureKey>(
  client: { query: (path: K, input: InputFor<K>) => Promise<ResponseFor<K>> },
  proc: TrpcProcedure<K>,
  input: InputFor<K>
) {
  return client.query(proc.key, input);
}
