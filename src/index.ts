export type { components, operations, paths } from "./api/warera-openapi";
export {
    createTrpcClient as createAPIClient,
    /**
     * @deprecated Use createAPIClient instead
     */
    createTrpcClient as createTrpcLikeClient
} from "./trpc-client";
export type {
    TrpcLikeClientOptions as APIClientOptions,
    /**
     * @deprecated Use APIClientOptions instead
     */
    TrpcLikeClientOptions
} from "./trpc-client";
export type { InputFor, ProcedureKey, ResponseFor, TrpcLikeClient, PaginationOptions, PageResult } from "./typed-procedures";

