/**
 * Categoría de productos POS. Mapeo BD: pos_categories (migración 011).
 *
 * Soporta jerarquía vía parentId, aunque el Molde Papelería V1 solo usa nivel 1.
 */
export interface PosCategory {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
}

export interface NewPosCategory {
  tenantId: string;
  name: string;
  parentId?: string | null;
  displayOrder?: number;
}
