/**
 * API Route: Listar y crear clientes (tenants)
 * GET /api/clients - Lista clientes del admin
 * POST /api/clients - Crear nuevo cliente
 */

import { getServerSession } from 'next-auth';
import { authConfig } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase';
import { backendApi } from '@/lib/api-client';
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { UserRole, CreateClientPayload } from '@/lib/types';

/**
 * GET /api/clients
 * Lista todos los clientes del admin autenticado
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig) as any;

    if (!session?.user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    // Obtener relaciones admin_users
    let tenantIds: string[] = [];

    if (session.user.role === UserRole.SUPER_ADMIN) {
      // SuperAdmin ve todos los tenants
      const { data: allTenants, error } = await supabase
        .from('tenants')
        .select('id');

      if (error) throw error;
      tenantIds = allTenants?.map((t: any) => t.id) || [];
    } else {
      // AdminOperador ve solo sus tenants
      const { data: adminRelations, error } = await supabase
        .from('admin_users')
        .select('tenant_id')
        .eq('user_id', session.user.id);

      if (error) throw error;
      tenantIds = adminRelations?.map((r: any) => r.tenant_id).filter(Boolean) || [];
    }

    if (tenantIds.length === 0) {
      return NextResponse.json({
        status: 'success',
        data: [],
        total: 0,
      });
    }

    // Obtener detalles de clientes con sus métricas
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('*')
      .in('id', tenantIds);

    if (error) throw error;

    // Enriquecer con datos de owner y métricas
    const enrichedTenants = [];
    for (const tenant of tenants || []) {
      const { data: owner } = await supabase
        .from('owner_data')
        .select('monto_mensual, fecha_proximo_pago')
        .eq('tenant_id', tenant.id)
        .single();

      // Obtener métricas del mes
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .gte('timestamp', startOfMonth.toISOString());

      enrichedTenants.push({
        ...tenant,
        monto_mensual: owner?.monto_mensual || 0,
        fecha_proximo_pago: owner?.fecha_proximo_pago || null,
        messages_this_month: count || 0,
      });
    }

    return NextResponse.json({
      status: 'success',
      data: enrichedTenants,
      total: enrichedTenants.length,
    });
  } catch (error) {
    console.error('Error en GET /api/clients:', error);
    return NextResponse.json(
      { error: 'Error al obtener clientes' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/clients
 * Crear nuevo cliente (tenant)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authConfig) as any;

    if (!session?.user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    if (session.user.role === UserRole.ADMIN_OPERATOR && !session.user.tenantId) {
      return NextResponse.json(
        { error: 'Admin debe tener tenant asignado' },
        { status: 400 }
      );
    }

    const body: CreateClientPayload = await request.json();
    const supabase = createServiceClient();

    // 1. Crear tenant
    const tenantId = uuid();
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert([
        {
          id: tenantId,
          nombre_negocio: body.nombre_negocio,
          giro: body.giro,
          direccion: body.direccion,
          horario_semana: body.horario_semana,
          horario_sabado: body.horario_sabado,
          abre_domingo: body.abre_domingo || false,
          status: 'unconfigured',
        },
      ])
      .select()
      .single();

    if (tenantError) {
      throw new Error(`Error creando tenant: ${tenantError.message}`);
    }

    // 2. Crear owner_data
    const { error: ownerError } = await supabase
      .from('owner_data')
      .insert([
        {
          tenant_id: tenantId,
          nombre_dueno: body.nombre_dueno,
          whatsapp_dueno: body.whatsapp_dueno,
          monto_mensual: body.monto_mensual,
          fecha_proximo_pago: body.fecha_proximo_pago,
          notas_internas: body.notas_internas || '',
        },
      ]);

    if (ownerError) {
      throw new Error(`Error creando owner_data: ${ownerError.message}`);
    }

    // 3. Crear bot_configuration
    const { error: botError } = await supabase
      .from('bot_configurations')
      .insert([
        {
          tenant_id: tenantId,
          numero_whatsapp_asignado: body.numero_whatsapp_asignado,
          nombre_bot: body.nombre_bot,
          tono_bot: body.tono_bot,
          mensaje_bienvenida: body.mensaje_bienvenida,
          mensaje_menu_principal: body.mensaje_menu_principal,
          mensaje_fuera_horario: body.mensaje_fuera_horario,
          mensaje_no_entendio: body.mensaje_no_entendio,
          mensaje_confirmacion_pedido: body.mensaje_confirmacion_pedido,
        },
      ]);

    if (botError) {
      throw new Error(`Error creando bot_configuration: ${botError.message}`);
    }

    // 4. Crear urgent_service_config si es necesario
    if (body.tiene_servicio_urgente) {
      const { error: urgentError } = await supabase
        .from('urgent_service_config')
        .insert([
          {
            tenant_id: tenantId,
            tiene_servicio_urgente: true,
            whatsapp_alertas_urgentes: body.whatsapp_alertas_urgentes,
            mensaje_alerta_admin: body.mensaje_alerta_admin,
            tiempo_respuesta_prometido: body.tiempo_respuesta_prometido,
          },
        ]);

      if (urgentError) {
        throw new Error(`Error creando urgent config: ${urgentError.message}`);
      }
    }

    // 5. Crear relación admin_users (asignar al admin que creó)
    if (session.user.role === UserRole.ADMIN_OPERATOR) {
      // AdminOperador: asignarse a sí mismo
      const { error: relationError } = await supabase
        .from('admin_users')
        .update({ tenant_id: tenantId })
        .eq('id', session.user.id);

      if (relationError) {
        throw new Error(`Error asignando tenant al admin: ${relationError.message}`);
      }
    }

    // 6. Notificar al backend Node.js sobre el nuevo cliente
    try {
      await backendApi.notifyNewClient({
        tenantId,
        nombre_negocio: body.nombre_negocio,
        numero_whatsapp_asignado: body.numero_whatsapp_asignado,
      });
    } catch (error) {
      console.warn('Backend notification failed, pero cliente creado:', error);
    }

    return NextResponse.json({
      status: 'success',
      data: {
        ...tenant,
        message: 'Cliente creado exitosamente',
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error en POST /api/clients:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Error al crear cliente',
      },
      { status: 500 }
    );
  }
}
