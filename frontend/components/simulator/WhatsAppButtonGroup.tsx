'use client';

import React from 'react';

interface WhatsAppButtonGroupProps {
  buttons: Array<{ id: string; title: string }>;
  onSelect: (button: { id: string; title: string }) => void;
  disabled?: boolean;
}

export const WhatsAppButtonGroup: React.FC<WhatsAppButtonGroupProps> = ({
  buttons,
  onSelect,
  disabled = false,
}) => {
  return (
    <div className="flex flex-col gap-0.5 px-2 mb-1 max-w-[75%] md:max-w-[65%]">
      {buttons.slice(0, 3).map((btn) => (
        <button
          key={btn.id}
          onClick={() => !disabled && onSelect(btn)}
          disabled={disabled}
          className="bg-white text-[#00a884] text-sm font-medium py-2.5 px-4 rounded-lg shadow-sm hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-t border-gray-100"
        >
          {btn.title}
        </button>
      ))}
    </div>
  );
};
