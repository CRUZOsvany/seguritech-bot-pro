import type { FlowNode, TransitionCondition } from './flow-types';
import { useDesignerStore } from './store/designer-store';
import { Button } from '@/shared/ui/button';

/**
 * Editor de transiciones de un nodo. Se monta en el Inspector cuando hay
 * un nodo seleccionado. Permite agregar, reordenar y eliminar transiciones,
 * y cambiar el tipo de condición (no el payload completo — eso es A2.3).
 *
 * Los cambios se persisten en el store vía addTransition / removeTransition /
 * moveTransition / updateTransitionCondition.
 */
export function TransitionsEditor({ node }: { node: FlowNode }) {
  const addTransition = useDesignerStore((s) => s.addTransition);
  const removeTransition = useDesignerStore((s) => s.removeTransition);
  const moveTransition = useDesignerStore((s) => s.moveTransition);
  const updateTransitionCondition = useDesignerStore((s) => s.updateTransitionCondition);

  // end nunca tiene transiciones.
  if (node.type === 'end') return null;

  const transitions = node.transitions;
  const canAdd = transitions.length < 10; // límite razonable

  function conditionTypeLabel(c: TransitionCondition): string {
    switch (c.type) {
      case 'button':               return `botón: ${c.value}`;
      case 'list_item':            return `ítem: ${c.value}`;
      case 'list_item_any':        return 'cualquier ítem';
      case 'keyword':              return `palabra: ${c.values.join(', ')}`;
      case 'call_permission_granted': return 'permiso concedido';
      case 'call_permission_denied':  return 'permiso denegado';
      case 'default':              return 'default';
    }
  }

  /** Selects del tipo de condición disponibles según el tipo de nodo. */
  function availableConditionTypes(nodeType: FlowNode['type']): TransitionCondition['type'][] {
    switch (nodeType) {
      case 'send_buttons':
        return ['button', 'default'];
      case 'send_list':
        return ['list_item', 'list_item_any', 'default'];
      case 'wait_input':
        return ['keyword', 'default'];
      case 'request_call_permission':
        return ['call_permission_granted', 'call_permission_denied', 'default'];
      default:
        return ['default'];
    }
  }

  function onConditionTypeChange(idx: number, newType: TransitionCondition['type']) {
    // Construir la condición mínima para el nuevo tipo.
    let condition: TransitionCondition;
    switch (newType) {
      case 'button':
        condition = { type: 'button', value: '' };
        break;
      case 'list_item':
        condition = { type: 'list_item', value: '' };
        break;
      case 'list_item_any':
        condition = { type: 'list_item_any' };
        break;
      case 'keyword':
        condition = { type: 'keyword', values: [] };
        break;
      case 'call_permission_granted':
        condition = { type: 'call_permission_granted' };
        break;
      case 'call_permission_denied':
        condition = { type: 'call_permission_denied' };
        break;
      case 'default':
        condition = { type: 'default' };
        break;
    }
    updateTransitionCondition(node.id, idx, condition);
  }

  const available = availableConditionTypes(node.type);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Transiciones ({transitions.length})
        </p>
        {canAdd && (
          <Button
            size="sm"
            variant="outline"
            className="h-5 px-1.5 text-[10px]"
            onClick={() => addTransition(node.id)}
          >
            + Agregar
          </Button>
        )}
      </div>

      {transitions.length === 0 && (
        <p className="text-[10px] text-muted-foreground italic">
          Sin transiciones — el flow termina aquí.
        </p>
      )}

      {transitions.map((t, idx) => (
        <div
          key={idx}
          className="flex flex-col gap-1 rounded-md border p-1.5"
        >
          {/* Fila superior: tipo de condición + controles */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground w-4">{idx + 1}.</span>

            {/* Selector de tipo de condición */}
            <select
              className="flex-1 rounded border bg-background px-1 py-0.5 text-[10px]"
              value={t.condition.type}
              onChange={(e) =>
                onConditionTypeChange(idx, e.target.value as TransitionCondition['type'])
              }
            >
              {available.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>

            {/* Subir / Bajar */}
            <button
              className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[11px] px-0.5"
              disabled={idx === 0}
              onClick={() => moveTransition(node.id, idx, idx - 1)}
              title="Subir"
            >↑</button>
            <button
              className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-[11px] px-0.5"
              disabled={idx === transitions.length - 1}
              onClick={() => moveTransition(node.id, idx, idx + 1)}
              title="Bajar"
            >↓</button>

            {/* Eliminar */}
            <button
              className="text-red-500 hover:text-red-700 text-[11px] px-0.5"
              onClick={() => removeTransition(node.id, idx)}
              title="Eliminar transición"
            >✕</button>
          </div>

          {/* Descripción de la condición actual */}
          <p className="text-[10px] text-muted-foreground pl-5 truncate">
            {conditionTypeLabel(t.condition)}
            {t.next_node_id ? ` → ${t.next_node_id}` : ' → (sin conectar)'}
          </p>
        </div>
      ))}
    </div>
  );
}
