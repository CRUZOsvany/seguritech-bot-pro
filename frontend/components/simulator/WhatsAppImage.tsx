'use client';

import React, { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface WhatsAppImageProps {
  url: string;
  caption?: string;
}

export const WhatsAppImage: React.FC<WhatsAppImageProps> = ({ url, caption }) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-64 h-40 bg-gray-100 rounded text-gray-400">
        <ImageOff size={32} />
        <p className="text-xs mt-2">Imagen no disponible</p>
        <p className="text-[10px] text-gray-300 truncate w-full px-2 text-center">{url}</p>
      </div>
    );
  }

  return (
    <div className="max-w-xs">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={caption ?? 'Imagen del bot'}
        className="rounded w-full h-auto"
        onError={() => setError(true)}
      />
      {caption && (
        <p className="text-sm mt-1 text-[#262626] whitespace-pre-wrap break-words">
          {caption}
        </p>
      )}
    </div>
  );
};
