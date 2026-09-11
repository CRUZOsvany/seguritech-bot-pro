import { useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import { ScanBarcode } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { cn } from '@/lib/utils';
import type { CatalogProduct } from '../lib/db';
import { quickMatch } from '../lib/catalog';
import { formatMoney } from '../lib/money';

interface QuickAddProps {
  products: CatalogProduct[];
  onAdd: (product: CatalogProduct) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * "Agregar rápido" (diseño §3.2): lector de código de barras USB o teclado.
 * El lector teclea el código y manda Enter, así que Enter con coincidencia
 * única agrega directo; si hay varias, flechas + Enter para elegir.
 */
export function QuickAdd({ products, onAdd, inputRef }: QuickAddProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const match = useMemo(() => quickMatch(products, query), [products, query]);

  function add(product: CatalogProduct) {
    onAdd(product);
    setQuery('');
    setHighlight(0);
    setNotFound(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(match.suggestions.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setQuery('');
      setNotFound(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = match.exact ?? match.suggestions[highlight];
      if (pick) add(pick);
      else if (query.trim()) setNotFound(true);
    }
  }

  const showSuggestions = !match.exact && match.suggestions.length > 1;

  return (
    <div className="relative">
      <ScanBarcode className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={inputRef}
        className="h-11 pl-10 text-base"
        placeholder="Escanea o escribe código / nombre y Enter"
        aria-label="Agregar producto por código o nombre"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setNotFound(false);
        }}
        onKeyDown={onKeyDown}
      />
      {notFound && (
        <p className="mt-1 text-sm text-destructive" role="alert">
          No encontré «{query.trim()}» en el catálogo.
        </p>
      )}
      {showSuggestions && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md" role="listbox">
          {match.suggestions.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm',
                  i === highlight ? 'bg-muted' : 'hover:bg-muted/60',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(p)}
              >
                <span className="truncate">
                  {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
                </span>
                <span className="tabular-nums">{formatMoney(p.unitPrice)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
