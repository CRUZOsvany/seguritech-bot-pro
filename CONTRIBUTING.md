# Guía de Contribución

## Bienvenida

¡Gracias por tu interés en contribuir al **SegurITech Bot Pro**! Esta guía te ayudará a entender cómo contribuir de manera efectiva.

---

## 1. Antes de Empezar

### Leer la Documentación
- 📖 [README.md](README.md) - Visión general
- 🏗️ [ARCHITECTURE.md](ARCHITECTURE.md) - Arquitectura hexagonal

### Entender los Principios
- ✅ Arquitectura Hexagonal (Ports & Adapters)
- ✅ Clean Code
- ✅ SOLID Principles
- ✅ TypeScript Estricto

---

## 2. Configurar Entorno de Desarrollo

```bash
# Clonar
git clone https://github.com/seguritech/seguritech-bot-pro.git
cd seguritech-bot-pro

# Instalar
npm install

# Compilar
npm run build

# Ejecutar tests (cuando existan)
npm test
```

---

## 3. Proceso de Contribución

### Paso 1: Crear Issue
Antes de empezar a codificar:
```
Título: [FEATURE/BUG/DOCS] Descripción breve

Descripción:
- Qué problema resuelve
- Por qué es importante
- Cómo debería funcionar
```

### Paso 2: Fork y Branch

```bash
# Fork en GitHub (botón Fork)

# Clonar tu fork
git clone https://github.com/TU_USUARIO/seguritech-bot-pro.git

# Crear rama
git checkout -b feature/description-clara
# o
git checkout -b fix/description-clara
```

### Paso 3: Codificar

**Estructura de nuevas características:**

```
src/
├── domain/
│   ├── entities/      # Nuevas entidades si necesario
│   ├── ports/         # Nuevos puertos (interfaces)
│   └── use-cases/     # Nuevo caso de uso
├── infrastructure/
│   ├── adapters/      # Nuevo adaptador
│   └── repositories/  # Nuevo repositorio
└── app/
    └── controllers/   # Integrar en controlador
```

**Ejemplo: Nueva funcionalidad "Obtener promociones"**

```typescript
// 1. DOMINIO: Entidad
export interface Promotion {
  id: string;
  description: string;
  discount: number;
}

// 2. DOMINIO: Puerto
export interface PromotionRepository {
  findActive(): Promise<Promotion[]>;
}

// 3. DOMINIO: Caso de uso
export class GetActivePromotionsUseCase {
  constructor(private promotionRepository: PromotionRepository) {}

  async execute(): Promise<Promotion[]> {
    return await this.promotionRepository.findActive();
  }
}

// 4. INFRAESTRUCTURA: Adaptador
export class MongoPromotionRepository implements PromotionRepository {
  async findActive(): Promise<Promotion[]> {
    return await Promotion.find({ active: true });
  }
}

// 5. APLICACIÓN: Integrar
export class BotController {
  private getPromotionsUseCase: GetActivePromotionsUseCase;

  async handlePromotions(): Promise<BotResponse> {
    const promotions = await this.getPromotionsUseCase.execute();
    return {
      message: this.formatPromotions(promotions),
    };
  }
}
```

### Paso 4: Calidad de Código

**Antes de hacer commit:**

```bash
# Type-check
npm run type-check

# Linting
npm run lint

# Compilar
npm run build

# Sin errores: ✅
```

**Checklist:**
- ✅ TypeScript sin errores
- ✅ ESLint sin warnings
- ✅ Nombres claros
- ✅ Funciones pequeñas
- ✅ Sin código duplicado
- ✅ Sin `console.log` (usar logger)
- ✅ Comentarios en lógica compleja
- ✅ Arquitectura hexagonal respetada

### Paso 5: Commit

```bash
git add .

# Mensajes de commit claros
git commit -m "feat: agregar obtener promociones activas

- Crear entidad Promotion
- Crear puerto PromotionRepository
- Crear caso de uso GetActivePromotionsUseCase
- Implementar adaptador MongoDB
- Integrar en BotController"
```

**Formato de Commit:**
```
type(scope): descripción

body (opcional)
- Punto 1
- Punto 2

footer (opcional)
Closes #issue-number
```

**Types:**
- `feat:` Nueva funcionalidad
- `fix:` Corrección de bug
- `refactor:` Cambio sin nuevas funciones
- `docs:` Documentación
- `test:` Tests
- `chore:` Dependencias, tooling

### Paso 6: Push

```bash
git push origin feature/description-clara
```

### Paso 7: Pull Request

1. Ir a GitHub
2. Click "Compare & pull request"
3. Descripción clara:

```markdown
## Descripción
Describe qué hace tu PR

## Tipo de cambio
- [ ] Nueva funcionalidad
- [ ] Corrección de bug
- [ ] Cambio que requiere actualización de documentación

## Cambios
- Punto 1
- Punto 2

## Checklist
- [x] Mi código sigue los estilos del proyecto
- [x] He actualizado la documentación
- [x] Sin warnings de linting
- [x] Código TypeScript validado

Closes #issue-number
```

---

## 4. Guías de Estilo

### Nombres de Archivos

```
# Classes
✅ MyClassName.ts
❌ my-class-name.ts
❌ myClassName.ts

# Interfaces
✅ MyInterface.ts (sin prefijo "I")
❌ IMyInterface.ts

# Funciones/Variables
✅ myVariableName
❌ my-variable-name
❌ MyVariableName
```

### Nombres de Variables

```typescript
// ✅ BIEN: Claros y descriptivos
const userRepository: UserRepository;
const notificationPort: NotificationPort;
const getActivePromotions = (users: User[]): User[] => {};

// ❌ MAL: Ambiguos o genéricos
const repo: any;
const notification: any;
const process = (): void => {};
```

### Funciones

```typescript
// ✅ BIEN: Pequeñas y enfocadas
private isGreeting(content: string): boolean {
  return ['hola', 'hi'].some(g => content.includes(g));
}

// ❌ MAL: Grande y haciendo múltiples cosas
private process(input: string): boolean {
  // 100+ líneas aquí
}
```

### Comentarios

```typescript
// ✅ BIEN: Explicar el "por qué", no el "qué"
// Mantener en memoria para desarrollo, reemplazar con DB en prod
private users: Map<string, User> = new Map();

// ✅ BIEN: Comentar lógica compleja
// Algoritmo de Floyd-Warshall para detectar ciclos
const hasCycle = (graph: Graph): boolean => {};

// ❌ MAL: Obvi obvio
const name = 'John'; // Asignar nombre
const isValid = true; // Es válido
```

### Tipos

```typescript
// ✅ BIEN: Tipado explícito
async execute(message: Message): Promise<BotResponse> {
  const user: User = await this.userRepository.findById(id);
  return response;
}

// ❌ MAL: Any
async execute(message: any): Promise<any> {
  const user: any = await this.userRepository.findById(id);
  return response;
}
```

---

## 5. Testing (Cuando Agregues)

```typescript
import { HandleMessageUseCase } from './HandleMessageUseCase';

describe('HandleMessageUseCase', () => {
  let useCase: HandleMessageUseCase;
  let mockUserRepo: MockUserRepository;
  let mockNotification: MockNotificationPort;

  beforeEach(() => {
    mockUserRepo = new MockUserRepository();
    mockNotification = new MockNotificationPort();
    useCase = new HandleMessageUseCase(mockUserRepo, mockNotification);
  });

  it('should respond to greeting', async () => {
    const message: Message = {
      id: '1',
      from: '+34123',
      content: 'Hola',
      timestamp: new Date(),
    };

    const response = await useCase.execute(message);

    expect(response.message).toContain('Bienvenido');
    expect(response.nextState).toBe(UserState.MENU);
  });

  it('should handle unknown input', async () => {
    const message: Message = {
      id: '2',
      from: '+34123',
      content: 'xyz123',
      timestamp: new Date(),
    };

    const response = await useCase.execute(message);

    expect(response.message).toContain('No entiendo');
  });
});
```

---

## 6. Documentación

### Actualizar README.md
Si tu feature es importante para usuarios:

```markdown
## 🆕 Mi Nueva Característica

Descripción de qué hace.

### Ejemplo
```typescript
// Código de ejemplo
```

### Consideraciones
- Punto importante 1
- Punto importante 2
```

### Actualizar ARCHITECTURE.md
Si cambias la estructura:

```markdown
## Mi Nuevo Componente

Descripción arquitectónica.

### Responsabilidades
- Una cosa
- Otra cosa

### Ejemplo de Uso
```typescript
// Cómo se usa
```
```

---

## 7. Revisar tu Propio Código

Antes de enviar PR:

```bash
# 1. Compilar
npm run build

# 2. Linting
npm run lint

# 3. Type check
npm run type-check

# 4. Lee tu código
# ¿Es fácil de entender?
# ¿Respeta la arquitectura?
# ¿Tiene sentido?
```

---

## 8. Responder Feedback

Si se pide cambios en tu PR:

```bash
# Hacer cambios
# Commit
git commit -m "refactor: responder feedback del PR"

# Push
git push origin feature/description

# Los cambios se agregan automáticamente al PR
```

---

## 9. Problemas Comunes

### "Mi código rompe la arquitectura"
**Solución:** Pregunta en una issue primero, ¡no es obvio!

### "ESLint me da error"
```bash
# Revisar errores
npm run lint

# Algunos se arreglan automáticamente
npm run lint -- --fix
```

### "TypeScript dice type error"
```bash
# Revisar errores
npm run type-check

# Asegurar tipos correctos
const value: string = "text"; // ✅
const value = "text"; // ✅ Inferencia
const value: any = "text"; // ❌ Evitar
```

---

## 10. Áreas donde Necesitamos Ayuda

- 🐛 **Bugs:** Reportar y fijar
- ✨ **Features:** Nuevos casos de uso
- 📚 **Docs:** Mejorar documentación
- 🧪 **Tests:** Escribir tests
- 🔒 **Security:** Revisar vulnerabilidades
- ⚡ **Performance:** Optimizaciones

---

## 11. Código de Conducta

- 🤝 Respetuoso y constructivo
- 🎯 Enfocado en mejorar el proyecto
- 📢 Comunicación clara
- ✅ Ayudar a otros contribuidores

---

## 12. Preguntas Frecuentes

**P: ¿Debo crear issue antes de PR?**
R: Para features sí. Para bugfixes pequeños, puedes ir directo al PR.

**P: ¿Qué si mi PR es rechazado?**
R: Es feedback, no rechazo personal. Aprende y mejora.

**P: ¿Cuánto tiempo espero para feedback?**
R: Intentamos responder en 48 horas.

**P: ¿Puedo hacer breaking changes?**
R: Solo en acuerdo con mantenedores. Preferimost backwards compatibility.

---

## 13. Recursos Útiles

- 📖 [Conventional Commits](https://www.conventionalcommits.org/)
- 🏗️ [ARCHITECTURE.md](ARCHITECTURE.md)
- ✨ [Clean Code Principles](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882)
- 🔒 [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)

---

**¡Gracias por contribuir a SegurITech Bot Pro! 🚀**
