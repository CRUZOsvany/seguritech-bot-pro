import type { PosMould } from '@/domain/entities/pos/PosMould';

/**
 * Molde Papelería V1 — Sprint 5.1a.
 *
 * Defaults para una papelería estilo Chilpancingo (~150-500 SKUs, regreso a
 * clases como temporada alta, mezcla productos físicos + servicios).
 *
 * El seed (migración 012) usa `defaultCategories` + `sampleProducts` para
 * popular un tenant nuevo con datos realistas.
 */
export const papeleriaMould: PosMould = {
  code: 'papeleria',
  displayName: 'Papelería',
  defaultCategories: [
    { name: 'Escritura', displayOrder: 1 },
    { name: 'Cuadernos y libretas', displayOrder: 2 },
    { name: 'Útiles escolares', displayOrder: 3 },
    { name: 'Papel y hojas', displayOrder: 4 },
    { name: 'Oficina', displayOrder: 5 },
    { name: 'Arte y manualidades', displayOrder: 6 },
    { name: 'Tecnología', displayOrder: 7 },
    { name: 'Servicios', displayOrder: 8 },
  ],
  defaultUnits: ['piece', 'package', 'box', 'service'],
  features: {
    sellsServices: true,
    sellsBulk: false,
    wholesalePricing: true,
    seasonalSpikes: ['agosto', 'septiembre', 'enero'],
  },
  sampleProducts: [
    // Escritura
    { sku: 'LAP-001', barcode: '7501031234567', name: 'Lápiz Mirado #2', categoryName: 'Escritura', unitType: 'piece', unitPrice: 5.0, costPrice: 2.5, stockQty: 100, stockMin: 20 },
    { sku: 'LAP-002', barcode: '7501031234568', name: 'Lápiz adhesivo Pritt grande', categoryName: 'Escritura', unitType: 'piece', unitPrice: 35.0, costPrice: 22.0, stockQty: 15, stockMin: 5 },
    { sku: 'PLU-001', barcode: '7501031234569', name: 'Pluma Bic punto fino azul', categoryName: 'Escritura', unitType: 'piece', unitPrice: 8.0, costPrice: 4.0, stockQty: 80, stockMin: 20 },
    { sku: 'PLU-002', barcode: '7501031234570', name: 'Pluma Bic punto fino negro', categoryName: 'Escritura', unitType: 'piece', unitPrice: 8.0, costPrice: 4.0, stockQty: 80, stockMin: 20 },
    { sku: 'PLU-003', barcode: '7501031234571', name: 'Pluma Bic punto fino rojo', categoryName: 'Escritura', unitType: 'piece', unitPrice: 8.0, costPrice: 4.0, stockQty: 40, stockMin: 10 },
    { sku: 'MAR-001', barcode: '7501031234572', name: 'Marcador Sharpie negro', categoryName: 'Escritura', unitType: 'piece', unitPrice: 35.0, costPrice: 20.0, stockQty: 20, stockMin: 5 },
    { sku: 'BOR-001', barcode: '7501031234573', name: 'Borrador Pelikan blanco', categoryName: 'Escritura', unitType: 'piece', unitPrice: 6.0, costPrice: 3.0, stockQty: 50, stockMin: 15 },

    // Cuadernos y libretas
    { sku: 'CUA-001', barcode: '7501031234574', name: 'Cuaderno Norma profesional 100h', categoryName: 'Cuadernos y libretas', unitType: 'piece', unitPrice: 35.0, costPrice: 22.0, stockQty: 30, stockMin: 8 },
    { sku: 'CUA-002', barcode: '7501031234575', name: 'Cuaderno Scribe italiano 100h', categoryName: 'Cuadernos y libretas', unitType: 'piece', unitPrice: 42.0, costPrice: 28.0, stockQty: 25, stockMin: 8 },
    { sku: 'CUA-003', barcode: '7501031234576', name: 'Libreta forma francesa raya', categoryName: 'Cuadernos y libretas', unitType: 'piece', unitPrice: 18.0, costPrice: 11.0, stockQty: 40, stockMin: 10 },
    { sku: 'CUA-004', barcode: '7501031234577', name: 'Cuaderno cuadriculado 100h', categoryName: 'Cuadernos y libretas', unitType: 'piece', unitPrice: 32.0, costPrice: 20.0, stockQty: 35, stockMin: 10 },

    // Útiles escolares
    { sku: 'REG-001', barcode: '7501031234578', name: 'Regla 30cm plástica', categoryName: 'Útiles escolares', unitType: 'piece', unitPrice: 12.0, costPrice: 6.0, stockQty: 40, stockMin: 10 },
    { sku: 'TIJ-001', barcode: '7501031234579', name: 'Tijera escolar punta roma', categoryName: 'Útiles escolares', unitType: 'piece', unitPrice: 25.0, costPrice: 15.0, stockQty: 20, stockMin: 5 },
    { sku: 'JUE-001', barcode: '7501031234580', name: 'Juego de geometría escolar', categoryName: 'Útiles escolares', unitType: 'piece', unitPrice: 45.0, costPrice: 28.0, stockQty: 15, stockMin: 5 },
    { sku: 'SAC-001', barcode: '7501031234581', name: 'Sacapuntas metálico', categoryName: 'Útiles escolares', unitType: 'piece', unitPrice: 8.0, costPrice: 4.0, stockQty: 60, stockMin: 15 },
    { sku: 'COL-001', barcode: '7501031234582', name: 'Caja colores Prismacolor 12pz', categoryName: 'Útiles escolares', unitType: 'package', unitPrice: 75.0, costPrice: 48.0, stockQty: 18, stockMin: 5 },

    // Papel y hojas
    { sku: 'HOJ-001', name: 'Hoja blanca tamaño carta (unidad)', categoryName: 'Papel y hojas', unitType: 'piece', unitPrice: 1.5, costPrice: 0.4, stockQty: 500, stockMin: 100 },
    { sku: 'HOJ-002', barcode: '7501031234583', name: 'Paquete hojas blancas 100 piezas', categoryName: 'Papel y hojas', unitType: 'package', unitPrice: 75.0, costPrice: 45.0, stockQty: 20, stockMin: 5 },
    { sku: 'PAP-001', barcode: '7501031234584', name: 'Pliego papel china amarillo', categoryName: 'Papel y hojas', unitType: 'piece', unitPrice: 3.0, costPrice: 1.5, stockQty: 100, stockMin: 20 },
    { sku: 'CAR-001', barcode: '7501031234585', name: 'Cartulina blanca tamaño 1/2', categoryName: 'Papel y hojas', unitType: 'piece', unitPrice: 6.0, costPrice: 3.0, stockQty: 80, stockMin: 20 },

    // Oficina
    { sku: 'CLI-001', barcode: '7501031234586', name: 'Caja de clips estándar', categoryName: 'Oficina', unitType: 'package', unitPrice: 18.0, costPrice: 10.0, stockQty: 20, stockMin: 5 },
    { sku: 'GRA-001', barcode: '7501031234587', name: 'Grapadora media plus', categoryName: 'Oficina', unitType: 'piece', unitPrice: 85.0, costPrice: 55.0, stockQty: 8, stockMin: 3 },
    { sku: 'GRA-002', barcode: '7501031234588', name: 'Caja grapas estándar 5000', categoryName: 'Oficina', unitType: 'package', unitPrice: 22.0, costPrice: 13.0, stockQty: 15, stockMin: 5 },
    { sku: 'CIN-001', barcode: '7501031234589', name: 'Cinta adhesiva transparente', categoryName: 'Oficina', unitType: 'piece', unitPrice: 12.0, costPrice: 6.0, stockQty: 40, stockMin: 10 },

    // Arte y manualidades
    { sku: 'PIN-001', barcode: '7501031234590', name: 'Pinceles set escolar 6pz', categoryName: 'Arte y manualidades', unitType: 'package', unitPrice: 45.0, costPrice: 28.0, stockQty: 12, stockMin: 4 },
    { sku: 'PIN-002', barcode: '7501031234591', name: 'Pintura acrílica 30ml roja', categoryName: 'Arte y manualidades', unitType: 'piece', unitPrice: 22.0, costPrice: 13.0, stockQty: 20, stockMin: 5 },
    { sku: 'FOM-001', barcode: '7501031234592', name: 'Foamy carta colores varios', categoryName: 'Arte y manualidades', unitType: 'piece', unitPrice: 8.0, costPrice: 4.0, stockQty: 60, stockMin: 15 },

    // Tecnología
    { sku: 'USB-001', barcode: '7501031234593', name: 'USB 16GB Kingston', categoryName: 'Tecnología', unitType: 'piece', unitPrice: 120.0, costPrice: 78.0, stockQty: 10, stockMin: 3 },
    { sku: 'AUD-001', barcode: '7501031234594', name: 'Audífonos básicos con cable', categoryName: 'Tecnología', unitType: 'piece', unitPrice: 85.0, costPrice: 55.0, stockQty: 10, stockMin: 3 },

    // Servicios — trackStock=false, sin barcode
    { sku: 'SRV-001', name: 'Impresión B/N por hoja', categoryName: 'Servicios', unitType: 'service', unitPrice: 2.0, costPrice: 0, stockQty: 0, stockMin: 0, trackStock: false },
    { sku: 'SRV-002', name: 'Fotocopia B/N', categoryName: 'Servicios', unitType: 'service', unitPrice: 1.5, costPrice: 0, stockQty: 0, stockMin: 0, trackStock: false },
    { sku: 'SRV-003', name: 'Engargolado tamaño carta', categoryName: 'Servicios', unitType: 'service', unitPrice: 25.0, costPrice: 5.0, stockQty: 0, stockMin: 0, trackStock: false },
  ],
};
