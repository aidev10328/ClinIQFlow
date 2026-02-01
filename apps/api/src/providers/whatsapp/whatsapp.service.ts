import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly enabled: boolean;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly templateName: string;
  private readonly templateLanguage: string;
  private readonly apiVersion = 'v21.0';

  constructor(private configService: ConfigService) {
    this.enabled = this.configService.get<string>('WHATSAPP_ENABLED') === 'true';
    this.accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN') || '';
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
    this.templateName = this.configService.get<string>('WHATSAPP_TEMPLATE_NAME') || 'patient_welcome';
    this.templateLanguage = this.configService.get<string>('WHATSAPP_TEMPLATE_LANGUAGE') || 'en';

    if (this.enabled) {
      if (!this.accessToken || !this.phoneNumberId) {
        this.logger.warn('WhatsApp is enabled but missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
      } else {
        this.logger.log('WhatsApp Cloud API integration enabled');
      }
    } else {
      this.logger.debug('WhatsApp integration disabled');
    }
  }

  /**
   * Send a template message via WhatsApp Cloud API
   */
  async sendTemplateMessage(
    recipientPhone: string,
    templateName: string,
    languageCode: string,
    parameters: string[],
  ): Promise<WhatsAppSendResult> {
    if (!this.enabled) {
      this.logger.debug('WhatsApp disabled, skipping message');
      return { success: false, error: 'WhatsApp integration disabled' };
    }

    if (!this.accessToken || !this.phoneNumberId) {
      this.logger.warn('WhatsApp credentials not configured');
      return { success: false, error: 'WhatsApp credentials not configured' };
    }

    // Normalize phone: strip spaces/dashes, ensure starts with country code
    const cleanPhone = recipientPhone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const body: any = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    // Add template parameters if provided
    if (parameters.length > 0) {
      body.template.components = [
        {
          type: 'body',
          parameters: parameters.map(value => ({
            type: 'text',
            text: value,
          })),
        },
      ];
    }

    try {
      this.logger.debug(`Sending WhatsApp template "${templateName}" to ${cleanPhone}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.messages?.[0]?.id) {
        const messageId = data.messages[0].id;
        this.logger.log(`WhatsApp message sent successfully: ${messageId} to ${cleanPhone}`);
        return { success: true, messageId };
      } else {
        const errorMsg = data.error?.message || JSON.stringify(data);
        this.logger.error(`WhatsApp API error: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`WhatsApp send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Send patient welcome notification
   * Uses cliniq_patient_welcome template: {{1}} = patient name, {{2}} = hospital name
   */
  async sendPatientWelcome(
    recipientPhone: string,
    patientName: string,
    hospitalName: string,
  ): Promise<WhatsAppSendResult> {
    return this.sendTemplateMessage(
      recipientPhone,
      this.templateName,
      this.templateLanguage,
      [patientName, hospitalName],
    );
  }

  /**
   * Send a simple text message (only works if user has messaged within 24h)
   */
  async sendTextMessage(
    recipientPhone: string,
    message: string,
  ): Promise<WhatsAppSendResult> {
    if (!this.enabled) {
      this.logger.debug('WhatsApp disabled, skipping message');
      return { success: false, error: 'WhatsApp integration disabled' };
    }

    const cleanPhone = recipientPhone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'text',
      text: { body: message },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.messages?.[0]?.id) {
        return { success: true, messageId: data.messages[0].id };
      } else {
        const errorMsg = data.error?.message || JSON.stringify(data);
        this.logger.error(`WhatsApp text message error: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`WhatsApp text send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
