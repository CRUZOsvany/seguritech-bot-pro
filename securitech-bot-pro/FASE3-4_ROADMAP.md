# 🗺️ HOJA DE RUTA - FASE 3-4: FORMULARIO NUEVO CLIENTE

**Estimado**: 2-3 semanas | **Complejidad**: Media-Alta | **Prioridad**: 🔴 CRÍTICA

---

## 📋 Visión General

El objetivo de **FASE 3-4** es construir un formulario complejo pero intuitivo para crear y editar clientes (tenants). El formulario tendrá:

- **5 secciones colapsables** usando componentes Accordion
- **Indicadores visuales** de progreso (checkbox verde/gris)
- **Validación en cliente** con React Hook Form + Zod
- **Vista previa del bot** antes de guardar
- **Upload de PDF** con parseo automático de catálogos

---

## 🎯 Objetivos Específicos

- [x] Crear página `/clients/new` para nuevo cliente
- [ ] Crear componente ClientFormPage (contenedor)
- [ ] Implementar 5 secciones de formulario
- [ ] Validación con React Hook Form + Zod
- [ ] Upload y parseo de PDF para catálogos
- [ ] Vista previa del bot (simulador WhatsApp)
- [ ] Integración con API POST/PUT /api/clients
- [ ] Notificación al backend Node.js
- [ ] Tests de formulario

---

## 📁 Archivos a Crear

### 1️⃣ Página Principal
```
app/(dashboard)/clients/new/page.tsx (120 líneas)
└── Contenedor principal que llama a <ClientFormPage />
    ├── Maneja rutas
    ├── Redirige a dashboard si es creación exitosa
    └── Integración con Supabase (si aplica)
```

### 2️⃣ Componente Principal de Formulario
```
components/forms/ClientFormPage.tsx (400+ líneas)
└── Componente que:
    ├── Usa React Hook Form para estado global
    ├── Controla apertura/cierre de secciones
    ├── Valida contra esquema Zod
    ├── Maneja sumisión al API
    └── Muestra validaciones en tiempo real
```

### 3️⃣ Cinco Componentes de Secciones
```
components/forms/
├── BusinessFormSection.tsx (120 líneas)
│   └── Sección 1: Datos del negocio
│       ├── nombre_negocio, giro, dirección
│       ├── horarios semana/sábado
│       └── toggle abre_domingo
│
├── OwnerFormSection.tsx (120 líneas)
│   └── Sección 2: Dueño y cobranza
│       ├── nombre_dueno, whatsapp_dueno
│       ├── monto_mensual, fecha_proximo_pago
│       └── notas_internas (textarea)
│
├── BotConfigFormSection.tsx (180 líneas)
│   └── Sección 3: Configuración del bot
│       ├── numero_whatsapp_asignado
│       ├── nombre_bot, tono_bot (select)
│       └── 5 textareas para mensajes
│
├── CatalogFormSection.tsx (200 líneas)
│   └── Sección 4: Catálogo
│       ├── Toggle: "Subir PDF" vs "Captura Manual"
│       ├── Upload PDF + parser
│       ├── Vista previa de parsed items
│       └── Tabla editable manual
│
└── AlertsFormSection.tsx (100 líneas)
    └── Sección 5: Alertas urgentes
        ├── Toggle servicio urgente
        ├── whatsapp_alertas_urgentes
        ├── mensaje_alerta_admin
        └── tiempo_respuesta_prometido
```

### 4️⃣ Componente Vista Previa del Bot
```
components/previews/BotPreview.tsx (250 líneas)
└── Simulador de conversación WhatsApp
    ├── Burbuja de bienvenida
    ├── Burbuja de menú principal
    ├── Burbuja de error (cuando no entiende)
    └── Botones simulados
```

### 5️⃣ Utilidad de Parseo PDF
```
lib/pdf-parser.ts (150 líneas)
└── Funciones para:
    ├── Leer archivo PDF desde input
    ├── Extraer texto
    ├── Parsear líneas a productos
    ├── Validar formato esperado
    └── Retornar array de CatalogItem
```

### 6️⃣ API Route Mejorado
```
app/api/clients/[tenantId]/route.ts (200 líneas)
└── Manejo de PUT/DELETE (ya existe GET/POST)
```

---

## 🏗️ Arquitectura del Formulario

```
ClientFormPage.tsx (contenedor principal con RHF)
│
├─ BusinessFormSection
│  ├─ Input (nombre_negocio)
│  ├─ Select (giro)
│  ├─ Input (dirección)
│  ├─ Input (horarios)
│  └─ Checkbox (abre_domingo)
│
├─ OwnerFormSection
│  ├─ Input (nombre_dueno)
│  ├─ Input (whatsapp_dueno)
│  ├─ Input[type=number] (monto_mensual)
│  ├─ Input[type=date] (fecha_proximo_pago)
│  └─ Textarea (notas_internas)
│
├─ BotConfigFormSection
│  ├─ Input (numero_whatsapp)
│  ├─ Input (nombre_bot)
│  ├─ Select (tono_bot)
│  ├─ Textarea (mensaje_bienvenida)
│  ├─ Textarea (mensaje_menu_principal)
│  ├─ Textarea (mensaje_fuera_horario)
│  ├─ Textarea (mensaje_no_entendio)
│  └─ Textarea (mensaje_confirmacion_pedido)
│
├─ CatalogFormSection
│  ├─ RadioGroup: "PDF" vs "Manual"
│  ├─ [Si PDF]
│  │  ├─ Input[type=file]
│  │  ├─ Botón parsear
│  │  └─ Tabla previa
│  └─ [Si Manual]
│     ├─ Tabla editable inline
│     └─ Botón agregar producto
│
├─ AlertsFormSection
│  ├─ Toggle (tiene_servicio_urgente)
│  ├─ [Si toggle=true]
│  │  ├─ Input (whatsapp_alertas)
│  │  ├─ Textarea (mensaje_alerta)
│  │  └─ Input (tiempo_respuesta)
│  └─ [Si toggle=false]
│     └─ Deshabilitado (grisado)
│
├─ BotPreview (componente card separado)
│  └─ Simulador de WhatsApp inline
│
└─ Botones de acción
   ├─ Botón "Guardar Cliente"
   ├─ Botón "Vista Previa" (modal)
   └─ Botón "Cancelar"
```

---

## ✅ Checklist Detallado

### Paso 1: Preparación (1-2 horas)
- [ ] Leer arquitectura de formulario arriba
- [ ] Revisar `lib/validators.ts` (esquemas Zod)
- [ ] Revisar componentes UI existentes
- [ ] Crear estructura de carpetas
- [ ] Crear stubs de archivos

### Paso 2: Componentes Base (4-6 horas)
- [ ] Crear `BusinessFormSection.tsx` 
- [ ] Crear `OwnerFormSection.tsx`
- [ ] Crear `BotConfigFormSection.tsx`
- [ ] Crear `AlertsFormSection.tsx`
- [ ] Crear `CatalogFormSection.tsx` (básico, sin PDF aún)

### Paso 3: Contenedor Principal (3-4 horas)
- [ ] Crear `ClientFormPage.tsx` con React Hook Form
- [ ] Implementar estado de secciones abiertas/cerradas
- [ ] Conectar validación Zod a form
- [ ] Mostrar errores en componentes hijos
- [ ] Implementar API call a POST /api/clients

### Paso 4: PDF Parsing (3-4 horas)
- [ ] Instalar `pdf-parse` y `pdfjs-dist`
- [ ] Crear `lib/pdf-parser.ts` con funciones
- [ ] Implementar input file en `CatalogFormSection`
- [ ] Tabla de preview de ítems parseados
- [ ] Validación de formato esperado

### Paso 5: Vista Previa Bot (2-3 horas)
- [ ] Crear `BotPreview.tsx` con estilos WhatsApp
- [ ] Mostrar burbujas dinámicamente
- [ ] Usar datos del formulario para mensajes
- [ ] Modal o sección expandible

### Paso 6: Integración API (2-3 horas)
- [ ] PUT `app/api/clients/[tenantId]/route.ts`
- [ ] DELETE `app/api/clients/[tenantId]/route.ts`
- [ ] Crear `app/(dashboard)/clients/[tenantId]/page.tsx` (editar)
- [ ] Notificar backend sobre cambios

### Paso 7: Testing (2-3 horas)
- [ ] Test validación Zod de cada sección
- [ ] Test de PDF parser (con archivo de prueba)
- [ ] Test de form submission
- [ ] Test de redirecciones
- [ ] Test de visibilidad por rol

### Paso 8: Polish (1-2 horas)
- [ ] Mensajes de éxito/error en toast
- [ ] Loading states en botones
- [ ] Indicadores de progreso
- [ ] Responsive design en mobile
- [ ] Documentación en JSDoc

---

## 📐 Detalles Técnicos por Componente

### BusinessFormSection
```tsx
Input: nombre_negocio
  - Min 3 caracteres
  - Max 100 caracteres
  - Único en BD (validar en submit)
  - Placeholder: "Ej: Ferretería Ana"

Select: giro (options de enum BusinessType)
  - "ferreteria", "papeleria", "cerrajeria", etc.
  - Requerido

Input: dirección
  - Min 5 caracteres
  - Max 200 caracteres
  
Input: horario_semana
  - Pattern: /\d{1,2}:\d{2}[ap]m-\d{1,2}:\d{2}[ap]m/
  - Placeholder: "9am-7pm"
  - Opcional
  
Input: horario_sabado
  - Mismo pattern que semana
  - Opcional
  
Checkbox: abre_domingo
  - Default: false
```

### BotConfigFormSection
```
Este es el más complejo. Campos:

Input: numero_whatsapp_asignado
  - Validar formato internacional (+XX...)
  - Mostrar dropdown si hay números disponibles (FUTURE)
  
Input: nombre_bot
  - Ej: "Ana de Ferretería Ana"
  - 2-50 caracteres
  
Select: tono_bot
  - "formal", "amigable", "directo"
  - Descripción breve de c ada uno
  
Textarea: mensaje_bienvenida
  - Min 10, Max 500 caracteres
  - Preview en tiempo real
  - Macro: {nombre_bot}, {nombre_negocio}
  
Textarea: mensaje_menu_principal
  - Min 10, Max 1000 caracteres
  - Listar opciones del menú (FUTURE)
  
Textarea: mensaje_fuera_horario
  Textarea: mensaje_no_entendio
Textarea: mensaje_confirmacion_pedido
  - Todos similar a los anteriores
```

### CatalogFormSection - PDF Parser
```tsx
Flujo:

1. User selecciona "Subir PDF"
2. input type="file" accept=".pdf"
3. User selecciona archivo
4. Click "Procesar PDF"
5. Llamar lib/pdf-parser.ts
6. Mostrar tabla con resultados
7. Botones: "Confirmar", "Editar", "Descartarlos"

La función parseador puede esperar:
Formato A:
  Producto 1 | $10.50
  Producto 2 | $20.00
  
Formato B:
  Producto | Categoría | Precio | Disponible
  ...
  
Parsear con regex y retornar:
[
  { nombre_producto, precio, categoria, disponible },
  ...
]
```

### API Response Esperado

```ts
// POST /api/clients (crear nuevo)
{
  status: "success",
  data: {
    id: "uuid",
    nombre_negocio: "Ferretería Ana",
    // ... todos los datos
    message: "Cliente creado exitosamente"
  }
}

// PUT /api/clients/[tenantId] (actualizar)
{
  status: "success",
  data: { /* tenant actualizado */ }
}

// Error
{
  status: "error",
  error: "El nombre del negocio ya existe"
}
```

---

## 🧪 Testing - Casos a Verificar

```
Test 1: Validación de Sección 1
  - Nombre vacío → Error "requerido"
  - Nombre < 3 chars → Error
  - Giro no seleccionado → Error
  
Test 2: Validación de Phone
  - "1234" → Error formato
  - "+34 123 456 78 90" → OK
  - "+19876543210" → OK
  
Test 3: PDF Parser
  - PDF válido → Parse OK
  - PDF corrupto → Error
  - PDF sin productos → Array vacío
  
Test 4: Form Submission
  - Todos campos válidos → POST /api/clients
  - Datos duplicados → Mostrar error
  - Servidor lento → Loading state
  
Test 5: Edición (PUT)
  - Usuario solo puede editar su tenant
  - SuperAdmin puede editar cualquier tenant
  - PATCH parcial de campos
  
Test 6: Accordion
  - Abre/cierra secciones
  - Indicadores de completo
  - Tab order correcto
```

---

## 🎨 UI/UX Detalles

### Indicadores de Progreso
```
Por sección:
○ Incompleta (gris)
✓ Completada (verde)

Tooltip: "2 de 5 secciones completadas"
```

### Validación Inline
```
Campo nombre_negocio:
┌─────────────────────────────┐
│ Nombre del negocio*         │
│ [Ferretería...]             │ (input)
│ ✓ Nombre válido             │ (verde si OK)
└─────────────────────────────┘

Si error:
│ ✗ Mínimo 3 caracteres       │ (rojo)
```

### Modal de Vista Previa
```
┌──────────────────────────────────┐
│  Vista Previa del Bot            │
├──────────────────────────────────┤
│  [Simulador WhatsApp]            │
│  ┌─────────────────────┐        │
│  │ Hola! Soy Ana      │ ← bot  │
│  │ ¿Cómo puedo ayudarte?│       │
│  │ [1] Catálogo        │ button│
│  │ [2] Atención urgente│ button│
│  └─────────────────────┘        │
│                                  │
│  [Guardar]  [Editar]  [Cancelar]│
└──────────────────────────────────┘
```

---

## 🚨 Errores Comunes a Evitar

❌ **Validación solo en submit** - Hacer en tiempo real  
❌ **Form muy grande** - Dividir en secciones (ya lo hicimos)  
❌ **PDF parsing en main thread** - Usar Web Workers (FUTURE)  
❌ **No manejar errores de API** - Mostrar toast  
❌ **Olvidar validar en servidor** - Repetir Zod en API  
❌ **No limpiar form después de submit** - reset()  
❌ **Uploads de PDF sin límite de tamaño** - Limitar a 10MB  

---

## 📚 Referencias y Ejemplos

### Código Referencia - React Hook Form
```tsx
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateClientFormSchema, CreateClientFormData } from '@/lib/validators';
import { Input, Textarea, Select } from '@/components/ui/Form';

export const ClientFormPage = () => {
  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<CreateClientFormData>({
    resolver: zodResolver(CreateClientFormSchema),
    mode: 'onChange', // Validar en cada cambio
  });

  const onSubmit = async (data: CreateClientFormData) => {
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (response.ok) {
        reset();
        router.push('/dashboard');
      } else {
        const error = await response.json();
        toast.error(error.error);
      }
    } catch (error) {
      toast.error('Error al guardar cliente');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Secciones */}
    </form>
  );
};
```

---

## 🚀 Priorización de Features

### MVP (Must Have)
1. ✅ Formulario 5 secciones
2. ✅ Validación Zod
3. ✅ API POST /api/clients
4. ✅ Edición PUT /api/clients/[tenantId]

### Importante (Should Have)
5. ✅ PDF parser
6. ✅ Vista previa bot
7. ✅ Toast de errores

### Nice to Have (Could Have)
8. [ ] Importar desde CSV
9. [ ] Plantillas de mensajes
10. [ ] Múltiples catálogos por cliente

---

## 📞 Entrega y Handoff

(Una vez completado)

1. **Testing**: Cumplir con checklist supra
2. **Documentación**: Agregar comentarios JSDoc
3. **Commit**: Git commit con mensaje claro
4. **PR**: Crear Pull Request con descripción
5. **Review**: Peer review (si aplica)
6. **Merge**: A main/production
7. **Deploy**: A staging/preview

---

**Estimado Total**: 16-20 horas  
**Dificultad**: Media-Alta  
**Prioridad**: 🔴 CRÍTICA - Bloquear FASE 5  
**Beneficio**: Funcionalidad core del sistema

¡Adelante! 🚀

