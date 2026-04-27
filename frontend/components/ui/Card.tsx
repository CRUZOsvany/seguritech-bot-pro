/**
 * Componente Card para contenedores
 */

import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`} {...props}>
      {children}
    </div>
  );
};

/**
 * Componente Accordion para secciones colapsables
 */
interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  indicator?: React.ReactNode;
}

export const AccordionItem: React.FC<AccordionItemProps> = ({
  title,
  children,
  isOpen,
  onToggle,
  indicator,
}) => {
  return (
    <div className="border border-gray-200 rounded-lg mb-4">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {indicator}
        </div>
        <span className="text-gray-500 text-xl">
          {isOpen ? '−' : '+'}
        </span>
      </button>
      {isOpen && <div className="px-6 py-4 bg-white border-t border-gray-200">{children}</div>}
    </div>
  );
};

/**
 * Badge de estado para tareas completadas
 */
interface BadgeProps {
  isComplete: boolean;
  label?: string;
}

export const CompleteBadge: React.FC<BadgeProps> = ({ isComplete, label = 'Completado' }) => {
  if (!isComplete) {
    return (
      <div className="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center">
        <span className="text-xs text-gray-400">○</span>
      </div>
    );
  }

  return (
    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
      <span className="text-xs text-white font-bold">✓</span>
    </div>
  );
};

