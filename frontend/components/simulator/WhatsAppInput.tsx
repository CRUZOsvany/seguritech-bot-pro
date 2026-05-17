'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Send, Smile, Paperclip } from 'lucide-react';

interface WhatsAppInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const WhatsAppInput: React.FC<WhatsAppInputProps> = ({
  onSend,
  disabled = false,
  placeholder = 'Mensaje',
}) => {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="bg-[#f0f0f0] px-2 py-2 flex items-end gap-1">
      <button
        type="button"
        className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
        disabled
        aria-label="Emoji (no implementado)"
      >
        <Smile size={22} />
      </button>
      <button
        type="button"
        className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
        disabled
        aria-label="Adjuntar (no implementado)"
      >
        <Paperclip size={22} />
      </button>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 bg-white rounded-3xl px-4 py-2 text-sm resize-none focus:outline-none disabled:opacity-50 max-h-32"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || value.trim() === ''}
        className="p-3 bg-[#00a884] hover:bg-[#008f72] disabled:bg-gray-300 text-white rounded-full transition-colors flex-shrink-0"
        aria-label="Enviar"
      >
        <Send size={18} />
      </button>
    </div>
  );
};
