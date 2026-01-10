import React, { useState } from 'react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function PasswordInput({ id, value, onChange, placeholder }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="password-input">
      <input
        type={showPassword ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="show-password-btn"
        onClick={() => setShowPassword(!showPassword)}
        title="Show/hide"
      >
        {showPassword ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
