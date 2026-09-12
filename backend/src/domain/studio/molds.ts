import type { WizardSpec } from './wizard';

/**
 * Moldes del asistente del Studio: el punto de partida para crear el bot de
 * un giro sin empezar en blanco.
 *
 * Cada molde trae la especificación del asistente y textos sugeridos para
 * bot_configuration. Los textos sugeridos solo se ofrecen: el asistente los
 * aplica si el negocio todavía no tiene los suyos. No llevan {{variables}}:
 * el motor no resuelve variables dentro de los textos del negocio.
 */
export interface StudioMold {
  id: string;
  nombre: string;
  descripcion: string;
  spec: WizardSpec;
  textosSugeridos: {
    mensaje_bienvenida: string;
    mensaje_menu_principal: string;
    mensaje_no_entendio: string;
    mensaje_fuera_horario: string;
  };
}

const SI = ['si', 'sí', 'correcto', 'es correcto', 'ok'];
const NO = ['no', 'corregir', 'cambiar', 'esta mal', 'está mal'];

/**
 * Cerrajería: el mismo bot que backend/scripts/cerrajeria-flow.json, armado
 * con el asistente. Mismos textos, opciones, listas y alertas. La única
 * diferencia es de reconocimiento por texto libre: el asistente usa las
 * mismas palabras clave de cada opción en todos los menús, mientras el molde
 * JSON usaba listas más cortas en "no te entendí" y en información.
 * molds.test.ts comprueba que en la conversación grabada responden igual.
 */
const cerrajeria: StudioMold = {
  id: 'cerrajeria',
  nombre: 'Cerrajería',
  descripcion: 'Emergencias 24/7, servicios con cita e información. Cada caso termina con un cerrajero.',
  textosSugeridos: {
    mensaje_bienvenida: '¡Hola! 👋 Gracias por escribirnos.',
    mensaje_menu_principal: '¿En qué te podemos ayudar?',
    mensaje_no_entendio: 'No te entendí 😅. Elige una de estas opciones:',
    mensaje_fuera_horario: 'Ahorita estamos fuera de horario. Si es una emergencia, escríbenos "emergencia" y te atendemos.',
  },
  spec: {
    version: 1,
    menu: { listButtonLabel: 'Ver opciones', listSectionTitle: 'Opciones' },
    options: [
      {
        id: 'emergencia',
        title: '🚨 Emergencia',
        kind: 'capture',
        keywords: [
          'emergencia', 'emergencias', 'urgencia', 'urgente', 'auxilio', 'ayuda', 'me quede afuera',
          'me quedé afuera', 'se me perdieron las llaves', 'se me perdio la llave', 'se me perdió la llave',
          'no abre', 'no puedo entrar', 'estoy encerrado', 'estoy encerrada',
        ],
        choices: {
          text: '🚨 Atendemos emergencias 24/7. ¿Qué necesitas resolver ahora?',
          buttonLabel: 'Ver emergencias',
          sectionTitle: 'Emergencias',
          items: [
            { title: 'Apertura de puerta', description: 'Casa, negocio o habitación' },
            { title: 'Apertura de carro', description: 'Auto cerrado con llaves dentro' },
            { title: 'Otra emergencia', description: 'Cuéntanos tu caso' },
          ],
          saveAs: 'tipo_emergencia',
        },
        question:
          'Entendido. Compártenos en un solo mensaje:\n📍 tu *dirección* (calle, número, colonia y una referencia visible)\n📱 un *teléfono* de contacto\n\nEjemplo: _Calle Guerrero 45, Col. Centro, cerca de la farmacia. Tel 747 123 4567_',
        saveAs: 'datos_emergencia',
        confirm: {
          text: 'Para confirmar antes de avisar al cerrajero, esto fue lo que recibí:\n\n📍 _{{datos_emergencia}}_\n\n¿Es correcto?',
          yesTitle: '✅ Sí, correcto',
          noTitle: '✏️ Corregir',
          yesKeywords: SI,
          noKeywords: NO,
        },
        handoff: {
          userResponse: '🛠️ Listo. Un cerrajero de {{nombre_negocio}} te marca en unos minutos. Ten tu teléfono a la mano.',
          ownerAlert: '🚨 EMERGENCIA: {{tipo_emergencia}}\n📍 {{datos_emergencia}}\n📱 WhatsApp: {{phone}}',
        },
      },
      {
        id: 'agendar',
        title: '📅 Agendar servicio',
        kind: 'capture',
        keywords: ['agendar', 'agenda', 'cita', 'servicio', 'servicios', 'agendar servicio', 'cambiar chapa', 'cambio de chapa'],
        choices: {
          text: '📅 ¿Qué servicio quieres agendar?',
          buttonLabel: 'Ver servicios',
          sectionTitle: 'Servicios',
          items: [
            { title: 'Chapas hogar/negocio', description: 'Instalación y cambio de chapas' },
            { title: 'Chapas de carro', description: 'Cerraduras automotrices' },
            { title: 'Reparación controles', description: 'Controles que no responden' },
            { title: 'Programación de llaves', description: 'Llaves y controles automotrices' },
            { title: 'Módulos y computadoras', description: 'Venta y reparación automotriz' },
            { title: 'Cajas fuertes', description: 'Apertura, venta y mantenimiento' },
          ],
          saveAs: 'servicio',
        },
        question:
          'Perfecto. Cuéntanos en un solo mensaje: qué necesitas, tu *zona o dirección*, un *teléfono* de contacto y si prefieres algún día u horario.\n\nEjemplo: _Cambio de chapa en Col. Centro, tel 747 123 4567, de preferencia mañana en la tarde_',
        saveAs: 'detalle_servicio',
        confirm: {
          text: 'Para confirmar antes de agendar, esto fue lo que recibí:\n\n📝 _{{detalle_servicio}}_\n\n¿Es correcto?',
          yesTitle: '✅ Sí, correcto',
          noTitle: '✏️ Corregir',
          yesKeywords: SI,
          noKeywords: NO,
        },
        handoff: {
          userResponse: '✅ Gracias. Un cerrajero de {{nombre_negocio}} te contactará para agendar y darte tu cotización.',
          ownerAlert: '📅 AGENDAR: {{servicio}}\n📝 {{detalle_servicio}}\n📱 WhatsApp: {{phone}}',
        },
      },
      {
        id: 'info',
        title: 'ℹ️ Información',
        kind: 'info',
        keywords: ['informacion', 'información', 'info', 'precios', 'cotizar', 'cotizacion', 'cotización', 'cuanto cuesta', 'cuánto cuesta'],
        text:
          'En {{nombre_negocio}} hacemos:\n• Apertura de puertas y autos (24/7)\n• Chapas de casa, negocio y auto\n• Programación de llaves y controles automotrices\n• Reparación de controles\n• Venta y reparación de módulos y computadoras\n• Apertura, venta y mantenimiento de cajas fuertes\n\n¿Qué deseas hacer?',
        actions: [
          { title: '📅 Agendar', goto: 'agendar' },
          { title: '🚨 Emergencia', goto: 'emergencia' },
          { title: 'Salir', goto: 'farewell' },
        ],
      },
    ],
    notUnderstood: {
      attempts: 2,
      retryText: 'Sigo sin entenderte 😕. Elige una opción o te conecto directo con alguien:',
      handoff: {
        userResponse: 'No logré entenderte 🙏. Te conecto con alguien de {{nombre_negocio}} para que te ayude directo.',
        ownerAlert:
          '⚠️ El bot no logró entender al cliente tras 2 intentos.\n📱 WhatsApp: {{phone}}\n💬 Último mensaje: "{{last_message}}"\nContáctalo directo desde el chat.',
      },
    },
    farewell: {
      text: 'Gracias por contactar a {{nombre_negocio}}. Estamos 24/7. 🔐',
      keywords: ['salir', 'no', 'gracias', 'adios', 'adiós'],
    },
  },
};

export const STUDIO_MOLDS: readonly StudioMold[] = [cerrajeria];
