export type * from './api/Responses';
export type { components, operations, paths } from "./api/warera-openapi";
export {
    createAPIClient,
    /**
     * @deprecated Use createAPIClient instead
     */
    createAPIClient as createTrpcLikeClient
} from "./trpc-client";
export type {
    TrpcLikeClientOptions as APIClientOptions,
    /**
     * @deprecated Use APIClientOptions instead
     */
    TrpcLikeClientOptions
} from "./trpc-client";
export type { APIClient, InputFor, PageResult, PaginationOptions, ProcedureKey, ResponseFor } from "./typed-procedures";

