import { Resend } from 'resend';
import {
  EmailProvider,
  EmailMessage,
  SendResult,
  EmailAddress,
} from './interface';

/**
 * Resend Email Provider
 *
 * Environment variables:
 * - RESEND_API_KEY: Your Resend API key
 * - EMAIL_FROM: Default from address (e.g., "ClinQflow <noreply@yourdomain.com>")
 */
export class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  private client: Resend | null = null;
  private defaultFrom: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.defaultFrom = process.env.EMAIL_FROM || 'ClinQflow <onboarding@resend.dev>';

    if (apiKey) {
      this.client = new Resend(apiKey);
    }
  }

  isConfigured(): boolean {
    return !!this.client;
  }

  private formatAddress(addr: string | EmailAddress): string {
    if (typeof addr === 'string') {
      return addr;
    }
    return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
  }

  private formatAddresses(addrs: string | EmailAddress | (string | EmailAddress)[]): string[] {
    if (Array.isArray(addrs)) {
      return addrs.map(a => this.formatAddress(a));
    }
    return [this.formatAddress(addrs)];
  }

  async send(message: EmailMessage): Promise<SendResult> {
    if (!this.client) {
      console.warn('[ResendProvider] Not configured, logging email instead:');
      console.log('To:', message.to);
      console.log('Subject:', message.subject);
      console.log('HTML:', message.html?.substring(0, 500));
      return {
        messageId: 'console-' + Date.now(),
        accepted: this.formatAddresses(message.to),
        rejected: [],
      };
    }

    try {
      const toAddresses = this.formatAddresses(message.to);

      const { data, error } = await this.client.emails.send({
        from: message.from ? this.formatAddress(message.from) : this.defaultFrom,
        to: toAddresses,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo ? this.formatAddress(message.replyTo) : undefined,
        cc: message.cc ? this.formatAddresses(message.cc) : undefined,
        bcc: message.bcc ? this.formatAddresses(message.bcc) : undefined,
      });

      if (error) {
        console.error('[ResendProvider] Send error:', error);
        throw new Error(error.message);
      }

      console.log('[ResendProvider] Email sent successfully:', data?.id);

      return {
        messageId: data?.id || '',
        accepted: toAddresses,
        rejected: [],
      };
    } catch (error: any) {
      console.error('[ResendProvider] Failed to send email:', error.message);
      throw error;
    }
  }
}
