import type { SupabaseClient } from '@supabase/supabase-js';
import type pino from 'pino';
import type { TenantConfig, User, Message } from '@/domain/entities';

/**
 * Resuelve variables {{var}} en textos del flow.
 *
 * Variables estáticas: bot_configurations / tenants (resueltas vía TenantConfig).
 * Variables dinámicas: bot_users.context, lookups a catalog, generadas en runtime.
 *
 * Resolución LAZY: solo hace queries cuando una variable concreta del texto las requiere.
 */
export class VariableResolver {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger: pino.Logger,
  ) {}

  async resolve(
    text: string,
    params: {
      tenantId: string;
      tenantConfig: TenantConfig;
      user: User;
      message: Message;
      generatedOrderId?: string;
    },
  ): Promise<string> {
    if (!text) return text;

    const re = /\{\{(\w+)\}\}/g;
    const tokens = Array.from(text.matchAll(re));
    if (tokens.length === 0) return text;

    const cache = new Map<string, string>();
    let result = text;

    for (const match of tokens) {
      const key = match[1];
      if (cache.has(key)) continue;

      const value = await this.resolveOne(key, params);
      cache.set(key, value);
      result = result.split(`{{${key}}}`).join(value);
    }

    return result;
  }

  private async resolveOne(
    key: string,
    p: {
      tenantId: string;
      tenantConfig: TenantConfig;
      user: User;
      message: Message;
      generatedOrderId?: string;
    },
  ): Promise<string> {
    switch (key) {
    // Estáticas (TenantConfig)
    case 'nombre_bot':
      return p.tenantConfig.botName;
    case 'nombre_negocio':
      return p.tenantConfig.nombreNegocio;
    case 'welcome_message':
      return p.tenantConfig.welcomeMessage;
    case 'menu_message':
      return p.tenantConfig.menuMessage;
    case 'out_of_hours_message':
      return p.tenantConfig.outOfHoursMessage;
    case 'not_understood_message':
      return p.tenantConfig.notUnderstoodMessage;
    case 'order_confirmation_message':
      return p.tenantConfig.orderConfirmationMessage;

      // Dinámicas (user / message)
    case 'phone':
      return p.user.phoneNumber;
    case 'last_message':
      return p.message.content;

      // Dinámicas con lookup
    case 'catalog_listing':
      return this.formatCatalog(p.tenantConfig);

    case 'selected_product_id':
      return String(p.user.context?.selected_product_id ?? '');

    case 'selected_product_name': {
      const id = p.user.context?.selected_product_id;
      if (!id) return '';
      const item = p.tenantConfig.catalog.find((c) => c.id === id);
      return item?.name ?? '';
    }

    case 'selected_product_price': {
      const id = p.user.context?.selected_product_id;
      if (!id) return '';
      const item = p.tenantConfig.catalog.find((c) => c.id === id);
      return item ? item.price.toFixed(2) : '';
    }

    case 'order_id':
      return p.generatedOrderId ?? String(p.user.context?.order_id ?? '');

    default:
      // Fallback: buscar en context
      if (p.user.context && key in p.user.context) {
        return String(p.user.context[key] ?? '');
      }
      this.logger.warn({ key }, 'Variable desconocida en flow');
      return `{{${key}}}`;
    }
  }

  private formatCatalog(config: TenantConfig): string {
    if (config.catalog.length === 0) return 'Aún no hay productos en el catálogo.';
    return config.catalog
      .slice(0, 10)
      .map((p, i) => `${i + 1}. ${p.name} — $${p.price.toFixed(2)}`)
      .join('\n');
  }
}