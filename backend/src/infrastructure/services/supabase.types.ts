export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string
          password_hash: string
          role: string
          tenant_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          name: string
          password_hash: string
          role: string
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string
          password_hash?: string
          role?: string
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'admin_users_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      bot_configurations: {
        Row: {
          created_at: string | null
          id: string
          mensaje_bienvenida: string | null
          mensaje_confirmacion_pedido: string | null
          mensaje_fuera_horario: string | null
          mensaje_menu_principal: string | null
          mensaje_no_entendio: string | null
          nombre_bot: string
          numero_whatsapp_asignado: string
          tenant_id: string
          tono_bot: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          mensaje_bienvenida?: string | null
          mensaje_confirmacion_pedido?: string | null
          mensaje_fuera_horario?: string | null
          mensaje_menu_principal?: string | null
          mensaje_no_entendio?: string | null
          nombre_bot?: string
          numero_whatsapp_asignado: string
          tenant_id: string
          tono_bot?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          mensaje_bienvenida?: string | null
          mensaje_confirmacion_pedido?: string | null
          mensaje_fuera_horario?: string | null
          mensaje_menu_principal?: string | null
          mensaje_no_entendio?: string | null
          nombre_bot?: string
          numero_whatsapp_asignado?: string
          tenant_id?: string
          tono_bot?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bot_configurations_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: true
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      bot_flows: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          json_definition: Json
          nombre: string
          source_template_id: string | null
          tenant_id: string
          updated_at: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          json_definition: Json
          nombre?: string
          source_template_id?: string | null
          tenant_id: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          json_definition?: Json
          nombre?: string
          source_template_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: 'bot_flows_source_template_id_fkey'
            columns: ['source_template_id']
            isOneToOne: false
            referencedRelation: 'flow_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bot_flows_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      bot_users: {
        Row: {
          context: Json | null
          created_at: string | null
          current_node_id: string | null
          current_state: string
          id: string
          phone_number: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          current_node_id?: string | null
          current_state?: string
          id?: string
          phone_number: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          current_node_id?: string | null
          current_state?: string
          id?: string
          phone_number?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bot_users_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      catalog_items: {
        Row: {
          categoria: string | null
          created_at: string | null
          descripcion: string | null
          disponible: boolean | null
          id: string
          imagen_url: string | null
          nombre_producto: string
          precio: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string | null
          descripcion?: string | null
          disponible?: boolean | null
          id?: string
          imagen_url?: string | null
          nombre_producto: string
          precio?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string | null
          descripcion?: string | null
          disponible?: boolean | null
          id?: string
          imagen_url?: string | null
          nombre_producto?: string
          precio?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'catalog_items_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      flow_templates: {
        Row: {
          created_at: string | null
          descripcion: string | null
          es_default: boolean | null
          giro: string
          id: string
          json_definition: Json
          nombre: string
          slug: string
          updated_at: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          descripcion?: string | null
          es_default?: boolean | null
          giro: string
          id?: string
          json_definition: Json
          nombre: string
          slug: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          created_at?: string | null
          descripcion?: string | null
          es_default?: boolean | null
          giro?: string
          id?: string
          json_definition?: Json
          nombre?: string
          slug?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          direction: string
          from_phone: string
          id: string
          meta_message_id: string | null
          response: string | null
          tenant_id: string
          timestamp: string | null
        }
        Insert: {
          content: string
          direction: string
          from_phone: string
          id?: string
          meta_message_id?: string | null
          response?: string | null
          tenant_id: string
          timestamp?: string | null
        }
        Update: {
          content?: string
          direction?: string
          from_phone?: string
          id?: string
          meta_message_id?: string | null
          response?: string | null
          tenant_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      owner_data: {
        Row: {
          created_at: string | null
          fecha_proximo_pago: string | null
          id: string
          monto_mensual: number
          nombre_dueno: string
          notas_internas: string | null
          tenant_id: string
          updated_at: string | null
          whatsapp_dueno: string
        }
        Insert: {
          created_at?: string | null
          fecha_proximo_pago?: string | null
          id?: string
          monto_mensual?: number
          nombre_dueno: string
          notas_internas?: string | null
          tenant_id: string
          updated_at?: string | null
          whatsapp_dueno: string
        }
        Update: {
          created_at?: string | null
          fecha_proximo_pago?: string | null
          id?: string
          monto_mensual?: number
          nombre_dueno?: string
          notas_internas?: string | null
          tenant_id?: string
          updated_at?: string | null
          whatsapp_dueno?: string
        }
        Relationships: [
          {
            foreignKeyName: 'owner_data_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: true
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      phone_tenant_map: {
        Row: {
          created_at: string | null
          is_active: boolean | null
          phone_number: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          is_active?: boolean | null
          phone_number: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          is_active?: boolean | null
          phone_number?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'phone_tenant_map_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: false
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
      tenants: {
        Row: {
          abre_domingo: boolean | null
          created_at: string | null
          direccion: string | null
          giro: string
          horario_sabado: string | null
          horario_semana: string | null
          id: string
          nombre_negocio: string
          status: string
          updated_at: string | null
          webhook_verified: boolean | null
        }
        Insert: {
          abre_domingo?: boolean | null
          created_at?: string | null
          direccion?: string | null
          giro: string
          horario_sabado?: string | null
          horario_semana?: string | null
          id?: string
          nombre_negocio: string
          status?: string
          updated_at?: string | null
          webhook_verified?: boolean | null
        }
        Update: {
          abre_domingo?: boolean | null
          created_at?: string | null
          direccion?: string | null
          giro?: string
          horario_sabado?: string | null
          horario_semana?: string | null
          id?: string
          nombre_negocio?: string
          status?: string
          updated_at?: string | null
          webhook_verified?: boolean | null
        }
        Relationships: []
      }
      urgent_service_config: {
        Row: {
          created_at: string | null
          id: string
          mensaje_alerta_admin: string | null
          tenant_id: string
          tiempo_respuesta_prometido: string | null
          tiene_servicio_urgente: boolean | null
          updated_at: string | null
          whatsapp_alertas_urgentes: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          mensaje_alerta_admin?: string | null
          tenant_id: string
          tiempo_respuesta_prometido?: string | null
          tiene_servicio_urgente?: boolean | null
          updated_at?: string | null
          whatsapp_alertas_urgentes?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          mensaje_alerta_admin?: string | null
          tenant_id?: string
          tiempo_respuesta_prometido?: string | null
          tiene_servicio_urgente?: boolean | null
          updated_at?: string | null
          whatsapp_alertas_urgentes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'urgent_service_config_tenant_id_fkey'
            columns: ['tenant_id']
            isOneToOne: true
            referencedRelation: 'tenants'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_super_admin: { Args: never; Returns: boolean }
      jwt_role: { Args: never; Returns: string }
      jwt_tenant_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

