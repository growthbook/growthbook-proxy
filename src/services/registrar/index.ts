import dotenv from "dotenv";
dotenv.config({ path: "./.env.local" });

export interface WebhookEntry {
  apiKey: string;
  url: string;
  secret: string;
}

export interface Settings {
  initialWebhooks?: WebhookEntry[];
}

export class Registrar {
  private apiKeyWebhooks: Map<string, WebhookEntry>;

  constructor() {
    this.apiKeyWebhooks = new Map();
    const settings = this.getInitialSettings();
    if (settings?.initialWebhooks) {
      settings.initialWebhooks.forEach(w => this.apiKeyWebhooks.set(w.apiKey, w));
    }
  }

  public getWebhook(apiKey: string): WebhookEntry|undefined {
    return this.apiKeyWebhooks.get(apiKey);
  }

  public setWebhook(apiKey: string, webhookEntry: WebhookEntry) {
    this.apiKeyWebhooks.set(apiKey, webhookEntry);
  }

  private getInitialSettings() {
    const WEBHOOKS_JSON = process.env?.WEBHOOKS_JSON ?? null;

    let registrarSettings: Settings = {};
    if (WEBHOOKS_JSON) {
      try {
        let o = JSON.parse(WEBHOOKS_JSON);
        if (o.length) {
          registrarSettings.initialWebhooks = [];
          o.forEach((we: any) => {
            if (we.apiKey && we.url && we.secret) {
              registrarSettings?.initialWebhooks?.push(we);
            }
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    return registrarSettings;
  }
}

export const registrar = new Registrar();
Object.freeze(registrar);
