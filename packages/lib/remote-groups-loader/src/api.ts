import http, { IncomingMessage } from "http";
import https from "https";

/** A remote saved group, as the loader needs it from GrowthBook's API. */
export type RemoteGroup = {
  id: string;
  attributeKey: string;
  /** The upload whose IDs the group uses, or null if it has none. */
  currentUpload: {
    version: number;
    /** Whether the group's attribute is a number. */
    numeric: boolean;
  } | null;
};

/** A store's result for one upload, reported back to GrowthBook. */
export type LoadStatus =
  | { type: "loading" }
  | { type: "loaded"; rowCount: number }
  | { type: "invalid"; invalidLineCount: number; errors: string[] }
  | { type: "failed"; error: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type ApiSavedGroupPage = {
  savedGroups: {
    id: string;
    type: string;
    attributeKey?: string;
    currentUpload?: { version: number; numeric?: boolean } | null;
  }[];
  hasMore: boolean;
  nextOffset: number | null;
};

const PAGE_SIZE = 100;
// Load reports allow at most this many characters per error
const MAX_ERROR_LENGTH = 2000;

/** The parts of GrowthBook's REST API the loader uses. */
export class GrowthBookApi {
  private readonly apiHost: string;
  private readonly apiKey: string;

  constructor(apiHost: string, apiKey: string) {
    this.apiHost = apiHost.replace(/\/*$/, "");
    this.apiKey = apiKey;
  }

  async listRemoteGroups(): Promise<RemoteGroup[]> {
    const groups: RemoteGroup[] = [];
    let offset = 0;
    for (;;) {
      const res = await this.request(
        `/api/v1/saved-groups?type=remote&limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const page = (await res.json()) as ApiSavedGroupPage;
      for (const g of page.savedGroups) {
        if (g.type !== "remote" || !g.attributeKey) continue;
        groups.push({
          id: g.id,
          attributeKey: g.attributeKey,
          currentUpload: g.currentUpload
            ? {
                version: g.currentUpload.version,
                numeric: g.currentUpload.numeric === true,
              }
            : null,
        });
      }
      if (!page.hasMore || page.nextOffset === null) return groups;
      offset = page.nextOffset;
    }
  }

  /**
   * An upload's file. The API redirects to a signed storage URL, which is
   * fetched without the API key, whatever its host.
   *
   * Uses Node's http module, not fetch: the loader reads slowly while it
   * writes to Redis, and undici's fetch can crash the process when the server
   * closes a paused download.
   */
  async downloadUpload(id: string, version: number): Promise<IncomingMessage> {
    const url = new URL(this.url(`${uploadPath(id, version)}/file`));
    let res = await get(url, this.headers());
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      res.resume();
      const location = res.headers.location;
      if (!location) {
        throw new ApiError(`Download of ${id} v${version} had no location`, 0);
      }
      res = await get(new URL(location, url), {});
    }
    if (res.statusCode !== 200) {
      res.resume();
      throw new ApiError(
        `Download of ${id} v${version} failed: ${res.statusCode}`,
        res.statusCode ?? 0,
      );
    }
    return res;
  }

  async reportLoad(
    id: string,
    version: number,
    storeId: string,
    status: LoadStatus,
  ): Promise<void> {
    await this.request(`${uploadPath(id, version)}/loads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        status:
          status.type === "failed"
            ? { ...status, error: status.error.slice(0, MAX_ERROR_LENGTH) }
            : status,
      }),
    });
  }

  private async request(path: string, init: RequestInit = {}) {
    const res = await fetch(this.url(path), {
      ...init,
      headers: { ...this.headers(), ...init.headers },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(
        `GrowthBook API ${init.method ?? "GET"} ${path} failed: ${res.status} ${body.slice(0, 500)}`,
        res.status,
      );
    }
    return res;
  }

  private url(path: string) {
    return `${this.apiHost}${path}`;
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }
}

function get(url: URL, headers: Record<string, string>) {
  const client = url.protocol === "https:" ? https : http;
  return new Promise<IncomingMessage>((resolve, reject) => {
    client.get(url, { headers }, resolve).on("error", reject);
  });
}

function uploadPath(id: string, version: number) {
  return `/api/v1/saved-groups/${encodeURIComponent(id)}/uploads/${version}`;
}
