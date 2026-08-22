/**
 * Tests del parser de CSV de carga de catálogo (Bloque 5).
 */
import { parsePosCatalogCsv } from '@/domain/services/pos/parsePosCatalogCsv';

describe('parsePosCatalogCsv', () => {
  it('parsea filas válidas con columnas mínimas', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      'LAP-001,Lápiz #2,Escritura,3.50,100',
      'CUAD-001,Cuaderno profesional,Escritura,25,50',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      row: 1,
      sku: 'LAP-001',
      name: 'Lápiz #2',
      category: 'Escritura',
      unitPrice: 3.5,
      stockQty: 100,
    });
  });

  it('acepta columnas opcionales (barcode, description, cost_price, unit_type)', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty,barcode,description,cost_price,unit_type',
      'CAJA-001,Caja de colores,Arte,45.90,20,7501234567890,Caja de 12 colores,30,box',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      barcode: '7501234567890',
      description: 'Caja de 12 colores',
      costPrice: 30,
      unitType: 'box',
    });
  });

  it('columnas opcionales vacías quedan undefined, no rompen la fila', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty,barcode,description',
      'X-1,Producto,Cat,10,5,,',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows[0].barcode).toBeUndefined();
    expect(rows[0].description).toBeUndefined();
  });

  it('reporta fila inválida con número de fila y sigue con las demás (no aborta el import)', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      'OK-1,Producto bueno,Cat,10,5',
      'BAD-1,,Cat,10,5', // name vacío
      'OK-2,Otro producto,Cat,20,3',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sku)).toEqual(['OK-1', 'OK-2']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 2, sku: 'BAD-1' });
    expect(errors[0].message).toMatch(/name/);
  });

  it('rechaza unit_price negativo', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      'X-1,Producto,Cat,-5,10',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/unit_price/);
  });

  it('rechaza stock_qty no numérico', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      'X-1,Producto,Cat,10,abc',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/stock_qty/);
  });

  it('detecta SKU duplicado dentro del mismo archivo y lo reporta sin procesar la segunda fila', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      'DUP-1,Primero,Cat,10,5',
      'DUP-1,Segundo,Cat,20,8',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Primero');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 2, sku: 'DUP-1' });
    expect(errors[0].message).toMatch(/duplicado/i);
  });

  it('la comparación de SKU duplicado es case-insensitive', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      'abc-1,Primero,Cat,10,5',
      'ABC-1,Segundo,Cat,20,8',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('respeta comas dentro de campos entrecomillados (nombres de producto con comas)', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty',
      '"X-1","Cuaderno, raya y cuadro","Escritura",15,10',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(errors).toHaveLength(0);
    expect(rows[0].name).toBe('Cuaderno, raya y cuadro');
  });

  it('rechaza unit_type fuera del enum permitido', () => {
    const csv = [
      'sku,name,category,unit_price,stock_qty,unit_type',
      'X-1,Producto,Cat,10,5,gramos',
    ].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/unit_type/);
  });

  it('reporta error de nivel-archivo si faltan columnas requeridas', () => {
    const csv = ['sku,name', 'X-1,Producto'].join('\n');

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(0);
    expect(errors[0].message).toMatch(/category/);
    expect(errors[0].message).toMatch(/unit_price/);
    expect(errors[0].message).toMatch(/stock_qty/);
  });

  it('reporta error si el CSV no tiene filas de datos', () => {
    const csv = 'sku,name,category,unit_price,stock_qty\n';

    const { rows, errors } = parsePosCatalogCsv(csv);

    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/no tiene filas/i);
  });
});
