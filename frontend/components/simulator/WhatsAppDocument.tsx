'use client';

import React from 'react';
import { FileText, Download } from 'lucide-react';

interface WhatsAppDocumentProps {
  url: string;
  filename: string;
  caption?: string;
}

export const WhatsAppDocument: React.FC<WhatsAppDocumentProps> = ({
  url,
  filename,
  caption,
}) => {
  return (
    <div className="max-w-xs">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 bg-gray-50 rounded p-3 hover:bg-gray-100 transition-colors"
      >
        <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
          <FileText size={20} className="text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#262626] truncate">{filename}</p>
          <p className="text-xs text-gray-500">PDF</p>
        </div>
        <Download size={18} className="text-gray-400 flex-shrink-0" />
      </a>
      {caption && (
        <p className="text-sm mt-1 text-[#262626] whitespace-pre-wrap break-words">
          {caption}
        </p>
      )}
    </div>
  );
};
