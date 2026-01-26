'use client';

import { useAuth } from '../components/AuthProvider';
import {
  formatDateInTimezone,
  formatTimeInTimezone,
  formatShortDateInTimezone,
  formatFullDateInTimezone,
  formatDateTimeInTimezone,
  formatCurrency,
  getCurrencySymbol,
  getTimezoneLabel,
  getTimezoneFullName,
  getCurrentTimeInTimezone,
  isTodayInTimezone,
  getDayOfWeekInTimezone,
  formatTime24To12,
} from '../lib/timezone';

// Default timezone and currency if hospital not selected
const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_CURRENCY = 'USD';

/**
 * Hook to access hospital timezone and currency aware formatting functions.
 *
 * All dates and times displayed in the app should use these functions
 * to ensure consistency based on the hospital's location, not the user's.
 */
export function useHospitalTimezone() {
  const { currentHospital } = useAuth();

  const timezone = currentHospital?.timezone || DEFAULT_TIMEZONE;
  const currency = currentHospital?.currency || DEFAULT_CURRENCY;

  return {
    // Raw values
    timezone,
    currency,
    timezoneLabel: getTimezoneLabel(timezone),
    timezoneFullName: getTimezoneFullName(timezone),
    currencySymbol: getCurrencySymbol(currency),

    // Current time in hospital timezone
    getCurrentTime: () => getCurrentTimeInTimezone(timezone),

    // Date formatting
    formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) =>
      formatDateInTimezone(date, timezone, options),

    formatShortDate: (date: Date | string) => formatShortDateInTimezone(date, timezone),

    formatFullDate: (date: Date | string) => formatFullDateInTimezone(date, timezone),

    // Time formatting
    formatTime: (date: Date | string, includeSeconds = false) =>
      formatTimeInTimezone(date, timezone, includeSeconds),

    // Combined date and time
    formatDateTime: (
      date: Date | string,
      options?: { includeSeconds?: boolean; showTimezone?: boolean }
    ) => formatDateTimeInTimezone(date, timezone, options),

    // Currency formatting
    formatMoney: (amount: number) => formatCurrency(amount, currency),

    // Utility functions
    isToday: (date: Date | string) => isTodayInTimezone(date, timezone),
    getDayOfWeek: (date: Date | string) => getDayOfWeekInTimezone(date, timezone),

    // Format 24h time string to 12h (when time is already in hospital timezone)
    formatTime24To12,
  };
}

export default useHospitalTimezone;
