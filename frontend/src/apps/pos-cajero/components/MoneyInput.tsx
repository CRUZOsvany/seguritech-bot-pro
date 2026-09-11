import type { ComponentProps } from 'react';
import { Input } from '@/shared/ui/input';
import { cn } from '@/lib/utils';

/**
 * Campo de monto. Texto libre (no type=number) para aceptar "500,50" o
 * "$1,200"; quien lo usa interpreta el valor con parseMoney.
 */
export function MoneyInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
        $
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn('h-11 pl-7 text-lg tabular-nums', className)}
        {...props}
      />
    </div>
  );
}
