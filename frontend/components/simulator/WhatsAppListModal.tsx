'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface WhatsAppListModalProps {
  isOpen: boolean;
  buttonLabel: string;
  sections: Array<{
    title: string;
    items: Array<{ id: string; title: string; description?: string }>;
  }>;
  onSelect: (item: { id: string; title: string; description?: string }) => void;
  onClose: () => void;
}

export const WhatsAppListModal: React.FC<WhatsAppListModalProps> = ({
  isOpen,
  buttonLabel,
  sections,
  onSelect,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md max-h-[85%] rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-[#262626]">{buttonLabel}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {sections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                {section.title}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100"
                >
                  <p className="text-sm font-medium text-[#262626]">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
