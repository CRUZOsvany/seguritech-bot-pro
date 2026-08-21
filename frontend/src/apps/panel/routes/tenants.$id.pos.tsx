import { useRef, useState } from 'react';
import { createLazyRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/ui/table';
import { useImportPosCatalog } from '../hooks/use-import-pos-catalog';
import { ApiError } from '@/shared/api/client';
import type { CatalogImportResult } from '@/shared/api/pos';

/**
 * Carga de catálogo POS (Bloque 5 del plan de solución de hallazgos).
 * Flujo: elegir CSV → "Ver preview" (dryRun, no escribe nada) → revisar
 * cuántos se crearían/actualizarían y los errores fila por fila → "Confirmar
 * carga" (import real). Nunca ejecuta el import a ciegas.
 */
function CatalogImportSection({ tenantId }: { tenantId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogImportResult | null>(null);
  const [confirmed, setConfirmed] = useState<CatalogImportResult | null>(null);
  const importMutation = useImportPosCatalog();

  function handleFileChange(f: File | null) {
    setFile(f);
    setPreview(null);
    setConfirmed(null);
  }

  function handlePreview() {
    if (!file) return;
    setConfirmed(null);
    importMutation.mutate(
      { tenantId, file, dryRun: true },
      { onSuccess: (result) => setPreview(result) },
    );
  }

  function handleConfirm() {
    if (!file) return;
    importMutation.mutate(
      { tenantId, file, dryRun: false },
      {
        onSuccess: (result) => {
          setConfirmed(result);
          setPreview(null);
        },
      },
    );
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setConfirmed(null);
    importMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const errorMessage =
    importMutation.error instanceof ApiError
      ? importMutation.error.message
      : importMutation.error
        ? 'Error inesperado subiendo el catálogo'
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargar catálogo (CSV)</CardTitle>
        <CardDescription>
          Columnas requeridas: <code className="text-xs">sku, name, category, unit_price, stock_qty</code>.
          Opcionales: <code className="text-xs">barcode, description, cost_price, unit_type</code>.
          Categorías que no existan se crean automáticamente. Filas con datos inválidos se
          reportan individualmente y no bloquean el resto del import.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {file && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Quitar archivo
            </Button>
          )}
        </div>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        {!confirmed && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!file || importMutation.isPending}
              onClick={handlePreview}
            >
              {importMutation.isPending && !confirmed ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3 w-3" />
              )}
              Ver preview
            </Button>
            {preview && (
              <Button size="sm" variant="default" disabled={importMutation.isPending} onClick={handleConfirm}>
                {importMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Confirmar carga
              </Button>
            )}
          </div>
        )}

        {preview && !confirmed && (
          <ImportResultSummary result={preview} label="Se van a aplicar estos cambios (todavía no se guardó nada):" />
        )}

        {confirmed && (
          <>
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Catálogo cargado.</AlertDescription>
            </Alert>
            <ImportResultSummary result={confirmed} label="Resultado del import:" />
            <Button size="sm" variant="outline" onClick={handleReset} className="self-start">
              Cargar otro archivo
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ImportResultSummary({ result, label }: { result: CatalogImportResult; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{result.created} nuevos</Badge>
        <Badge variant="secondary">{result.updated} actualizados</Badge>
        {result.errors.length > 0 ? (
          <Badge variant="destructive">{result.errors.length} con error</Badge>
        ) : (
          <Badge variant="secondary">0 errores</Badge>
        )}
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Fila</TableHead>
                <TableHead className="w-32">SKU</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.errors.map((err, idx) => (
                <TableRow key={`${err.row}-${idx}`}>
                  <TableCell>{err.row}</TableCell>
                  <TableCell className="font-mono text-xs">{err.sku ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      {err.message}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function PosPanelPage() {
  const { id } = Route.useParams();

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/tenants/$id" params={{ id }}>
          <ArrowLeft className="mr-1 h-3 w-3" />
          Volver al cliente
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de Punto de Venta</CardTitle>
          <CardDescription>
            Catálogo, cajeros, métodos de pago, ticket. La pantalla completa de config
            (cajeros, métodos de pago) se construye en una FASE posterior (Sprint POS).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cliente: <code className="text-xs">{id}</code>
          </p>
        </CardContent>
      </Card>

      <CatalogImportSection tenantId={id} />
    </div>
  );
}

export const Route = createLazyRoute('/_authed/tenants/$id/pos')({
  component: PosPanelPage,
});
