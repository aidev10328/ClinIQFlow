/**
 * Email Provider Interface
 * Allows swapping between SendGrid, SMTP, AWS SES, Resend, etc.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface Attachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailMessage {
  to: string | EmailAddress | (string | EmailAddress)[];
  from?: string | EmailAddress;
  replyTo?: string | EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  cc?: string | EmailAddress | (string | EmailAddress)[];
  bcc?: string | EmailAddress | (string | EmailAddress)[];
  attachments?: Attachment[];
  headers?: Record<string, string>;
}

export interface TemplateEmailMessage extends Omit<EmailMessage, 'text' | 'html'> {
  templateId: string;
  templateData?: Record<string, any>;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export interface EmailProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Send an email
   */
  send(message: EmailMessage): Promise<SendResult>;

  /**
   * Send an email using a template (if supported by provider)
   */
  sendTemplate?(message: TemplateEmailMessage): Promise<SendResult>;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
}

export type EmailProviderType = 'sendgrid' | 'smtp' | 'ses' | 'resend' | 'console';
