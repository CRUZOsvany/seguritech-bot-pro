/**
 * Persiste el flow de SECURITECH como bot_flow ACTIVO usando el repo real
 * (valida con Zod antes de insertar, marca is_active=true).
 * Uso: npx ts-node -r tsconfig-paths/register scripts/persist-flow.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import { validateFlow } from '@/domain/validators/flowSchema';
import { SupabaseBotFlowRepository } from '@/infrastructure/repositories/SupabaseBotFlowRepository';

const TID = '786c56a2-1c6a-4510-9656-0a264265db01';

async function main(): Promise<void> {
  const raw = JSON.parse(readFileSync('scripts/securitech-flow.json', 'utf8'));
  const flow = validateFlow(raw); // doble check explícito

  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
  const logger = pino({ level: 'info' });
  const repo = new SupabaseBotFlowRepository(supabase, logger);

  const { id } = await repo.upsert({
    tenantId: TID,
    nombre: 'Flujo cámaras SECURITECH',
    flow,
  });
  console.log('FLOW persistido id:', id);

  // Verificación: lo que el bot leerá en runtime
  const active = await repo.findActiveByTenant(TID);
  console.log('findActiveByTenant ok:', !!active, '— start:', active?.start_node_id, '— nodos:', active?.nodes.length);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
