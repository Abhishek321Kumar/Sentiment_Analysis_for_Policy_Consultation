/**
 * locationService.js
 * Comprehensive location service powering Country, State, and City fetching:
 * - Countries & Flags & Cities & IP detection: https://countries.dev/
 * - States / Provinces: https://countriesnow.space/
 * 
 * Includes local caching, timeouts, offline fallbacks, and manual input fallbacks.
 */

const COUNTRY_CACHE_KEY = 'potentpolicy_cached_countries';
const memoryCache = {
  countries: null,
  statesByCountry: {},
  citiesByCountry: {},
};

// Curated high-reliability offline fallback list of countries with emojis & ISO codes
export const FALLBACK_COUNTRIES = [
  { name: 'India', flag: '🇮🇳', alpha2Code: 'IN' },
  { name: 'United States', flag: '🇺🇸', alpha2Code: 'US' },
  { name: 'United Kingdom', flag: '🇬🇧', alpha2Code: 'GB' },
  { name: 'Canada', flag: '🇨🇦', alpha2Code: 'CA' },
  { name: 'Australia', flag: '🇦🇺', alpha2Code: 'AU' },
  { name: 'Germany', flag: '🇩🇪', alpha2Code: 'DE' },
  { name: 'France', flag: '🇫🇷', alpha2Code: 'FR' },
  { name: 'Singapore', flag: '🇸🇬', alpha2Code: 'SG' },
  { name: 'United Arab Emirates', flag: '🇦🇪', alpha2Code: 'AE' },
  { name: 'Japan', flag: '🇯🇵', alpha2Code: 'JP' },
  { name: 'Brazil', flag: '🇧🇷', alpha2Code: 'BR' },
  { name: 'South Africa', flag: '🇿🇦', alpha2Code: 'ZA' },
  { name: 'Netherlands', flag: '🇳🇱', alpha2Code: 'NL' },
  { name: 'Switzerland', flag: '🇨🇭', alpha2Code: 'CH' },
  { name: 'Sweden', flag: '🇸🇪', alpha2Code: 'SE' },
  { name: 'New Zealand', flag: '🇳🇿', alpha2Code: 'NZ' },
  { name: 'Ireland', flag: '🇮🇪', alpha2Code: 'IE' },
  { name: 'Italy', flag: '🇮🇹', alpha2Code: 'IT' },
  { name: 'Spain', flag: '🇪🇸', alpha2Code: 'ES' },
  { name: 'Malaysia', flag: '🇲🇾', alpha2Code: 'MY' },
  { name: 'Indonesia', flag: '🇮🇩', alpha2Code: 'ID' },
  { name: 'Saudi Arabia', flag: '🇸🇦', alpha2Code: 'SA' },
  { name: 'Qatar', flag: '🇶🇦', alpha2Code: 'QA' },
  { name: 'Mexico', flag: '🇲🇽', alpha2Code: 'MX' },
  { name: 'Norway', flag: '🇳🇴', alpha2Code: 'NO' },
  { name: 'Denmark', flag: '🇩🇰', alpha2Code: 'DK' },
  { name: 'Finland', flag: '🇫🇮', alpha2Code: 'FI' },
  { name: 'Poland', flag: '🇵🇱', alpha2Code: 'PL' },
  { name: 'Belgium', flag: '🇧🇪', alpha2Code: 'BE' },
  { name: 'Austria', flag: '🇦🇹', alpha2Code: 'AT' },
  { name: 'South Korea', flag: '🇰🇷', alpha2Code: 'KR' },
  { name: 'Nigeria', flag: '🇳🇬', alpha2Code: 'NG' },
  { name: 'Kenya', flag: '🇰🇪', alpha2Code: 'KE' },
  { name: 'Egypt', flag: '🇪🇬', alpha2Code: 'EG' },
  { name: 'Argentina', flag: '🇦🇷', alpha2Code: 'AR' },
  { name: 'Chile', flag: '🇨🇱', alpha2Code: 'CL' },
  { name: 'Colombia', flag: '🇨🇴', alpha2Code: 'CO' },
  { name: 'Portugal', flag: '🇵🇹', alpha2Code: 'PT' },
  { name: 'Greece', flag: '🇬🇷', alpha2Code: 'GR' },
  { name: 'Turkey', flag: '🇹🇷', alpha2Code: 'TR' },
  { name: 'Thailand', flag: '🇹🇭', alpha2Code: 'TH' },
  { name: 'Vietnam', flag: '🇻🇳', alpha2Code: 'VN' },
  { name: 'Philippines', flag: '🇵🇭', alpha2Code: 'PH' },
  { name: 'Israel', flag: '🇮🇱', alpha2Code: 'IL' },
  { name: 'Bangladesh', flag: '🇧🇩', alpha2Code: 'BD' },
  { name: 'Sri Lanka', flag: '🇱🇰', alpha2Code: 'LK' },
  { name: 'Nepal', flag: '🇳🇵', alpha2Code: 'NP' },
  { name: 'Pakistan', flag: '🇵🇰', alpha2Code: 'PK' },
];

/**
 * Fetch all countries from https://countries.dev/
 * Fallback to cached or curated list if unavailable.
 */
export async function getCountries() {
  if (memoryCache.countries && memoryCache.countries.length > 0) {
    return memoryCache.countries;
  }

  // Check sessionStorage
  try {
    const stored = sessionStorage.getItem(COUNTRY_CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache.countries = parsed;
        return parsed;
      }
    }
  } catch {}

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://countries.dev/countries?fields=name,flag,alpha2Code', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw) && raw.length > 0) {
        const formatted = raw
          .map(c => {
            const countryName = typeof c.name === 'string' ? c.name : (c.name?.common || c.name?.official || '');
            const code = c.alpha2Code || c.alpha2 || c.code || '';
            const flag = c.flag && typeof c.flag === 'string' && !c.flag.startsWith('http') ? c.flag : '';
            return {
              name: countryName,
              flag: flag || '🌐',
              alpha2Code: code.toUpperCase(),
            };
          })
          .filter(c => c.name)
          .sort((a, b) => a.name.localeCompare(b.name));

        memoryCache.countries = formatted;
        try {
          sessionStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify(formatted));
        } catch {}
        return formatted;
      }
    }
  } catch (err) {
    console.warn('[locationService] Failed to fetch countries from countries.dev, using fallback:', err?.message || err);
  }

  memoryCache.countries = FALLBACK_COUNTRIES;
  return FALLBACK_COUNTRIES;
}

/**
 * Auto-detect user country via IP using https://countries.dev/ip
 */
export async function detectUserCountry() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('https://countries.dev/ip', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const detectedName = typeof data.name === 'string' ? data.name : (data.name?.common || '');
      const code = data.alpha2Code || data.alpha2 || '';
      if (detectedName) {
        return {
          name: detectedName,
          alpha2Code: code.toUpperCase(),
          flag: data.flag || '🌐',
        };
      }
    }
  } catch (err) {
    // Fail silently without blocking UI
    console.debug('[locationService] IP auto-detection skipped or timed out:', err?.message);
  }
  return null;
}

/**
 * Fetch states / provinces for a given country using https://countriesnow.space/
 */
export async function getStatesForCountry(countryName) {
  if (!countryName) return [];
  const normalized = countryName.trim();
  if (memoryCache.statesByCountry[normalized]) {
    return memoryCache.statesByCountry[normalized];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const res = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: normalized }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (!json.error && json.data && Array.isArray(json.data.states)) {
        const states = json.data.states
          .map(s => (typeof s === 'string' ? s : s.name))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        memoryCache.statesByCountry[normalized] = states;
        return states;
      }
    }
  } catch (err) {
    console.warn(`[locationService] Could not fetch states for "${countryName}":`, err?.message || err);
  }

  return [];
}

/**
 * Fetch top cities for a given country code using https://countries.dev/cities
 */
export async function getCitiesForCountry(alpha2Code, query = '') {
  if (!alpha2Code) return [];
  const code = alpha2Code.toUpperCase();
  const cacheKey = `${code}_${query.toLowerCase()}`;
  if (memoryCache.citiesByCountry[cacheKey]) {
    return memoryCache.citiesByCountry[cacheKey];
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const url = query
      ? `https://countries.dev/cities?country=${encodeURIComponent(code)}&q=${encodeURIComponent(query)}&limit=30`
      : `https://countries.dev/cities?country=${encodeURIComponent(code)}&limit=30`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const cityNames = data
          .map(item => (typeof item === 'string' ? item : (item.name || item.city || item.placeName || '')))
          .filter(Boolean);
        const unique = Array.from(new Set(cityNames));
        memoryCache.citiesByCountry[cacheKey] = unique;
        return unique;
      }
    }
  } catch (err) {
    console.debug(`[locationService] City search skipped for "${code}":`, err?.message);
  }

  return [];
}

/**
 * Optional postal code lookup using https://countries.dev/postal/{country}/{postalCode}
 */
export async function lookupPostalCode(alpha2Code, postalCode) {
  if (!alpha2Code || !postalCode) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://countries.dev/postal/${encodeURIComponent(alpha2Code)}/${encodeURIComponent(postalCode.trim())}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        const item = data[0];
        return {
          city: item.placeName || item.city || '',
          state: item.admin1?.name || item.state || '',
        };
      }
    }
  } catch {}
  return null;
}
