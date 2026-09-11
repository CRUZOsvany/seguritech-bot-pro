import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/lib/utils';
import type { CatalogProduct } from '../lib/db';
import { filterCatalog, isService, type CatalogTab } from '../lib/catalog';
import { formatMoney } from '../lib/money';

const MAX_VISIBLE = 200;

interface CatalogPanelProps {
  products: CatalogProduct[];
  onPick: (product: CatalogProduct) => void;
}

/**
 * Catálogo general para "ver qué hay" (diseño §3.2): pestañas Todo /
 * Productos / Servicios + buscador. Los servicios no muestran stock.
 */
export function CatalogPanel({ products, onPick }: CatalogPanelProps) {
  const [tab, setTab] = useState<CatalogTab>('all');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => filterCatalog(products, tab, search), [products, tab, search]);

  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as CatalogTab)}>
          <TabsList>
            <TabsTrigger value="all">Todo</TabsTrigger>
            <TabsTrigger value="products">Productos</TabsTrigger>
            <TabsTrigger value="services">Servicios</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="h-9 pl-8"
            placeholder="Buscar en el catálogo"
            aria-label="Buscar en el catálogo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {products.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          El catálogo todavía no se descarga. La primera vez se necesita internet.
        </p>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nada coincide con la búsqueda.</p>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2 overflow-y-auto pr-1">
          {visible.slice(0, MAX_VISIBLE).map((p) => (
            <ProductTile key={p.id} product={p} onPick={onPick} />
          ))}
          {visible.length > MAX_VISIBLE && (
            <p className="col-span-full py-2 text-center text-xs text-muted-foreground">
              Mostrando {MAX_VISIBLE} de {visible.length}. Busca para acotar.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ProductTile({ product, onPick }: { product: CatalogProduct; onPick: (p: CatalogProduct) => void }) {
  const service = isService(product);
  const out = !service && product.stockQty <= 0;
  const low = !service && !out && product.stockQty <= product.stockMin;

  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className="flex flex-col items-start gap-1 rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
      <span className="text-xs text-muted-foreground">{product.sku}</span>
      <span className="mt-auto flex w-full items-center justify-between gap-2 pt-1">
        <span className="font-semibold tabular-nums">{formatMoney(product.unitPrice)}</span>
        {service ? (
          <span className="text-xs text-muted-foreground">Servicio</span>
        ) : (
          <span
            className={cn(
              'text-xs tabular-nums',
              out ? 'text-destructive' : low ? 'text-amber-700' : 'text-muted-foreground',
            )}
          >
            {out ? 'Sin stock' : `Hay ${product.stockQty}`}
          </span>
        )}
      </span>
    </button>
  );
}
