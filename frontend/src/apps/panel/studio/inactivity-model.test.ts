import { describe, expect, it } from 'vitest';
import type { ValidationIssue, WizardSpec } from '@/shared/api/studio';
import { DEFAULT_INACTIVITY, stepForIssue } from './wizard-model';

const spec = {
  version: 1,
  menu: { listButtonLabel: 'Ver opciones', listSectionTitle: 'Opciones' },
  options: [],
  notUnderstood: { attempts: 1, retryText: 'No te entendí.', handoff: { userResponse: 'Te comunico.', ownerAlert: 'Cliente {{phone}}' } },
  farewell: { text: 'Gracias.', keywords: [] },
} as WizardSpec;

const issue = (code: string): ValidationIssue => ({ code, level: 'error', message: '' });

describe('inactividad en el asistente', () => {
  it('los hallazgos de inactividad (V-CUMP-03 y 04) se arreglan en «Despedida»', () => {
    expect(stepForIssue(issue('V-CUMP-03'), spec)).toBe('despedida');
    expect(stepForIssue(issue('V-CUMP-04'), spec)).toBe('despedida');
  });

  it('lo que propone el asistente pasa las reglas del motor: recordatorio antes del cierre y todo dentro de las 2 h de la sesión', () => {
    const { reminder, close } = DEFAULT_INACTIVITY;

    expect(reminder!.afterMinutes).toBeLessThan(close.afterMinutes);
    expect(close.afterMinutes).toBeLessThanOrEqual(120);
    expect(`${reminder!.text} ${close.text}`).not.toMatch(/\{\{/);
  });
});
