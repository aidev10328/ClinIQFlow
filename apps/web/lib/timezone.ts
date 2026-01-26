/**
 * Hospital Timezone Utilities
 *
 * All dates/times in the application should be displayed in the hospital's timezone,
 * not the user's local timezone. This ensures consistency across all users
 * regardless of their physical location.
 */

// Timezone display names for common timezones
export const TIMEZONE_LABELS: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Los_Angeles': 'PT',
  'America/Phoenix': 'AZ',
  'Europe/London': 'GMT',
  'Europe/Paris': 'CET',
  'Asia/Kolkata': 'IST',
  'Asia/Dubai': 'GST',
  'Asia/Singapore': 'SGT',
  'Australia/Sydney': 'AEDT',
};

// Full timezone names
export const TIMEZONE_FULL_NAMES: Record<string, string> = {
  'America/New_York': 'Eastern Time',
  'America/Chicago': 'Central Time',
  'America/Denver': 'Mountain Time',
  'America/Los_Angeles': 'Pacific Time',
  'America/Phoenix': 'Arizona Time',
  'Europe/London': 'London (GMT)',
  'Europe/Paris': 'Central European Time',
  'Asia/Kolkata': 'India Standard Time',
  'Asia/Dubai': 'Gulf Standard Time',
  'Asia/Singapore': 'Singapore Time',
  'Australia/Sydney': 'Australian Eastern Time',
};

// Currency symbols
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  AED: 'د.إ',
};

/**
 * Get short timezone label (e.g., "ET", "IST")
 */
export function getTimezoneLabel(timezone: string): string {
  return TIMEZONE_LABELS[timezone] || timezone.split('/').pop()?.replace(/_/g, ' ') || timezone;
}

/**
 * Get full timezone name
 */
export function getTimezoneFullName(timezone: string): string {
  return TIMEZONE_FULL_NAMES[timezone] || timezone.replace(/_/g, ' ');
}

/**
 * Get current time in a specific timezone
 */
export function getCurrentTimeInTimezone(timezone: string): Date {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);

  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

  return new Date(
    parseInt(getPart('year')),
    parseInt(getPart('month')) - 1,
    parseInt(getPart('day')),
    parseInt(getPart('hour')),
    parseInt(getPart('minute')),
    parseInt(getPart('second'))
  );
}

/**
 * Format a date in a specific timezone
 */
export function formatDateInTimezone(
  date: Date | string,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    ...options,
  };

  return new Intl.DateTimeFormat('en-US', defaultOptions).format(dateObj);
}

/**
 * Format time in 12-hour format in hospital timezone
 */
export function formatTimeInTimezone(
  date: Date | string,
  timezone: string,
  includeSeconds = false
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(includeSeconds && { second: '2-digit' }),
  };

  return new Intl.DateTimeFormat('en-US', options).format(dateObj);
}

/**
 * Format date as "Jan 25, 2026" in hospital timezone
 */
export function formatShortDateInTimezone(date: Date | string, timezone: string): string {
  return formatDateInTimezone(date, timezone, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date as "Monday, January 25, 2026" in hospital timezone
 */
export function formatFullDateInTimezone(date: Date | string, timezone: string): string {
  return formatDateInTimezone(date, timezone, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date and time together in hospital timezone
 */
export function formatDateTimeInTimezone(
  date: Date | string,
  timezone: string,
  options: { includeSeconds?: boolean; showTimezone?: boolean } = {}
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(options.includeSeconds && { second: '2-digit' }),
    ...(options.showTimezone && { timeZoneName: 'short' }),
  };

  return new Intl.DateTimeFormat('en-US', formatOptions).format(dateObj);
}

/**
 * Get the current date string (YYYY-MM-DD) in hospital timezone
 */
export function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  return formatDateInTimezone(now, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('-').replace(/(\d{4})-(\d{2})-(\d{2})/, '$1-$3-$2');
}

/**
 * Check if a date is today in the hospital timezone
 */
export function isTodayInTimezone(date: Date | string, timezone: string): boolean {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = getCurrentTimeInTimezone(timezone);

  const dateInTz = new Date(formatDateInTimezone(dateObj, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }));

  return (
    today.getFullYear() === dateInTz.getFullYear() &&
    today.getMonth() === dateInTz.getMonth() &&
    today.getDate() === dateInTz.getDate()
  );
}

/**
 * Get day of week (0-6, Sunday-Saturday) in hospital timezone
 */
export function getDayOfWeekInTimezone(date: Date | string, timezone: string): number {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dayStr = formatDateInTimezone(dateObj, timezone, { weekday: 'short' });
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayStr);
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Convert a local time string (HH:MM) to display format in hospital timezone
 * Note: This is for display purposes when the time is already in hospital timezone
 */
export function formatTime24To12(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get timezone offset string (e.g., "+05:30", "-08:00")
 */
export function getTimezoneOffset(timezone: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');

  if (offsetPart) {
    // Extract just the offset part (e.g., "GMT-8" -> "-08:00")
    const match = offsetPart.value.match(/GMT([+-]\d+(?::\d+)?)/);
    if (match) {
      const offset = match[1];
      // Normalize to standard format
      if (!offset.includes(':')) {
        const hours = parseInt(offset);
        return `${hours >= 0 ? '+' : ''}${hours.toString().padStart(2, '0')}:00`;
      }
      return offset;
    }
  }

  return '';
}
