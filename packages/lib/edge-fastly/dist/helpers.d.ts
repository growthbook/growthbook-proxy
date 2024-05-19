import { Context } from "@growthbook/edge-utils";
export declare function getRequestURL(req: Request): string;
export declare function getRequestMethod(req: Request): string;
export declare function getRequestHeader(req: Request, key: string): string | undefined;
export declare function sendResponse(ctx: Context<Request, Response>, _?: Response, headers?: Record<string, any>, body?: string, cookies?: Record<string, string>, status?: number): Response;
export declare function fetchFn(ctx: Context<Request, Response>, url: string): Promise<Response>;
export declare function proxyRequest(ctx: Context<Request, Response>, req: Request): Promise<Response>;
export declare function getCookie(req: Request, key: string): string;
export declare function setCookie(res: Response, key: string, value: string): void;
