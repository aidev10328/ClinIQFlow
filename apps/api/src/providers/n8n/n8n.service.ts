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
    this.logger.log(`n8n config: enabled=${this.enabled}, baseUrl=${this.baseUrl}, webhookPath=${this.webhookPath}`);
  }

  private getWebhookUrl(endpoint: string): string {
    return `${this.baseUrl}${this.webhookPath}/${endpoint}`;
  }

  async triggerWebhook(endpoint: string, data: Record<string, any>): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('n8n integration disabled, skipping webhook');
      return false;
    }

    const url = this.getWebhookUrl(endpoint);
    this.logger.log(`Triggering n8n webhook: ${url}`);
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

  async onPatientCreated(patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
    hospitalId: string;
    hospitalName?: string;
    whatsappResult?: { sent: boolean; messageId?: string; error?: string };
  }) {
    return this.triggerWebhook('ddc295ed-4c5d-4243-8dce-f271ded16955', {
      patientId: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      email: patient.email,
      hospitalId: patient.hospitalId,
      hospitalName: patient.hospitalName,
      whatsappResult: patient.whatsappResult || { sent: false },
    });
  }

  async onCustomEvent(eventName: string, data: Record<string, any>) {
    return this.triggerWebhook(eventName, data);
  }
}
