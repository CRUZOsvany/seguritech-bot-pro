'use client';

import React from 'react';
import { MapPin } from 'lucide-react';

interface WhatsAppLocationProps {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export const WhatsAppLocation: React.FC<WhatsAppLocationProps> = ({
  latitude,
  longitude,
  name,
  address,
}) => {
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-64 bg-gray-50 rounded overflow-hidden hover:bg-gray-100 transition-colors"
    >
      <div className="h-24 bg-gradient-to-br from-[#bfe8d0] to-[#7dcfa8] relative flex items-center justify-center">
        <MapPin size={32} className="text-[#075e54]" />
      </div>
      <div className="p-2">
        {name && (
          <p className="text-sm font-medium text-[#262626] truncate">{name}</p>
        )}
        {address && (
          <p className="text-xs text-gray-500 truncate">{address}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">
          {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      </div>
    </a>
  );
};
