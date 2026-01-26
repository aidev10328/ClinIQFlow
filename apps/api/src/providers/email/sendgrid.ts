import {
  EmailProvider,
  EmailMessage,
  TemplateEmailMessage,
  SendResult,
  EmailAddress,
} from './interface';

/**
 * SendGrid Email Provider
 */
export class SendGridProvider implements EmailProvider {
  readonly name = 'sendgrid';
  private apiKey: string;
  private defaultFrom: string;

  constructor() {
    this.apiKey = process.env.SENDGRID_API_KEY || '';
    this.defaultFrom = process.env.EMAIL_FROM || process.env.SENDGRID_FROM || 'noreply@example.com';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private formatAddress(addr: string | EmailAddress): { email: string; name?: string } {
    if (typeof addr === 'string') {
      return { email: addr };
    }
    return { email: addr.email, name: addr.name };
  }

  private formatAddresses(addrs: string | EmailAddress | (string | EmailAddress)[]): Array<{ email: string; name?: string }> {
    if (Array.isArray(addrs)) {
      return addrs.map(a => this.formatAddress(a));
    }
    return [this.formatAddress(addrs)];
  }

  async send(message: EmailMessage): Promise<SendResult> {
    if (!this.isConfigured()) {
      throw new Error('SendGrid API key not configured');
    }

    const from = message.from ? this.formatAddress(message.from) : { email: this.defaultFrom };
    const to = this.formatAddresses(message.to);

    const payload: any = {
      personalizations: [
        {
          to,
          ...(message.cc && { cc: this.formatAddresses(message.cc) }),
          ...(message.bcc && { bcc: this.formatAddresses(message.bcc) }),
        },
      ],
      from,
      subject: message.subject,
      content: [],
    };

    if (message.replyTo) {
      payload.reply_to = this.formatAddress(message.replyTo);
    }

    if (message.text) {
      payload.content.push({ type: 'text/plain', value: message.text });
    }

    if (message.html) {
      payload.content.push({ type: 'text/html', value: message.html });
    }

    if (message.attachments?.length) {
      payload.attachments = message.attachments.map(att => ({
        filename: att.filename,
        content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
        type: att.contentType,
        disposition: 'attachment',
      }));
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid API error: ${response.status} - ${error}`);
    }

    const messageId = response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;

    return {
      messageId,
      accepted: to.map(t => t.email),
      rejected: [],
    };
  }

  async sendTemplate(message: TemplateEmailMessage): Promise<SendResult> {
    if (!this.isConfigured()) {
      throw new Error('SendGrid API key not configured');
    }

    const from = message.from ? this.formatAddress(message.from) : { email: this.defaultFrom };
    const to = this.formatAddresses(message.to);

    const payload: any = {
      personalizations: [
        {
          to,
          dynamic_template_data: message.templateData || {},
          ...(message.cc && { cc: this.formatAddresses(message.cc) }),
          ...(message.bcc && { bcc: this.formatAddresses(message.bcc) }),
        },
      ],
      from,
      template_id: message.templateId,
    };

    if (message.replyTo) {
      payload.reply_to = this.formatAddress(message.replyTo);
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid API error: ${response.status} - ${error}`);
    }

    const messageId = response.headers.get('x-message-id') || `sendgrid-${Date.now()}`;

    return {
      messageId,
      accepted: to.map(t => t.email),
      rejected: [],
    };
  }
}
