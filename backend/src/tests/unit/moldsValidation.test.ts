/**
 * Los moldes del repo (backend/scripts/*-flow.json) se validan en CI con el
 * mismo validador que usa el Studio (regla 3 de la especificación). Antes de
 * la Fase 2 ningún test cargaba estos archivos: se copiaba su forma a mano.
 *
 * Criterio: sin errores de diseño y publicables hoy (schema). Las
 * advertencias quedan fijadas aquí para que una nueva no pase inadvertida.
 */
import { validateFlowDesign } from '@/domain/validation/flowDesignValidator';
import { loadMold, MOLDS } from '../utils/conversationHarness';

describe.each(MOLDS)('molde %s', (mold) => {
  const report = validateFlowDesign(loadMold(mold));

  it('no tiene errores de diseño', () => {
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('se puede publicar con el schema actual', () => {
    expect(report.schema).toEqual({ ok: true, issues: [] });
  });
});

it('advertencias conocidas de los moldes', () => {
  const warnings = MOLDS.flatMap((mold) =>
    validateFlowDesign(loadMold(mold)).issues
      .filter((i) => i.level === 'warning')
      .map((i) => `${mold}:${i.code}:${i.nodeId}`),
  );

  // securitech manda el saludo como texto suelto antes del menú (y lo mismo
  // "no entendí"): dos mensajes donde podría ir uno. Es un aviso de costo, no
  // un error; cambiar el texto del molde es decisión del negocio.
  expect(warnings).toEqual([
    'securitech:V-COSTO-01:saludo',
    'securitech:V-COSTO-01:no_entendi',
  ]);
});
