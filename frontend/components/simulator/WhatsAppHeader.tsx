'use client';

import React from 'react';
import { ArrowLeft, MoreVertical, Phone, Video } from 'lucide-react';

interface WhatsAppHeaderProps {
  businessName: string;
  giro: string;
  onBack?: () => void;
}

export const WhatsAppHeader: React.FC<WhatsAppHeaderProps> = ({
  businessName,
  giro,
  onBack,
}) => {
  const initial = businessName.charAt(0).toUpperCase() || 'B';
  const colorFromName = ((): string => {
    const colors = ['bg-emerald-600', 'bg-teal-600', 'bg-cyan-700', 'bg-sky-700'];
    const hash = businessName.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
  })();

  return (
    <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-3 shadow-md">
      {onBack && (
        <button
          onClick={onBack}
          className="p-1 hover:bg-white/10 rounded-full transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={22} />
        </button>
      )}

      <div
        className={`w-10 h-10 rounded-full ${colorFromName} flex items-center justify-center font-semibold text-lg flex-shrink-0`}
      >
        {initial}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-base truncate">{businessName}</p>
        <p className="text-xs text-white/80 truncate">en línea · {giro}</p>
      </div>

      <button className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Videollamada">
        <Video size={20} />
      </button>
      <button className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Llamada">
        <Phone size={20} />
      </button>
      <button className="p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Más opciones">
        <MoreVertical size={20} />
      </button>
    </div>
  );
};
