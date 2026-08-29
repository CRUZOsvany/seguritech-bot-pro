/**
 * DEC-12 (auditoría 2026-08-26, hallazgo C-2.4): guardrail para giros
 * restringidos (medico, farmacia). Decisión del owner: ofrecer el servicio
 * a esos giros, pero bloquear publicar un flow que exponga catalog_items
 * si el catálogo del tenant tiene categorías de medicamento controlado/con
 * receta.
 */
import type { BotFlow } from '@/domain/entities/flow';
import {
  assertRestrictedGiroCatalogGuardrail,
  flowExposesCatalogItems,
  isRestrictedGiro,
  RestrictedGiroGuardrailError,
} from '@/domain/validators/restrictedGiroCatalogGuardrail';

function flowWithDynamicCatalogList(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_list',
        content: {
          text: 'Catálogo',
          button_label: 'Ver',
          sections: [{ type: 'dynamic', title: 'Productos', items_source: 'catalog_items' }],
        },
        transitions: [],
      },
    ],
  };
}

function flowWithoutCatalogList(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      { id: 'menu', type: 'send_text', content: { text: 'hola' }, transitions: [] },
    ],
  };
}

function flowWithStaticListAndServiceDirectory(): BotFlow {
  return {
    version: '1.0',
    start_node_id: 'menu',
    nodes: [
      {
        id: 'menu',
        type: 'send_list',
        content: {
          text: 'Servicios',
          button_label: 'Ver',
          sections: [
            { type: 'static', title: 'Fijo', items: [{ id: 'a', title: 'A' }] },
            { type: 'dynamic', title: 'Servicios', items_source: 'service_directory' },
          ],
        },
        transitions: [],
      },
    ],
  };
}

describe('isRestrictedGiro', () => {
  it('medico y farmacia son restringidos', () => {
    expect(isRestrictedGiro('medico')).toBe(true);
    expect(isRestrictedGiro('farmacia')).toBe(true);
  });

  it('otros giros, null y undefined no son restringidos', () => {
    expect(isRestrictedGiro('papeleria')).toBe(false);
    expect(isRestrictedGiro('ferreteria')).toBe(false);
    expect(isRestrictedGiro(null)).toBe(false);
    expect(isRestrictedGiro(undefined)).toBe(false);
  });
});

describe('flowExposesCatalogItems', () => {
  it('true cuando hay un send_list con sección dinámica items_source=catalog_items', () => {
    expect(flowExposesCatalogItems(flowWithDynamicCatalogList())).toBe(true);
  });

  it('false cuando no hay ningún send_list', () => {
    expect(flowExposesCatalogItems(flowWithoutCatalogList())).toBe(false);
  });

  it('false cuando el send_list solo tiene secciones static o service_directory (no catalog_items)', () => {
    expect(flowExposesCatalogItems(flowWithStaticListAndServiceDirectory())).toBe(false);
  });
});

describe('assertRestrictedGiroCatalogGuardrail', () => {
  it('no-op para giro NO restringido, aunque el catálogo tenga categorías "peligrosas" y el flow exponga catalog_items', () => {
    expect(() =>
      assertRestrictedGiroCatalogGuardrail(flowWithDynamicCatalogList(), 'papeleria', ['Antibióticos']),
    ).not.toThrow();
  });

  it('no-op para giro restringido si el flow NO expone catalog_items, sin importar el catálogo', () => {
    expect(() =>
      assertRestrictedGiroCatalogGuardrail(flowWithoutCatalogList(), 'farmacia', ['Antibióticos']),
    ).not.toThrow();
  });

  it('no-op para giro restringido con catalog_items expuesto pero categorías limpias', () => {
    expect(() =>
      assertRestrictedGiroCatalogGuardrail(flowWithDynamicCatalogList(), 'farmacia', [
        'Higiene personal',
        'Cuidado del bebé',
      ]),
    ).not.toThrow();
  });

  it('bloquea giro restringido + catalog_items expuesto + categoría restringida, con acentos/mayúsculas', () => {
    expect(() =>
      assertRestrictedGiroCatalogGuardrail(flowWithDynamicCatalogList(), 'farmacia', [
        'Medicamentos Controlados',
      ]),
    ).toThrow(RestrictedGiroGuardrailError);
  });

  it('el error lista las categorías ofensoras exactas (no todas, solo las que matchean)', () => {
    try {
      assertRestrictedGiroCatalogGuardrail(flowWithDynamicCatalogList(), 'medico', [
        'Higiene personal',
        'Antibióticos',
        'Psicotrópicos',
      ]);
      throw new Error('esperaba que lanzara');
    } catch (err) {
      expect(err).toBeInstanceOf(RestrictedGiroGuardrailError);
      const guardrailErr = err as RestrictedGiroGuardrailError;
      expect(guardrailErr.offendingCategories).toEqual(['Antibióticos', 'Psicotrópicos']);
      expect(guardrailErr.message).toMatch(/medico/);
    }
  });

  it('match es substring, no exacto (ej. "Analgésicos controlados" matchea "controlado")', () => {
    expect(() =>
      assertRestrictedGiroCatalogGuardrail(flowWithDynamicCatalogList(), 'farmacia', [
        'Analgésicos controlados',
      ]),
    ).toThrow(RestrictedGiroGuardrailError);
  });
});
