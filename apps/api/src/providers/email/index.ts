import { EmailProvider, EmailProviderType } from './interface';
import { SendGridProvider } from './sendgrid';
import { ConsoleEmailProvider } from './console';
import { ResendProvider } from './resend';

export * from './interface';
export { SendGridProvider } from './sendgrid';
export { ConsoleEmailProvider } from './console';
export { ResendProvider } from './resend';

// Singleton instance
let cachedProvider: EmailProvider | null = null;
let cachedProviderType: string | null = null;

/**
 * Get the configured email provider
 * Provider is determined by EMAIL_PROVIDER env variable
 *
 * @example
 * // .env
 * EMAIL_PROVIDER=sendgrid
 * SENDGRID_API_KEY=SG...
 * EMAIL_FROM=noreply@myapp.com
 *
 * // Usage
 * const email = getEmailProvider();
 * await email.send({
 *   to: 'user@example.com',
 *   subject: 'Welcome!',
 *   html: '<h1>Welcome to our app!</h1>'
 * });
 */
export function getEmailProvider(): EmailProvider {
  const providerType = (process.env.EMAIL_PROVIDER || 'console') as EmailProviderType;

  // Return cached provider if type hasn't changed
  if (cachedProvider && cachedProviderType === providerType) {
    return cachedProvider;
  }

  switch (providerType) {
    case 'sendgrid':
      cachedProvider = new SendGridProvider();
      break;
    case 'console':
      cachedProvider = new ConsoleEmailProvider();
      break;
    case 'smtp':
      // SMTP implementation can be added using nodemailer
      console.warn('SMTP email not implemented, falling back to console');
      cachedProvider = new ConsoleEmailProvider();
      break;
    case 'ses':
      // AWS SES implementation can be added later
      console.warn('AWS SES email not implemented, falling back to console');
      cachedProvider = new ConsoleEmailProvider();
      break;
    case 'resend':
      cachedProvider = new ResendProvider();
      break;
    default:
      console.warn(`Unknown email provider: ${providerType}, falling back to console`);
      cachedProvider = new ConsoleEmailProvider();
  }

  cachedProviderType = providerType;
  return cachedProvider;
}

/**
 * Create a specific email provider instance
 */
export function createEmailProvider(type: EmailProviderType): EmailProvider {
  switch (type) {
    case 'sendgrid':
      return new SendGridProvider();
    case 'resend':
      return new ResendProvider();
    case 'console':
      return new ConsoleEmailProvider();
    default:
      throw new Error(`Unknown email provider type: ${type}`);
  }
}
