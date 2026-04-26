/**
 * lib/country-codes.ts
 *
 * Curated list of country dial codes for the patient intake phone field.
 *
 * We deliberately *don't* ship the full ISO-3166 list — it's 250+ entries,
 * a usability disaster on a clinic intake form, and most clinics serve a
 * regional patient base. The list below covers ~90% of real-world cases
 * for a US-default deployment; adding more is a one-line append.
 *
 * The default country is the United States, per product requirement.
 */

export interface CountryCode {
  /** ISO-3166 alpha-2. */
  iso: string;
  /** Display name (English). */
  name: string;
  /** Dial code with the leading '+'. */
  dial: string;
  /** Emoji flag (decorative; not used as the only signal). */
  flag: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { iso: 'US', name: 'United States', dial: '+1',   flag: '🇺🇸' },
  { iso: 'CA', name: 'Canada',        dial: '+1',   flag: '🇨🇦' },
  { iso: 'MX', name: 'Mexico',        dial: '+52',  flag: '🇲🇽' },
  { iso: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { iso: 'IE', name: 'Ireland',       dial: '+353', flag: '🇮🇪' },
  { iso: 'DE', name: 'Germany',       dial: '+49',  flag: '🇩🇪' },
  { iso: 'FR', name: 'France',        dial: '+33',  flag: '🇫🇷' },
  { iso: 'ES', name: 'Spain',         dial: '+34',  flag: '🇪🇸' },
  { iso: 'IT', name: 'Italy',         dial: '+39',  flag: '🇮🇹' },
  { iso: 'NL', name: 'Netherlands',   dial: '+31',  flag: '🇳🇱' },
  { iso: 'IN', name: 'India',         dial: '+91',  flag: '🇮🇳' },
  { iso: 'PK', name: 'Pakistan',      dial: '+92',  flag: '🇵🇰' },
  { iso: 'BD', name: 'Bangladesh',    dial: '+880', flag: '🇧🇩' },
  { iso: 'NP', name: 'Nepal',         dial: '+977', flag: '🇳🇵' },
  { iso: 'CN', name: 'China',         dial: '+86',  flag: '🇨🇳' },
  { iso: 'JP', name: 'Japan',         dial: '+81',  flag: '🇯🇵' },
  { iso: 'KR', name: 'South Korea',   dial: '+82',  flag: '🇰🇷' },
  { iso: 'SG', name: 'Singapore',     dial: '+65',  flag: '🇸🇬' },
  { iso: 'AU', name: 'Australia',     dial: '+61',  flag: '🇦🇺' },
  { iso: 'NZ', name: 'New Zealand',   dial: '+64',  flag: '🇳🇿' },
  { iso: 'BR', name: 'Brazil',        dial: '+55',  flag: '🇧🇷' },
  { iso: 'AR', name: 'Argentina',     dial: '+54',  flag: '🇦🇷' },
  { iso: 'AE', name: 'UAE',           dial: '+971', flag: '🇦🇪' },
  { iso: 'SA', name: 'Saudi Arabia',  dial: '+966', flag: '🇸🇦' },
  { iso: 'ZA', name: 'South Africa',  dial: '+27',  flag: '🇿🇦' },
  { iso: 'NG', name: 'Nigeria',       dial: '+234', flag: '🇳🇬' },
  { iso: 'KE', name: 'Kenya',         dial: '+254', flag: '🇰🇪' },
  { iso: 'EG', name: 'Egypt',         dial: '+20',  flag: '🇪🇬' },
];

export const DEFAULT_COUNTRY_ISO = 'US';

export function findCountry(iso: string | undefined): CountryCode {
  return (
    COUNTRY_CODES.find(c => c.iso === iso) ??
    COUNTRY_CODES.find(c => c.iso === DEFAULT_COUNTRY_ISO)!
  );
}

/**
 * Format a stored phone-number-with-country into a single human string.
 * If the stored phone already starts with a '+', we trust it as-is —
 * older case rows pre-date the country picker and may already be E.164.
 */
export function formatPhoneWithCountry(
  phone: string | null | undefined,
  iso?: string | null,
): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const country = findCountry(iso ?? undefined);
  return `${country.dial} ${trimmed}`;
}
