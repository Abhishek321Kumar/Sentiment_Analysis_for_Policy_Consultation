import { useState, useEffect, useRef } from 'react';
import {
  getCountries,
  detectUserCountry,
  getStatesForCountry,
  getCitiesForCountry,
  lookupPostalCode,
} from '../services/locationService';

export default function LocationFields({
  country = '',
  state = '',
  city = '',
  postalCode = '',
  onChange,
  errors = {},
  variant = 'wizard', // 'wizard' | 'dashboard'
  disabled = false,
  showPostal = false,
}) {
  const isDashboard = variant === 'dashboard';
  const inputClass = isDashboard ? 'dash-input' : 'form-input';
  const selectClass = isDashboard ? 'dash-select' : 'form-input';
  const labelClass = isDashboard ? 'dash-label' : 'form-label';
  const errorClass = isDashboard ? 'dash-form-error' : 'form-error';

  // Countries State
  const [countriesList, setCountriesList] = useState([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [manualCountry, setManualCountry] = useState(false);

  // States State
  const [statesList, setStatesList] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [manualState, setManualState] = useState(false);

  // Cities State
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);

  const initialDetectionDone = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 1. Fetch Countries on Mount & Auto-Detect IP
  useEffect(() => {
    let isMounted = true;

    async function loadCountriesAndDetect() {
      try {
        setLoadingCountries(true);
        const list = await getCountries();
        if (!isMounted) return;
        setCountriesList(list);

        // If no country is currently selected, try auto-detection via countries.dev/ip
        if (!country && !initialDetectionDone.current) {
          initialDetectionDone.current = true;
          const detected = await detectUserCountry();
          if (isMounted && detected?.name) {
            const match = list.find(
              c => c.name.toLowerCase() === detected.name.toLowerCase() || c.alpha2Code === detected.alpha2Code
            );
            onChangeRef.current('country', match ? match.name : detected.name);
          }
        }
      } catch (err) {
        console.warn('Failed to load countries:', err);
      } finally {
        if (isMounted) setLoadingCountries(false);
      }
    }

    loadCountriesAndDetect();
    return () => {
      isMounted = false;
    };
  }, [country]);

  // 2. When Country changes, fetch its States & Cities
  useEffect(() => {
    let isMounted = true;
    if (!country) {
      return;
    }

    const currentCountryObj = countriesList.find(
      c => c.name.toLowerCase() === country.toLowerCase()
    );
    const alpha2 = currentCountryObj?.alpha2Code || '';

    // Fetch States
    setLoadingStates(true);
    getStatesForCountry(country)
      .then(states => {
        if (!isMounted) return;
        setStatesList(states || []);
        if (states && states.length === 0) {
          setManualState(true);
        }
      })
      .catch(() => {
        if (isMounted) {
          setStatesList([]);
          setManualState(true);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingStates(false);
      });

    // Fetch Top Cities
    if (alpha2) {
      setLoadingCities(true);
      getCitiesForCountry(alpha2)
        .then(cities => {
          if (!isMounted) return;
          setCitySuggestions(cities || []);
        })
        .finally(() => {
          if (isMounted) setLoadingCities(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [country, countriesList]);

  // Handle Country selection change
  const handleCountryChange = e => {
    const val = e.target.value;
    onChange('country', val);
    onChange('state', '');
    if (!val) {
      setStatesList([]);
      setCitySuggestions([]);
    }
  };

  // Optional Postal Code auto-fill handler
  const handlePostalBlur = async () => {
    if (!postalCode || !country) return;
    const currentCountryObj = countriesList.find(
      c => c.name.toLowerCase() === country.toLowerCase()
    );
    if (!currentCountryObj?.alpha2Code) return;

    try {
      const match = await lookupPostalCode(currentCountryObj.alpha2Code, postalCode);
      if (match) {
        if (!city && match.city) {
          onChange('city', match.city);
        }
        if (!state && match.state) {
          onChange('state', match.state);
        }
      }
    } catch {}
  };

  return (
    <>
      {/* Country Field */}
      <div className="form-group" style={{ marginBottom: isDashboard ? '0' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label className={labelClass} style={{ marginBottom: 0 }}>
            Country *
          </label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setManualCountry(!manualCountry)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--brand-accent, #6366f1)',
              fontSize: '0.72rem',
              cursor: 'pointer',
              padding: '0 2px',
              textDecoration: 'underline',
              opacity: 0.85,
            }}
          >
            {manualCountry ? 'Pick from list' : 'Type custom'}
          </button>
        </div>

        {manualCountry ? (
          <input
            type="text"
            name="country"
            disabled={disabled}
            className={`${inputClass} ${errors.country ? 'error' : ''}`}
            placeholder="e.g. India, United Kingdom"
            value={country}
            onChange={e => onChange('country', e.target.value)}
          />
        ) : (
          <select
            name="country"
            disabled={disabled || loadingCountries}
            className={`${selectClass} ${errors.country ? 'error' : ''}`}
            value={country}
            onChange={handleCountryChange}
          >
            <option value="">
              {loadingCountries ? 'Loading countries (countries.dev)...' : 'Select a country...'}
            </option>
            {countriesList.map(c => (
              <option key={c.alpha2Code + c.name} value={c.name}>
                {c.flag ? `${c.flag} ` : ''}{c.name}
              </option>
            ))}
          </select>
        )}
        {errors.country && <span className={errorClass}>{errors.country}</span>}
      </div>

      {/* State / Province Field */}
      <div className="form-group" style={{ marginBottom: isDashboard ? '0' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label className={labelClass} style={{ marginBottom: 0 }}>
            State / Province *
          </label>
          {statesList.length > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setManualState(!manualState)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--brand-accent, #6366f1)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                padding: '0 2px',
                textDecoration: 'underline',
                opacity: 0.85,
              }}
            >
              {manualState ? 'Pick from list' : 'Type manually'}
            </button>
          )}
        </div>

        {!manualState && statesList.length > 0 ? (
          <select
            name="state"
            disabled={disabled || loadingStates}
            className={`${selectClass} ${errors.state ? 'error' : ''}`}
            value={state}
            onChange={e => onChange('state', e.target.value)}
          >
            <option value="">
              {loadingStates ? 'Loading states...' : 'Select a state / province...'}
            </option>
            {statesList.map(st => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            name="state"
            disabled={disabled}
            className={`${inputClass} ${errors.state ? 'error' : ''}`}
            placeholder={
              loadingStates
                ? 'Loading states from countriesnow.space...'
                : 'e.g. Karnataka, California, Ontario'
            }
            value={state}
            onChange={e => onChange('state', e.target.value)}
          />
        )}
        {errors.state && <span className={errorClass}>{errors.state}</span>}
      </div>

      {/* City Field (with datalist suggestions from countries.dev) */}
      <div className="form-group" style={{ marginBottom: isDashboard ? '0' : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
          <label className={labelClass} style={{ marginBottom: 0 }}>
            City *
          </label>
          {loadingCities && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Loading suggestions...
            </span>
          )}
        </div>

        <input
          type="text"
          name="city"
          list="cities-datalist"
          disabled={disabled}
          className={`${inputClass} ${errors.city ? 'error' : ''}`}
          placeholder="e.g. Bengaluru, New York, London"
          value={city}
          onChange={e => onChange('city', e.target.value)}
          autoComplete="off"
        />
        <datalist id="cities-datalist">
          {citySuggestions.map((cityName, idx) => (
            <option key={`${cityName}-${idx}`} value={cityName} />
          ))}
        </datalist>
        {errors.city && <span className={errorClass}>{errors.city}</span>}
      </div>

      {/* Optional Postal Code Field */}
      {showPostal && (
        <div className="form-group" style={{ marginBottom: isDashboard ? '0' : undefined }}>
          <label className={labelClass}>Postal / ZIP Code</label>
          <input
            type="text"
            name="postalCode"
            disabled={disabled}
            className={`${inputClass} ${errors.postalCode ? 'error' : ''}`}
            placeholder="e.g. 560001 or 90210"
            value={postalCode}
            onChange={e => onChange('postalCode', e.target.value)}
            onBlur={handlePostalBlur}
          />
          {errors.postalCode && <span className={errorClass}>{errors.postalCode}</span>}
        </div>
      )}
    </>
  );
}
