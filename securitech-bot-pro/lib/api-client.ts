/**
 * Cliente API para comunicarse con el backend de SegurITech Bot
 * Actúa como adaptador entre el panel Next.js y el motor Node.js
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

class BackendApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3001';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor para agregar API key si existe
    this.client.interceptors.request.use((config) => {
      const apiKey = process.env.NEXT_PUBLIC_BACKEND_API_KEY;
      if (apiKey) {
        config.headers['X-API-Key'] = apiKey;
      }
      return config;
    });

    // Interceptor para manejo de errores
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('Backend API Error:', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        throw error;
      }
    );
  }

  /**
   * Notificar al backend que se creó un nuevo cliente
   */
  async notifyNewClient(clientData: {
    tenantId: string;
    nombre_negocio: string;
    numero_whatsapp_asignado: string;
  }) {
    try {
      const response = await this.client.post('/admin/clients/register', clientData);
      return response.data;
    } catch (error) {
      console.error('Error notificando nuevo cliente al backend:', error);
      throw error;
    }
  }

  /**
   * Notificar actualización de configuración del bot
   */
  async notifyBotConfigUpdate(tenantId: string, config: any) {
    try {
      const response = await this.client.put(
        `/admin/clients/${tenantId}/config`,
        config
      );
      return response.data;
    } catch (error) {
      console.error('Error actualizando config en backend:', error);
      throw error;
    }
  }

  /**
   * Notificar nuevo catálogo
   */
  async notifyCatalogUpload(tenantId: string, items: any[]) {
    try {
      const response = await this.client.post(
        `/admin/clients/${tenantId}/catalog`,
        { items }
      );
      return response.data;
    } catch (error) {
      console.error('Error notificando catálogo al backend:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del cliente desde el backend
   */
  async getClientStats(tenantId: string) {
    try {
      const response = await this.client.get(
        `/admin/clients/${tenantId}/stats`
      );
      return response.data;
    } catch (error) {
      console.error('Error obteniendo estadísticas del backend:', error);
      // Retornar objeto vacío si no está disponible
      return {
        messages_this_month: 0,
        active_conversations: 0,
        conversion_rate: 0,
      };
    }
  }

  /**
   * Test de websocket conectado (POST a /health)
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      console.warn('Backend health check falló:', error);
      return false;
    }
  }

  /**
   * Pausar bot de un cliente
   */
  async pauseClient(tenantId: string) {
    try {
      const response = await this.client.put(
        `/admin/clients/${tenantId}/pause`
      );
      return response.data;
    } catch (error) {
      console.error('Error pausando cliente en backend:', error);
      throw error;
    }
  }

  /**
   * Reanudar bot de un cliente
   */
  async resumeClient(tenantId: string) {
    try {
      const response = await this.client.put(
        `/admin/clients/${tenantId}/resume`
      );
      return response.data;
    } catch (error) {
      console.error('Error reanudando cliente en backend:', error);
      throw error;
    }
  }

  /**
   * Enviar mensaje de prueba del bot
   */
  async sendTestMessage(tenantId: string, message: string) {
    try {
      const response = await this.client.post(
        `/admin/clients/${tenantId}/test-message`,
        { message }
      );
      return response.data;
    } catch (error) {
      console.error('Error enviando mensaje de prueba:', error);
      throw error;
    }
  }

  /**
   * Obtener estado actual del bot
   */
  async getBotStatus(tenantId: string) {
    try {
      const response = await this.client.get(
        `/admin/clients/${tenantId}/status`
      );
      return response.data;
    } catch (error) {
      console.error('Error obteniendo estado del bot:', error);
      return { status: 'unknown', connected: false };
    }
  }
}

// Instancia singleton
export const backendApi = new BackendApiClient();

/**
 * Función auxiliar para safe async calls a backend
 */
export async function callBackendAPI<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error('Backend API call failed:', error);
    return fallback;
  }
}

