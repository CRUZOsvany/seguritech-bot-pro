/**
 * Cliente API del frontend.
 * Llama SOLO a Next.js API routes (/api/*) — nunca al backend directamente.
 * La BACKEND_API_KEY nunca llega al browser.
 */
class FrontendApiClient {
  private async post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Error ${res.status}`); }
    return res.json();
  }
  private async patch(path: string, body: unknown) {
    const res = await fetch(path, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Error ${res.status}`); }
    return res.json();
  }
  private async del(path: string) {
    const res = await fetch(path, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Error ${res.status}`); }
    return res.json();
  }
  async assignMolde(tenantId: string, templateSlug: string) { return this.post(`/api/tenants/${tenantId}/molde`, { templateSlug }); }
  async removeMolde(tenantId: string) { return this.del(`/api/tenants/${tenantId}/molde`); }
  async setStatus(tenantId: string, status: 'active' | 'paused') { return this.patch(`/api/tenants/${tenantId}/status`, { status }); }
  async getTemplates() {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('Error cargando templates');
    return res.json();
  }
  async healthCheck(): Promise<boolean> {
    try { const res = await fetch('/api/health').catch(() => null); return res?.status === 200; }
    catch { return false; }
  }
}
export const backendApi = new FrontendApiClient();
export async function callBackendAPI<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
