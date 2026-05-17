/**
 * Helper para llamadas server-side al API Admin del backend.
 * Solo usar en Next.js API routes (nunca en 'use client').
 * Usa BACKEND_API_KEY (no NEXT_PUBLIC_) — seguro.
 */

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3001';
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || '';

interface BackendResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

async function callBackend<T>(
  path: string,
  options: RequestInit = {},
): Promise<BackendResponse<T>> {
  const url = `${BACKEND_URL}/api/admin${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BACKEND_API_KEY,
        ...options.headers,
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: body.error ?? `Backend error ${res.status}`, status: res.status };
    }
    return { data: body as T, status: res.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { error: message, status: 503 };
  }
}

export interface TemplateSummary {
  slug: string;
  giro: string;
  nombre: string;
  descripcion: string | null;
}

export interface TenantSummary {
  id: string;
  nombre_negocio: string;
  giro: string;
  status: string;
  webhook_verified: boolean;
  has_active_flow: boolean;
}

// ===== Tipos de outputs del simulador (mirror de InterpreterOutput) =====
export type SimulatorOutput =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; buttons: { id: string; title: string }[] }
  | {
      kind: 'list';
      text: string;
      buttonLabel: string;
      sections: Array<{
        title: string;
        items: Array<{ id: string; title: string; description?: string }>;
      }>;
    }
  | { kind: 'image'; url: string; caption?: string }
  | {
      kind: 'location';
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    }
  | {
      kind: 'document';
      url: string;
      filename: string;
      caption?: string;
    }
  | { kind: 'escape_to_human'; userResponse: string; ownerAlert: string };

export interface SimulateResponse {
  outputs: SimulatorOutput[];
  nextNodeId: string;
  context: Record<string, unknown>;
  flowEnded: boolean;
}

export const backendAdmin = {
  async getTemplates(): Promise<TemplateSummary[]> {
    const res = await callBackend<{ templates: TemplateSummary[] }>('/templates');
    return res.data?.templates ?? [];
  },
  async assignMolde(tenantId: string, templateSlug: string): Promise<{ error?: string }> {
    const res = await callBackend(`/tenants/${tenantId}/molde`, {
      method: 'POST',
      body: JSON.stringify({ templateSlug }),
    });
    return { error: res.error };
  },
  async removeMolde(tenantId: string): Promise<{ error?: string }> {
    const res = await callBackend(`/tenants/${tenantId}/molde`, { method: 'DELETE' });
    return { error: res.error };
  },
  async setStatus(tenantId: string, status: 'active' | 'paused'): Promise<{ error?: string }> {
    const res = await callBackend(`/tenants/${tenantId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return { error: res.error };
  },
  async getTenants(): Promise<TenantSummary[]> {
    const res = await callBackend<{ tenants: TenantSummary[] }>('/tenants');
    return res.data?.tenants ?? [];
  },
  async simulate(args: {
    tenantId: string;
    phoneNumber: string;
    content: string;
    persist: boolean;
  }): Promise<{ data?: SimulateResponse; error?: string }> {
    const res = await callBackend<SimulateResponse>('/simulate', {
      method: 'POST',
      body: JSON.stringify(args),
    });
    return { data: res.data, error: res.error };
  },
  async simulateReset(args: {
    tenantId: string;
    phoneNumber: string;
  }): Promise<{ error?: string }> {
    const res = await callBackend('/simulate/reset', {
      method: 'POST',
      body: JSON.stringify(args),
    });
    return { error: res.error };
  },
};
