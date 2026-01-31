'use client';

import React, { useState, useEffect, useRef } from 'react';
import { COUNTRIES, CountryInfo, parsePhoneNumber, formatPhoneWithDialCode, getCountryByCode, getCountryByName, getDefaultCountryForRegion } from '../lib/countries';
import { useAuth } from './AuthProvider';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  defaultCountryCode?: string; // ISO country code (e.g., 'US', 'IN')
  useHospitalDefault?: boolean; // If true, defaults to hospital's country
  lockCountryCode?: boolean; // If true, country code cannot be changed (locked to hospital default)
  showError?: boolean; // Show validation error
  minDigits?: number; // Minimum digits required (default 10)
  maxDigits?: number; // Maximum digits allowed (default 10)
  compact?: boolean; // Use compact sizing to match small form fields
}

// Validate phone number
export function validatePhoneNumber(localNumber: string, minDigits: number = 10, maxDigits: number = 10): { isValid: boolean; error?: string } {
  const digitsOnly = localNumber.replace(/\D/g, '');
  if (!digitsOnly) {
    return { isValid: true }; // Empty is valid (not required)
  }
  if (digitsOnly.length < minDigits) {
    return { isValid: false, error: `Phone number must be at least ${minDigits} digits` };
  }
  if (digitsOnly.length > maxDigits) {
    return { isValid: false, error: `Phone number cannot exceed ${maxDigits} digits` };
  }
  return { isValid: true };
}

// Validate email
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email) {
    return { isValid: true }; // Empty is valid (not required)
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  return { isValid: true };
}

export default function PhoneInput({
  value,
  onChange,
  placeholder = 'Phone number',
  disabled = false,
  className = '',
  defaultCountryCode,
  useHospitalDefault = true,
  lockCountryCode = true, // Default to locked
  showError = true,
  minDigits = 10,
  maxDigits = 10,
  compact = false,
}: PhoneInputProps) {
  const { currentHospital } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine default country
  const getDefaultCountry = (): CountryInfo => {
    // Priority: explicit prop > hospital country > hospital region > US
    if (defaultCountryCode) {
      const country = getCountryByCode(defaultCountryCode);
      if (country) return country;
    }

    if (useHospitalDefault && currentHospital) {
      // Try hospital country first
      if (currentHospital.country) {
        const byName = getCountryByName(currentHospital.country);
        if (byName) return byName;
      }
      // Fall back to region
      if (currentHospital.region) {
        const regionCode = getDefaultCountryForRegion(currentHospital.region);
        const byRegion = getCountryByCode(regionCode);
        if (byRegion) return byRegion;
      }
    }

    return COUNTRIES[0]; // US as fallback
  };

  // Parse current value to get dial code and local number
  const { dialCode: currentDialCode, localNumber: currentLocalNumber } = parsePhoneNumber(value);

  // Find current country based on dial code or use default
  const [selectedCountry, setSelectedCountry] = useState<CountryInfo>(() => {
    if (value) {
      const country = COUNTRIES.find(c => c.dialCode === currentDialCode);
      if (country) return country;
    }
    return getDefaultCountry();
  });

  const [localNumber, setLocalNumber] = useState(currentLocalNumber);

  // Update local state when value prop changes externally
  useEffect(() => {
    if (value) {
      const parsed = parsePhoneNumber(value);
      const country = COUNTRIES.find(c => c.dialCode === parsed.dialCode);
      if (country) {
        setSelectedCountry(country);
      }
      setLocalNumber(parsed.localNumber);
    } else {
      // Reset to default when value is cleared
      setSelectedCountry(getDefaultCountry());
      setLocalNumber('');
    }
  }, [value, currentHospital?.country, currentHospital?.region]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter countries based on search
  const filteredCountries = searchQuery
    ? COUNTRIES.filter(
        c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.dialCode.includes(searchQuery)
      )
    : COUNTRIES;

  const handleCountrySelect = (country: CountryInfo) => {
    setSelectedCountry(country);
    setIsOpen(false);
    setSearchQuery('');
    // Update the full value
    const newValue = formatPhoneWithDialCode(country.dialCode, localNumber);
    onChange(newValue);
    inputRef.current?.focus();
  };

  const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers
    const rawValue = e.target.value;
    const numbersOnly = rawValue.replace(/\D/g, '');

    // Limit to maxDigits
    const newLocal = numbersOnly.slice(0, maxDigits);
    setLocalNumber(newLocal);

    // Update the full value
    const newValue = formatPhoneWithDialCode(selectedCountry.dialCode, newLocal);
    onChange(newValue);
  };

  // Validation state
  const validation = validatePhoneNumber(localNumber, minDigits, maxDigits);
  const hasError = showError && localNumber.length > 0 && !validation.isValid;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <div className={`flex border ${compact ? 'rounded' : 'rounded-lg'} overflow-hidden focus-within:ring-2 focus-within:border-transparent ${disabled ? 'bg-gray-50 border-gray-200' : hasError ? 'border-red-300 bg-white focus-within:ring-red-200' : 'border-gray-200 bg-white focus-within:ring-[var(--color-primary)]'}`}>
        {/* Country selector - locked or interactive */}
        {lockCountryCode ? (
          <div className={`flex items-center ${compact ? 'px-1.5 py-1' : 'px-2 py-2'} border-r border-gray-200 bg-gray-50`}>
            <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-gray-500`}>{selectedCountry.dialCode}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled}
            className={`flex items-center gap-1 ${compact ? 'px-1.5 py-1' : 'px-2 py-2'} border-r border-gray-200 hover:bg-gray-50 transition-colors ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-gray-600`}>{selectedCountry.dialCode}</span>
            {!disabled && (
              <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        )}

        {/* Phone number input */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          value={localNumber}
          onChange={handleLocalNumberChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`flex-1 ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'} focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50`}
        />
      </div>

      {/* Error message */}
      {hasError && (
        <p className="text-xs text-red-500 mt-1">{validation.error}</p>
      )}

      {/* Dropdown - only show if not locked */}
      {isOpen && !lockCountryCode && (
        <div className="absolute z-50 mt-1 w-64 max-h-60 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search country..."
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              autoFocus
            />
          </div>

          {/* Country list */}
          <div className="overflow-y-auto max-h-48">
            {filteredCountries.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No countries found</div>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleCountrySelect(country)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                    selectedCountry.code === country.code ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="flex-1 text-sm text-gray-700 truncate">{country.name}</span>
                  <span className="text-xs text-gray-500">{country.dialCode}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
