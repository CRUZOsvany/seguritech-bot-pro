/**
 * Producto del catálogo POS.
 *
 * Mapeo BD: pos_products (migración 011).
 * Multi-tenant: tenantId siempre presente. RLS en BD + WHERE en repositorio.
 *
 * `trackStock=false` para servicios (impresión, copia) que no descuentan stock.
 */
export type PosUnitType = 'piece' | 'package' | 'box' | 'kg' | 'liter' | 'service';

export interface PosProduct {
  id: string;
  tenantId: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  unitType: PosUnitType;
  unitPrice: number;
  costPrice: number | null;
  taxRate: number;
  stockQty: number;
  stockMin: number;
  trackStock: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input para crear producto. Sprint 5.2 expone CRUD; aquí solo definimos el shape.
 */
export interface NewPosProduct {
  tenantId: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  unitType?: PosUnitType;
  unitPrice: number;
  costPrice?: number | null;
  taxRate?: number;
  stockQty?: number;
  stockMin?: number;
  trackStock?: boolean;
}