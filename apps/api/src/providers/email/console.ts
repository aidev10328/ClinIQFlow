import {
  EmailProvider,
  EmailMessage,
  TemplateEmailMessage,
  SendResult,
  EmailAddress,
} from './interface';

/**
 * Console Email Provider
 * Logs emails to console instead of sending them
 * Useful for development and testing
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  isConfigured(): boolean {
    return true; // Always configured
  }

  private formatAddress(addr: string | EmailAddress): string {
    if (typeof addr === 'string') return addr;
    return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
  }

  private formatAddresses(addrs: string | EmailAddress | (string | EmailAddress)[]): string {
    if (Array.isArray(addrs)) {
      return addrs.map(a => this.formatAddress(a)).join(', ');
    }
    return this.formatAddress(addrs);
  }

  async send(message: EmailMessage): Promise<SendResult> {
    const to = this.formatAddresses(message.to);
    const from = message.from ? this.formatAddress(message.from) : 'noreply@example.com';

    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL (Console Provider - Not Sent)');
    console.log('='.repeat(60));
    console.log(`From:    ${from}`);
    console.log(`To:      ${to}`);
    if (message.cc) console.log(`CC:      ${this.formatAddresses(message.cc)}`);
    if (message.bcc) console.log(`BCC:     ${this.formatAddresses(message.bcc)}`);
    if (message.replyTo) console.log(`ReplyTo: ${this.formatAddress(message.replyTo)}`);
    console.log(`Subject: ${message.subject}`);
    console.log('-'.repeat(60));
    if (message.text) {
      console.log('Text Body:');
      console.log(message.text);
    }
    if (message.html) {
      console.log('-'.repeat(60));
      console.log('HTML Body:');
      console.log(message.html);
    }
    if (message.attachments?.length) {
      console.log('-'.repeat(60));
      console.log(`Attachments: ${message.attachments.map(a => a.filename).join(', ')}`);
    }
    console.log('='.repeat(60) + '\n');

    const recipients = Array.isArray(message.to)
      ? message.to.map(t => typeof t === 'string' ? t : t.email)
      : [typeof message.to === 'string' ? message.to : message.to.email];

    return {
      messageId: `console-${Date.now()}`,
      accepted: recipients,
      rejected: [],
    };
  }

  async sendTemplate(message: TemplateEmailMessage): Promise<SendResult> {
    const to = this.formatAddresses(message.to);
    const from = message.from ? this.formatAddress(message.from) : 'noreply@example.com';

    console.log('\n' + '='.repeat(60));
    console.log('📧 TEMPLATE EMAIL (Console Provider - Not Sent)');
    console.log('='.repeat(60));
    console.log(`From:       ${from}`);
    console.log(`To:         ${to}`);
    console.log(`Subject:    ${message.subject}`);
    console.log(`Template:   ${message.templateId}`);
    console.log('-'.repeat(60));
    console.log('Template Data:');
    console.log(JSON.stringify(message.templateData || {}, null, 2));
    console.log('='.repeat(60) + '\n');

    const recipients = Array.isArray(message.to)
      ? message.to.map(t => typeof t === 'string' ? t : t.email)
      : [typeof message.to === 'string' ? message.to : message.to.email];

    return {
      messageId: `console-template-${Date.now()}`,
      accepted: recipients,
      rejected: [],
    };
  }
}
