-- ============================================================================
-- seed.sql — Plantillas de flujos por giro (Sprint A)
-- Idempotente: re-ejecutable sin duplicar (ON CONFLICT DO UPDATE).
-- Aplica automáticamente con `supabase db reset`.
-- ============================================================================

-- ============================================================================
-- TEMPLATE 1/4: default_v1 (giro 'all', es_default=true)
-- Replica fiel de la FSM hardcodeada actual de HandleMessageUseCase.ts.
-- Fallback cuando un tenant no tiene template específico de su giro.
-- ============================================================================
insert into public.flow_templates (slug, giro, nombre, descripcion, json_definition, es_default, version)
values (
  'default_v1',
  'all',
  'Flujo por defecto V1',
  'Replica fiel de la FSM hardcodeada original. Fallback universal.',
  '{
    "version": "1.0",
    "start_node_id": "welcome",
    "nodes": [
      {
        "id": "welcome",
        "type": "send_buttons",
        "content": {
          "text": "{{welcome_message}}\n\n{{menu_message}}",
          "buttons": [
            {"id": "btn_1", "title": "1"},
            {"id": "btn_2", "title": "2"},
            {"id": "btn_3", "title": "3"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "btn_1"}, "next_node_id": "show_catalog"},
          {"condition": {"type": "button", "value": "btn_2"}, "next_node_id": "show_prices"},
          {"condition": {"type": "button", "value": "btn_3"}, "next_node_id": "select_product"},
          {"condition": {"type": "default"}, "next_node_id": "not_understood"}
        ]
      },
      {
        "id": "show_catalog",
        "type": "send_buttons",
        "content": {
          "text": "Productos disponibles:\n\n{{catalog_listing}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome"}
        ]
      },
      {
        "id": "show_prices",
        "type": "send_buttons",
        "content": {
          "text": "{{catalog_listing}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome"}
        ]
      },
      {
        "id": "select_product",
        "type": "send_list",
        "content": {
          "text": "Elige el producto que deseas pedir:",
          "button_label": "Ver productos",
          "sections": [
            {
              "type": "dynamic",
              "title": "Productos",
              "items_source": "catalog_items"
            }
          ]
        },
        "transitions": [
          {"condition": {"type": "list_item_any", "save_to_context": "selected_product_id"}, "next_node_id": "confirm_order"},
          {"condition": {"type": "default"}, "next_node_id": "not_understood"}
        ]
      },
      {
        "id": "confirm_order",
        "type": "send_buttons",
        "content": {
          "text": "Has seleccionado: *{{selected_product_name}}* — ${{selected_product_price}}\n\n¿Confirmas el pedido?",
          "buttons": [
            {"id": "confirm", "title": "Sí, confirmar"},
            {"id": "cancel", "title": "No, cancelar"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "confirm"}, "next_node_id": "order_confirmed"},
          {"condition": {"type": "button", "value": "cancel"}, "next_node_id": "order_cancelled"},
          {"condition": {"type": "default"}, "next_node_id": "confirm_invalid"}
        ]
      },
      {
        "id": "order_confirmed",
        "type": "send_buttons",
        "content": {
          "text": "{{order_confirmation_message}}\n\nNúmero de pedido: #{{order_id}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome"}
        ]
      },
      {
        "id": "order_cancelled",
        "type": "send_buttons",
        "content": {
          "text": "❌ Pedido cancelado.",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome"}
        ]
      },
      {
        "id": "confirm_invalid",
        "type": "send_buttons",
        "content": {
          "text": "Responde \"Sí, confirmar\" o \"No, cancelar\".",
          "buttons": [
            {"id": "confirm", "title": "Sí, confirmar"},
            {"id": "cancel", "title": "No, cancelar"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "confirm"}, "next_node_id": "order_confirmed"},
          {"condition": {"type": "button", "value": "cancel"}, "next_node_id": "order_cancelled"},
          {"condition": {"type": "default"}, "next_node_id": "confirm_invalid"}
        ]
      },
      {
        "id": "not_understood",
        "type": "send_buttons",
        "content": {
          "text": "{{not_understood_message}}\n\n{{menu_message}}",
          "buttons": [
            {"id": "btn_1", "title": "1"},
            {"id": "btn_2", "title": "2"},
            {"id": "btn_3", "title": "3"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "btn_1"}, "next_node_id": "show_catalog"},
          {"condition": {"type": "button", "value": "btn_2"}, "next_node_id": "show_prices"},
          {"condition": {"type": "button", "value": "btn_3"}, "next_node_id": "select_product"},
          {"condition": {"type": "default"}, "next_node_id": "welcome"}
        ]
      },
      {
        "id": "end",
        "type": "end",
        "content": {},
        "transitions": []
      }
    ]
  }'::jsonb,
  true,
  '1.0'
)
on conflict (slug) do update set
  giro = excluded.giro,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  json_definition = excluded.json_definition,
  es_default = excluded.es_default,
  version = excluded.version,
  updated_at = now();


-- ============================================================================
-- TEMPLATE 2/4: papeleria_v1 (giro 'papeleria')
-- Foco: venta de productos escolares. Catálogo dinámico.
-- ============================================================================
insert into public.flow_templates (slug, giro, nombre, descripcion, json_definition, es_default, version)
values (
  'papeleria_v1',
  'papeleria',
  'Papelería V1',
  'Flujo orientado a venta de productos escolares con catálogo dinámico.',
  '{
    "version": "1.0",
    "start_node_id": "welcome_pap",
    "nodes": [
      {
        "id": "welcome_pap",
        "type": "send_buttons",
        "content": {
          "text": "📚 ¡Bienvenido a {{nombre_negocio}}!\n\n¿En qué te puedo ayudar?",
          "buttons": [
            {"id": "ver_productos", "title": "Ver productos"},
            {"id": "hacer_pedido", "title": "Hacer pedido"},
            {"id": "humano", "title": "Hablar con humano"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "ver_productos"}, "next_node_id": "ver_productos_pap"},
          {"condition": {"type": "button", "value": "hacer_pedido"}, "next_node_id": "hacer_pedido_pap"},
          {"condition": {"type": "button", "value": "humano"}, "next_node_id": "escalate_pap"},
          {"condition": {"type": "default"}, "next_node_id": "no_entiendo_pap"}
        ]
      },
      {
        "id": "ver_productos_pap",
        "type": "send_buttons",
        "content": {
          "text": "{{catalog_listing}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome_pap"}
        ]
      },
      {
        "id": "hacer_pedido_pap",
        "type": "send_list",
        "content": {
          "text": "Elige el producto que deseas pedir:",
          "button_label": "Ver productos",
          "sections": [
            {
              "type": "dynamic",
              "title": "Productos",
              "items_source": "catalog_items"
            }
          ]
        },
        "transitions": [
          {"condition": {"type": "list_item_any", "save_to_context": "selected_product_id"}, "next_node_id": "confirmar_pedido_pap"},
          {"condition": {"type": "default"}, "next_node_id": "no_entiendo_pap"}
        ]
      },
      {
        "id": "confirmar_pedido_pap",
        "type": "send_buttons",
        "content": {
          "text": "Has elegido: *{{selected_product_name}}* — ${{selected_product_price}}\n\n¿Confirmas?",
          "buttons": [
            {"id": "si", "title": "Sí, confirmar"},
            {"id": "no", "title": "No, cancelar"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "si"}, "next_node_id": "pedido_confirmado_pap"},
          {"condition": {"type": "button", "value": "no"}, "next_node_id": "pedido_cancelado_pap"},
          {"condition": {"type": "default"}, "next_node_id": "confirmar_pedido_pap"}
        ]
      },
      {
        "id": "pedido_confirmado_pap",
        "type": "send_buttons",
        "content": {
          "text": "✅ Pedido confirmado. Te contactaremos para coordinar la entrega.\n\n#{{order_id}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome_pap"}
        ]
      },
      {
        "id": "pedido_cancelado_pap",
        "type": "send_buttons",
        "content": {
          "text": "❌ Pedido cancelado.",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome_pap"}
        ]
      },
      {
        "id": "no_entiendo_pap",
        "type": "send_buttons",
        "content": {
          "text": "Disculpa, no te entendí. Elige una opción:",
          "buttons": [
            {"id": "ver_productos", "title": "Ver productos"},
            {"id": "hacer_pedido", "title": "Hacer pedido"},
            {"id": "humano", "title": "Hablar con humano"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "ver_productos"}, "next_node_id": "ver_productos_pap"},
          {"condition": {"type": "button", "value": "hacer_pedido"}, "next_node_id": "hacer_pedido_pap"},
          {"condition": {"type": "button", "value": "humano"}, "next_node_id": "escalate_pap"},
          {"condition": {"type": "default"}, "next_node_id": "welcome_pap"}
        ]
      },
      {
        "id": "escalate_pap",
        "type": "escape_to_human",
        "content": {
          "user_response": "Te conectamos con el dueño. Te responderá en breve.",
          "owner_alert_template": "🚨 Cliente {{phone}} pidió hablar contigo en {{nombre_negocio}}.\nÚltimo mensaje: {{last_message}}"
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "end"}
        ]
      },
      {
        "id": "end",
        "type": "end",
        "content": {},
        "transitions": []
      }
    ]
  }'::jsonb,
  false,
  '1.0'
)
on conflict (slug) do update set
  giro = excluded.giro,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  json_definition = excluded.json_definition,
  es_default = excluded.es_default,
  version = excluded.version,
  updated_at = now();


-- ============================================================================
-- TEMPLATE 3/4: cerrajeria_v1 (giro 'cerrajeria')
-- Foco: urgencias y cotizaciones. Servicios estáticos (no catálogo dinámico).
-- ============================================================================
insert into public.flow_templates (slug, giro, nombre, descripcion, json_definition, es_default, version)
values (
  'cerrajeria_v1',
  'cerrajeria',
  'Cerrajería V1',
  'Flujo con triaje de urgencia, cotización por servicio y captura de ubicación.',
  '{
    "version": "1.0",
    "start_node_id": "welcome_cer",
    "nodes": [
      {
        "id": "welcome_cer",
        "type": "send_buttons",
        "content": {
          "text": "🔐 {{nombre_negocio}}\n\n¿Es una urgencia o consulta?",
          "buttons": [
            {"id": "urgencia", "title": "🚨 Urgencia"},
            {"id": "cotizar", "title": "Cotización"},
            {"id": "humano", "title": "Hablar con humano"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "urgencia"}, "next_node_id": "urgencia_cer"},
          {"condition": {"type": "button", "value": "cotizar"}, "next_node_id": "cotizar_cer"},
          {"condition": {"type": "button", "value": "humano"}, "next_node_id": "escalate_cer"},
          {"condition": {"type": "default"}, "next_node_id": "no_entiendo_cer"}
        ]
      },
      {
        "id": "urgencia_cer",
        "type": "escape_to_human",
        "content": {
          "user_response": "🚨 Recibí tu urgencia. El cerrajero te contactará en máximo 5 minutos. Por favor mantén tu teléfono cerca.",
          "owner_alert_template": "🚨 URGENCIA en {{nombre_negocio}}.\nCliente: {{phone}}\nMensaje: {{last_message}}"
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "end"}
        ]
      },
      {
        "id": "cotizar_cer",
        "type": "send_list",
        "content": {
          "text": "¿Qué servicio necesitas?",
          "button_label": "Ver servicios",
          "sections": [
            {
              "type": "static",
              "title": "Servicios",
              "items": [
                {"id": "cambio_cerradura", "title": "Cambio de cerradura", "description": "Reemplazo completo"},
                {"id": "copia_llave", "title": "Copia de llave", "description": "Llaves convencionales y de seguridad"},
                {"id": "apertura_emergencia", "title": "Apertura emergencia", "description": "Sin dañar la cerradura"},
                {"id": "instalacion", "title": "Instalación", "description": "Cerraduras nuevas y chapas"}
              ]
            }
          ]
        },
        "transitions": [
          {"condition": {"type": "list_item", "value": "cambio_cerradura"}, "next_node_id": "pedir_ubicacion_cer"},
          {"condition": {"type": "list_item", "value": "copia_llave"}, "next_node_id": "pedir_ubicacion_cer"},
          {"condition": {"type": "list_item", "value": "apertura_emergencia"}, "next_node_id": "pedir_ubicacion_cer"},
          {"condition": {"type": "list_item", "value": "instalacion"}, "next_node_id": "pedir_ubicacion_cer"},
          {"condition": {"type": "default"}, "next_node_id": "no_entiendo_cer"}
        ]
      },
      {
        "id": "pedir_ubicacion_cer",
        "type": "wait_input",
        "content": {
          "prompt": "Por favor compárteme tu ubicación o dirección para enviarte una cotización.",
          "save_to_context": "ubicacion_cliente"
        },
        "transitions": [
          {"condition": {"type": "keyword", "values": ["cancelar", "salir"]}, "next_node_id": "welcome_cer"},
          {"condition": {"type": "default"}, "next_node_id": "confirmar_solicitud_cer"}
        ]
      },
      {
        "id": "confirmar_solicitud_cer",
        "type": "send_buttons",
        "content": {
          "text": "Recibí tu solicitud. ¿Confirmas que envíe la cotización al dueño?",
          "buttons": [
            {"id": "si", "title": "Sí, enviar"},
            {"id": "no", "title": "Cancelar"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "si"}, "next_node_id": "solicitud_enviada_cer"},
          {"condition": {"type": "button", "value": "no"}, "next_node_id": "welcome_cer"},
          {"condition": {"type": "default"}, "next_node_id": "confirmar_solicitud_cer"}
        ]
      },
      {
        "id": "solicitud_enviada_cer",
        "type": "escape_to_human",
        "content": {
          "user_response": "✅ Tu solicitud fue enviada. El cerrajero te contactará en breve con la cotización.",
          "owner_alert_template": "💼 Cotización solicitada en {{nombre_negocio}}.\nCliente: {{phone}}\nÚltimo mensaje: {{last_message}}"
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "end"}
        ]
      },
      {
        "id": "no_entiendo_cer",
        "type": "send_buttons",
        "content": {
          "text": "No te entendí. Elige una opción:",
          "buttons": [
            {"id": "urgencia", "title": "🚨 Urgencia"},
            {"id": "cotizar", "title": "Cotización"},
            {"id": "humano", "title": "Hablar con humano"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "urgencia"}, "next_node_id": "urgencia_cer"},
          {"condition": {"type": "button", "value": "cotizar"}, "next_node_id": "cotizar_cer"},
          {"condition": {"type": "button", "value": "humano"}, "next_node_id": "escalate_cer"},
          {"condition": {"type": "default"}, "next_node_id": "welcome_cer"}
        ]
      },
      {
        "id": "escalate_cer",
        "type": "escape_to_human",
        "content": {
          "user_response": "Te conectamos con el cerrajero. Te responderá en breve.",
          "owner_alert_template": "🔐 Cliente {{phone}} pidió hablar contigo en {{nombre_negocio}}.\nMensaje: {{last_message}}"
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "end"}
        ]
      },
      {
        "id": "end",
        "type": "end",
        "content": {},
        "transitions": []
      }
    ]
  }'::jsonb,
  false,
  '1.0'
)
on conflict (slug) do update set
  giro = excluded.giro,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  json_definition = excluded.json_definition,
  es_default = excluded.es_default,
  version = excluded.version,
  updated_at = now();


-- ============================================================================
-- TEMPLATE 4/4: pizzeria_v1 (giro 'pizzeria')
-- Foco: pedido a domicilio con captura de dirección y teléfono.
-- ============================================================================
insert into public.flow_templates (slug, giro, nombre, descripcion, json_definition, es_default, version)
values (
  'pizzeria_v1',
  'pizzeria',
  'Pizzería V1',
  'Flujo de pedido a domicilio con catálogo dinámico, dirección y confirmación.',
  '{
    "version": "1.0",
    "start_node_id": "welcome_piz",
    "nodes": [
      {
        "id": "welcome_piz",
        "type": "send_buttons",
        "content": {
          "text": "🍕 {{nombre_negocio}}\n\n¿Qué deseas?",
          "buttons": [
            {"id": "menu", "title": "Ver menú"},
            {"id": "pedido", "title": "Hacer pedido"},
            {"id": "humano", "title": "Hablar con humano"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "menu"}, "next_node_id": "ver_menu_piz"},
          {"condition": {"type": "button", "value": "pedido"}, "next_node_id": "elegir_producto_piz"},
          {"condition": {"type": "button", "value": "humano"}, "next_node_id": "escalate_piz"},
          {"condition": {"type": "default"}, "next_node_id": "no_entiendo_piz"}
        ]
      },
      {
        "id": "ver_menu_piz",
        "type": "send_buttons",
        "content": {
          "text": "{{catalog_listing}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome_piz"}
        ]
      },
      {
        "id": "elegir_producto_piz",
        "type": "send_list",
        "content": {
          "text": "¿Qué quieres pedir?",
          "button_label": "Ver menú",
          "sections": [
            {
              "type": "dynamic",
              "title": "Productos",
              "items_source": "catalog_items"
            }
          ]
        },
        "transitions": [
          {"condition": {"type": "list_item_any", "save_to_context": "selected_product_id"}, "next_node_id": "pedir_direccion_piz"},
          {"condition": {"type": "default"}, "next_node_id": "no_entiendo_piz"}
        ]
      },
      {
        "id": "pedir_direccion_piz",
        "type": "wait_input",
        "content": {
          "prompt": "🏠 Compárteme la dirección de entrega (calle, número, colonia y referencias).",
          "save_to_context": "direccion_envio"
        },
        "transitions": [
          {"condition": {"type": "keyword", "values": ["cancelar", "salir"]}, "next_node_id": "welcome_piz"},
          {"condition": {"type": "default"}, "next_node_id": "pedir_telefono_piz"}
        ]
      },
      {
        "id": "pedir_telefono_piz",
        "type": "wait_input",
        "content": {
          "prompt": "📞 Déjame un teléfono de contacto por si el repartidor necesita llamarte.",
          "save_to_context": "telefono_contacto"
        },
        "transitions": [
          {"condition": {"type": "keyword", "values": ["cancelar", "salir"]}, "next_node_id": "welcome_piz"},
          {"condition": {"type": "default"}, "next_node_id": "confirmar_pedido_piz"}
        ]
      },
      {
        "id": "confirmar_pedido_piz",
        "type": "send_buttons",
        "content": {
          "text": "Resumen:\n\n🍕 {{selected_product_name}} — ${{selected_product_price}}\n\n¿Confirmas el pedido?",
          "buttons": [
            {"id": "si", "title": "Sí, confirmar"},
            {"id": "no", "title": "No, cancelar"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "si"}, "next_node_id": "pedido_listo_piz"},
          {"condition": {"type": "button", "value": "no"}, "next_node_id": "pedido_cancelado_piz"},
          {"condition": {"type": "default"}, "next_node_id": "confirmar_pedido_piz"}
        ]
      },
      {
        "id": "pedido_listo_piz",
        "type": "send_buttons",
        "content": {
          "text": "✅ Pedido recibido. Te avisamos cuando esté en camino.\n\n#{{order_id}}",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome_piz"}
        ]
      },
      {
        "id": "pedido_cancelado_piz",
        "type": "send_buttons",
        "content": {
          "text": "❌ Pedido cancelado.",
          "buttons": [
            {"id": "back", "title": "Volver al menú"}
          ]
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "welcome_piz"}
        ]
      },
      {
        "id": "no_entiendo_piz",
        "type": "send_buttons",
        "content": {
          "text": "No te entendí. Elige una opción:",
          "buttons": [
            {"id": "menu", "title": "Ver menú"},
            {"id": "pedido", "title": "Hacer pedido"},
            {"id": "humano", "title": "Hablar con humano"}
          ]
        },
        "transitions": [
          {"condition": {"type": "button", "value": "menu"}, "next_node_id": "ver_menu_piz"},
          {"condition": {"type": "button", "value": "pedido"}, "next_node_id": "elegir_producto_piz"},
          {"condition": {"type": "button", "value": "humano"}, "next_node_id": "escalate_piz"},
          {"condition": {"type": "default"}, "next_node_id": "welcome_piz"}
        ]
      },
      {
        "id": "escalate_piz",
        "type": "escape_to_human",
        "content": {
          "user_response": "Te conectamos con la pizzería. Te responderán en breve.",
          "owner_alert_template": "🍕 Cliente {{phone}} pidió hablar contigo en {{nombre_negocio}}.\nMensaje: {{last_message}}"
        },
        "transitions": [
          {"condition": {"type": "default"}, "next_node_id": "end"}
        ]
      },
      {
        "id": "end",
        "type": "end",
        "content": {},
        "transitions": []
      }
    ]
  }'::jsonb,
  false,
  '1.0'
)
on conflict (slug) do update set
  giro = excluded.giro,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  json_definition = excluded.json_definition,
  es_default = excluded.es_default,
  version = excluded.version,
  updated_at = now();