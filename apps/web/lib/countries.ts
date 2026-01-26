/**
 * Country codes and dial codes for phone number handling
 */

export interface CountryInfo {
  code: string;      // ISO 3166-1 alpha-2 country code
  name: string;      // Country name
  dialCode: string;  // Phone dial code (e.g., "+1")
  flag: string;      // Flag emoji
}

// Common countries with their dial codes
export const COUNTRIES: CountryInfo[] = [
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { code: 'BE', name: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾' },
  { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { code: 'TW', name: 'Taiwan', dialCode: '+886', flag: '🇹🇼' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { code: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { code: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷' },
  { code: 'RU', name: 'Russia', dialCode: '+7', flag: '🇷🇺' },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },
  { code: 'GR', name: 'Greece', dialCode: '+30', flag: '🇬🇷' },
  { code: 'CZ', name: 'Czech Republic', dialCode: '+420', flag: '🇨🇿' },
  { code: 'HU', name: 'Hungary', dialCode: '+36', flag: '🇭🇺' },
  { code: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴' },
  { code: 'BG', name: 'Bulgaria', dialCode: '+359', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatia', dialCode: '+385', flag: '🇭🇷' },
  { code: 'SK', name: 'Slovakia', dialCode: '+421', flag: '🇸🇰' },
  { code: 'SI', name: 'Slovenia', dialCode: '+386', flag: '🇸🇮' },
  { code: 'RS', name: 'Serbia', dialCode: '+381', flag: '🇷🇸' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵' },
];

// Map of country code to dial code for quick lookup
export const COUNTRY_DIAL_CODES: Record<string, string> = COUNTRIES.reduce(
  (acc, country) => ({ ...acc, [country.code]: country.dialCode }),
  {}
);

// Map of country name to country code for lookup by name
export const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'United States': 'US',
  'USA': 'US',
  'US': 'US',
  'Canada': 'CA',
  'United Kingdom': 'GB',
  'UK': 'GB',
  'Great Britain': 'GB',
  'England': 'GB',
  'India': 'IN',
  'Australia': 'AU',
  'Germany': 'DE',
  'France': 'FR',
  'Italy': 'IT',
  'Spain': 'ES',
  'Netherlands': 'NL',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Austria': 'AT',
  'Sweden': 'SE',
  'Norway': 'NO',
  'Denmark': 'DK',
  'Finland': 'FI',
  'Ireland': 'IE',
  'Portugal': 'PT',
  'Poland': 'PL',
  'United Arab Emirates': 'AE',
  'UAE': 'AE',
  'Saudi Arabia': 'SA',
  'Singapore': 'SG',
  'Malaysia': 'MY',
  'Thailand': 'TH',
  'Japan': 'JP',
  'South Korea': 'KR',
  'Korea': 'KR',
  'China': 'CN',
  'Hong Kong': 'HK',
  'Taiwan': 'TW',
  'Philippines': 'PH',
  'Indonesia': 'ID',
  'Vietnam': 'VN',
  'New Zealand': 'NZ',
  'South Africa': 'ZA',
  'Nigeria': 'NG',
  'Egypt': 'EG',
  'Kenya': 'KE',
  'Brazil': 'BR',
  'Mexico': 'MX',
  'Argentina': 'AR',
  'Chile': 'CL',
  'Colombia': 'CO',
  'Peru': 'PE',
  'Israel': 'IL',
  'Turkey': 'TR',
  'Russia': 'RU',
  'Ukraine': 'UA',
  'Greece': 'GR',
  'Czech Republic': 'CZ',
  'Hungary': 'HU',
  'Romania': 'RO',
  'Bulgaria': 'BG',
  'Croatia': 'HR',
  'Slovakia': 'SK',
  'Slovenia': 'SI',
  'Serbia': 'RS',
  'Sri Lanka': 'LK',
  'Bangladesh': 'BD',
  'Pakistan': 'PK',
  'Nepal': 'NP',
};

/**
 * Get country info by country code
 */
export function getCountryByCode(code: string): CountryInfo | undefined {
  return COUNTRIES.find(c => c.code === code.toUpperCase());
}

/**
 * Get country info by country name (case-insensitive)
 */
export function getCountryByName(name: string): CountryInfo | undefined {
  const code = COUNTRY_NAME_TO_CODE[name] || COUNTRY_NAME_TO_CODE[name.toUpperCase()];
  if (code) {
    return getCountryByCode(code);
  }
  // Fallback: search by name directly
  return COUNTRIES.find(c => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get dial code for a country (by code or name)
 */
export function getDialCode(countryCodeOrName: string): string {
  // Try by code first
  const byCode = COUNTRY_DIAL_CODES[countryCodeOrName.toUpperCase()];
  if (byCode) return byCode;

  // Try by name
  const country = getCountryByName(countryCodeOrName);
  return country?.dialCode || '+1'; // Default to US
}

/**
 * Parse a phone number to extract dial code and local number
 */
export function parsePhoneNumber(phone: string): { dialCode: string; localNumber: string } {
  if (!phone) return { dialCode: '+1', localNumber: '' };

  const cleaned = phone.replace(/\s/g, '');

  // Check if starts with a dial code
  for (const country of COUNTRIES) {
    if (cleaned.startsWith(country.dialCode)) {
      return {
        dialCode: country.dialCode,
        localNumber: cleaned.slice(country.dialCode.length).replace(/^[\s-]/, ''),
      };
    }
  }

  // No dial code found, return as-is with default dial code
  return {
    dialCode: '+1',
    localNumber: cleaned.replace(/^\+/, ''),
  };
}

/**
 * Format a phone number with dial code
 */
export function formatPhoneWithDialCode(dialCode: string, localNumber: string): string {
  if (!localNumber) return '';
  const cleanLocal = localNumber.replace(/[^\d]/g, '');
  return `${dialCode} ${cleanLocal}`;
}

/**
 * Get default country code based on hospital region
 */
export function getDefaultCountryForRegion(region: string): string {
  const regionMap: Record<string, string> = {
    'US': 'US',
    'UK': 'GB',
    'IN': 'IN',
    'AU': 'AU',
    'EU': 'DE', // Default to Germany for EU region
    'ASIA': 'SG', // Default to Singapore for Asia region
    'ME': 'AE', // Default to UAE for Middle East region
  };
  return regionMap[region?.toUpperCase()] || 'US';
}
