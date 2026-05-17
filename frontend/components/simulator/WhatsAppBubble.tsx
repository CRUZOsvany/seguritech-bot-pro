'use client';

import React from 'react';
import { CheckCheck } from 'lucide-react';

interface WhatsAppBubbleProps {
  from: 'user' | 'bot';
  children: React.ReactNode;
  timestamp: Date;
  showTail?: boolean;
}

/**
 * Burbuja base del chat. Maneja alineación, color y ticks de leído.
 * Los hijos son arbitrarios — el contenido lo decide el caller (text, imagen, etc).
 */
export const WhatsAppBubble: React.FC<WhatsAppBubbleProps> = ({
  from,
  children,
  timestamp,
  showTail = true,
}) => {
  const isUser = from === 'user';
  const time = timestamp.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} px-2 my-0.5`}>
      <div
        className={`max-w-[75%] md:max-w-[65%] relative ${
          isUser ? 'bg-[#dcf8c6]' : 'bg-white'
        } rounded-lg px-3 py-2 shadow-sm`}
        style={
          showTail
            ? isUser
              ? { borderTopRightRadius: 0 }
              : { borderTopLeftRadius: 0 }
            : undefined
        }
      >
        <div className="text-[#262626] text-sm leading-relaxed whitespace-pre-wrap break-words">
          {children}
        </div>
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[10px] text-[#999] leading-none">{time}</span>
          {isUser && <CheckCheck size={14} className="text-[#34b7f1]" aria-label="Leído" />}
        </div>
      </div>
    </div>
  );
};
