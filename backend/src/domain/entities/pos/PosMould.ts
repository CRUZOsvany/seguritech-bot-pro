/**
 * Molde de industria del POS. Plantilla declarativa que define defaults para
 * un tipo de negocio (papelería, ferretería, tienda, etc).
 *
 * NO se persiste — vive en código como configuración. La instancia activa se
 * referencia desde pos_tenant_config.mould.
 *
 * Las plantillas concretas viven en domain/moulds/*.config.ts.
 */
import type { PosUnitType } from './Product';

export interface PosMouldSampleProduct {
  sku: string;
  name: string;
  categoryName: string;
  unitType: PosUnitType;
  unitPrice: number;
  costPrice?: number;
  stockQty?: number;
  stockMin?: number;
  trackStock?: boolean;
  barcode?: string;
}

export interface PosMould {
  /** Slug único. Coincide con pos_tenant_config.mould. */
  code: string;
  displayName: string;
  defaultCategories: Array<{ name: string; displayOrder: number }>;
  defaultUnits: PosUnitType[];
  features: {
    sellsServices: boolean;
    sellsBulk: boolean;
    wholesalePricing: boolean;
    seasonalSpikes: string[];
  };
  sampleProducts?: PosMouldSampleProduct[];
}
