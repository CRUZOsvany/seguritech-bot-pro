/**
 * Valida un flow JSON contra el contrato real (validateFlow / Zod) SIN persistir.
 * Uso: npx ts-node -r tsconfig-paths/register scripts/validate-flow.ts <ruta.json>
 */
import { readFileSync } from 'fs';
import { validateFlow, FlowValidationError } from '@/domain/validators/flowSchema';

function main(): void {
  const path = process.argv[2] ?? 'scripts/securitech-flow.json';
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  try {
    const flow = validateFlow(raw);
    const byType: Record<string, number> = {};
    for (const n of flow.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
    console.log('VALIDACION: passed ✅');
    console.log('start_node_id:', flow.start_node_id);
    console.log('total_nodos  :', flow.nodes.length);
    console.log('por_tipo     :', JSON.stringify(byType));
  } catch (err) {
    if (err instanceof FlowValidationError) {
      console.error('VALIDACION: FAILED ❌');
      console.error('primer issue:', err.message);
      console.error('todos:', JSON.stringify(err.issues, null, 2));
      process.exit(1);
    }
    throw err;
  }
}

main();
