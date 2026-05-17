'use client';

import React, { useEffect, useRef, useState } from 'react';
import { WhatsAppHeader } from './WhatsAppHeader';
import { WhatsAppBubble } from './WhatsAppBubble';
import { WhatsAppButtonGroup } from './WhatsAppButtonGroup';
import { WhatsAppListModal } from './WhatsAppListModal';
import { WhatsAppImage } from './WhatsAppImage';
import { WhatsAppLocation } from './WhatsAppLocation';
import { WhatsAppDocument } from './WhatsAppDocument';
import { WhatsAppInput } from './WhatsAppInput';
import type { ChatMessage, SimulatorOutput } from './types';

interface WhatsAppChatProps {
  businessName: string;
  giro: string;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onSelectButton: (button: { id: string; title: string }) => void;
  onSelectListItem: (item: { id: string; title: string; description?: string }) => void;
}

export const WhatsAppChat: React.FC<WhatsAppChatProps> = ({
  businessName,
  giro,
  messages,
  isLoading,
  onSend,
  onSelectButton,
  onSelectListItem,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeListOutput, setActiveListOutput] = useState<
    Extract<SimulatorOutput, { kind: 'list' }> | null
  >(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const lastBotMessage = [...messages].reverse().find((m) => m.from === 'bot');
  const lastBotIsButtons =
    lastBotMessage?.from === 'bot' && lastBotMessage.output.kind === 'buttons';

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{
        backgroundColor: '#ece5dd',
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Cpath d=%22M0 0h100v100H0z%22 fill=%22%23ece5dd%22/%3E%3Cpath d=%22M20 20l60 60M80 20L20 80%22 stroke=%22%23d9d2c5%22 stroke-width=%221%22 opacity=%220.5%22/%3E%3C/svg%3E")',
      }}
    >
      <WhatsAppHeader businessName={businessName} giro={giro} />

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500 bg-white/80 px-3 py-1 rounded-full">
              Escribe un mensaje para empezar la simulación
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.from === 'user') {
            return (
              <WhatsAppBubble key={msg.id} from="user" timestamp={msg.timestamp}>
                {msg.text}
              </WhatsAppBubble>
            );
          }

          if (msg.from === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2 px-4">
                <p className="bg-red-100 text-red-700 text-xs px-3 py-1 rounded-full max-w-xs text-center">
                  ⚠️ {msg.text}
                </p>
              </div>
            );
          }

          const out = msg.output;
          switch (out.kind) {
          case 'text':
            return (
              <WhatsAppBubble key={msg.id} from="bot" timestamp={msg.timestamp}>
                {out.text}
              </WhatsAppBubble>
            );
          case 'buttons':
            return (
              <WhatsAppBubble key={msg.id} from="bot" timestamp={msg.timestamp}>
                {out.text}
              </WhatsAppBubble>
            );
          case 'list':
            return (
              <div key={msg.id}>
                <WhatsAppBubble from="bot" timestamp={msg.timestamp}>
                  {out.text}
                </WhatsAppBubble>
                <div className="flex justify-start px-2 mb-1">
                  <button
                    onClick={() => setActiveListOutput(out)}
                    className="bg-white text-[#00a884] text-sm font-medium py-2 px-4 rounded-lg shadow-sm hover:bg-gray-50"
                  >
                    📋 {out.buttonLabel}
                  </button>
                </div>
              </div>
            );
          case 'image':
            return (
              <WhatsAppBubble key={msg.id} from="bot" timestamp={msg.timestamp}>
                <WhatsAppImage url={out.url} caption={out.caption} />
              </WhatsAppBubble>
            );
          case 'location':
            return (
              <WhatsAppBubble key={msg.id} from="bot" timestamp={msg.timestamp}>
                <WhatsAppLocation
                  latitude={out.latitude}
                  longitude={out.longitude}
                  name={out.name}
                  address={out.address}
                />
              </WhatsAppBubble>
            );
          case 'document':
            return (
              <WhatsAppBubble key={msg.id} from="bot" timestamp={msg.timestamp}>
                <WhatsAppDocument
                  url={out.url}
                  filename={out.filename}
                  caption={out.caption}
                />
              </WhatsAppBubble>
            );
          case 'escape_to_human':
            return (
              <WhatsAppBubble key={msg.id} from="bot" timestamp={msg.timestamp}>
                {out.userResponse}
              </WhatsAppBubble>
            );
          }
        })}

        {lastBotIsButtons && lastBotMessage?.from === 'bot' && lastBotMessage.output.kind === 'buttons' && (
          <WhatsAppButtonGroup
            buttons={lastBotMessage.output.buttons}
            onSelect={onSelectButton}
            disabled={isLoading}
          />
        )}

        {isLoading && (
          <div className="flex justify-start px-2 my-1">
            <div className="bg-white rounded-lg px-3 py-2 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <WhatsAppInput onSend={onSend} disabled={isLoading} />

      {activeListOutput && (
        <WhatsAppListModal
          isOpen={true}
          buttonLabel={activeListOutput.buttonLabel}
          sections={activeListOutput.sections.map((s) => ({
            title: s.title,
            items: s.items,
          }))}
          onSelect={(item) => {
            setActiveListOutput(null);
            onSelectListItem(item);
          }}
          onClose={() => setActiveListOutput(null)}
        />
      )}
    </div>
  );
};
