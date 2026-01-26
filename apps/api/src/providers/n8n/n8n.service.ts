import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface N8nWebhookPayload {
  event: string;
  timestamp: string;
  data: Record<string, any>;
}

@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  private readonly baseUrl: string;
  private readonly webhookPath: string;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('N8N_BASE_URL') || 'http://localhost:5678';
    this.webhookPath = this.configService.get<string>('N8N_WEBHOOK_PATH') || '/webhook';
    this.enabled = this.configService.get<string>('N8N_ENABLED') === 'true';
  }

  private getWebhookUrl(endpoint: string): string {
    return `${this.baseUrl}${this.webhookPath}/${endpoint}`;
  }

  async triggerWebhook(endpoint: string, data: Record<string, any>): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug('n8n integration disabled, skipping webhook');
      return false;
    }

    const url = this.getWebhookUrl(endpoint);
    const payload: N8nWebhookPayload = {
      event: endpoint,
      timestamp: new Date().toISOString(),
      data,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        this.logger.log(`Webhook triggered successfully: ${endpoint}`);
        return true;
      } else {
        this.logger.warn(`Webhook failed with status ${response.status}: ${endpoint}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to trigger webhook ${endpoint}: ${error.message}`);
      return false;
    }
  }

  // Pre-defined event triggers
  async onUserRegistered(user: { id: string; email: string; firstName?: string; lastName?: string }) {
    return this.triggerWebhook('user-registered', {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }

  async onUserLoggedIn(user: { id: string; email: string }) {
    return this.triggerWebhook('user-logged-in', {
      userId: user.id,
      email: user.email,
    });
  }

  async onCustomEvent(eventName: string, data: Record<string, any>) {
    return this.triggerWebhook(eventName, data);
  }
}
