'use client';

import React, { useState } from 'react';

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  showError?: boolean;
}

// Validate email
export function validateEmail(email: string): { isValid: boolean; error?: string } {
  if (!email) {
    return { isValid: true }; // Empty is valid (unless required - checked elsewhere)
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  return { isValid: true };
}

export default function EmailInput({
  value,
  onChange,
  placeholder = 'email@example.com',
  disabled = false,
  className = '',
  required = false,
  showError = true,
}: EmailInputProps) {
  const [touched, setTouched] = useState(false);

  const validation = validateEmail(value);
  const hasError = showError && touched && value.length > 0 && !validation.isValid;

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`form-input w-full ${hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''}`}
        />
        {value && validation.isValid && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        )}
      </div>
      {hasError && (
        <p className="text-xs text-red-500 mt-1">{validation.error}</p>
      )}
    </div>
  );
}
