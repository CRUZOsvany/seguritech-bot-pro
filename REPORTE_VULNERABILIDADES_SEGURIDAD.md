# 🔒 REPORTE DE SEGURIDAD - Vulnerabilidades NPM

**Fecha:** 2026-04-27  
**Proyecto:** SegurITech Bot Pro  
**Status:** 14 vulnerabilidades detectadas (1 low, 4 moderate, 6 high, 3 critical)  
**Acción Recomendada:** ACTUALIZAR paquetes principales a versiones recientes

---

## ⚠️ VULNERABILIDADES CRÍTICAS (3)

### 1. **protobufjs < 7.5.5** (CRÍTICO)
- **CVE:** GHSA-xq3m-2v4x-88gg
- **Descripción:** Arbitrary code execution
- **Afectado por:** @whiskeysockets/baileys → @whiskeysockets/libsignal-node
- **Fix:** Actualizar libsignal/baileys a versión compatible
- **Severidad:** 🔴 CRÍTICO

### 2. **loader-utils <= 1.4.1 || 2.0.0-2.0.3** (CRÍTICO)
- **CVE:** GHSA-76p3-8jx3-jpfq
- **Descripción:** Prototype pollution in webpack
- **Afectado por:** next (vía webpack)
- **Fix:** Actualizar Next.js a v14+
- **Severidad:** 🔴 CRÍTICO

### 3. **typeorm <= 0.4.0-alpha.1** (CRÍTICO)
- **CVE:** GHSA-fx4w-v43j-vc45 y GHSA-q2pj-6v73-8rgj
- **Descripción:** SQL injection vulnerabilities
- **Afectado por:** next-auth → @next-auth/typeorm-legacy-adapter
- **Fix:** Migrar de typeorm legacy a Prisma (o TypeORM 1.x)
- **Severidad:** 🔴 CRÍTICO (SQL Injection)

---

## 🔴 VULNERABILIDADES ALTAS (6)

| Paquete | Issue | CVE | Fix |
|---------|-------|-----|-----|
| **minimatch** 9.0.0-6 | ReDoS (3 CVEs) | GHSA-3ppc / GHSA-7r86 / GHSA-23c5 | npm audit fix |
| **pm2** * | ReDoS | GHSA-x5gf-qvw8-r2rm | **No hay fix disponible** ⚠️ |
| **devalue** <=5.6.3 | Prototype pollution (5 CVEs) | GHSA-vj54 / etc | Actualizar en next |
| **ansi-html** <0.0.8 | Resource Exhaustion | GHSA-whgm | npm audit fix |
| **braces** <3.0.3 | ReDoS | GHSA-grv7-fg5c | npm audit fix --force |
| **http-proxy** <1.18.1 | DoS | GHSA-6x33 | npm audit fix --force |
| **json5** 2.0.0-2.2.1 | Prototype Pollution | GHSA-9c47 | npm audit fix --force |
| **jsonwebtoken** <=8.5.1 | Signature bypass (3 CVEs) | GHSA-8cf7 / GHSA-hjrf / GHSA-qwph | npm audit fix --force |
| **node-fetch** <=2.6.6 | Header leakage (2 CVEs) | GHSA-r683 / GHSA-w7rc | npm audit fix |
| **nodemailer** <=8.0.4 | Command injection (4 CVEs) | GHSA-mm7p / GHSA-rcmh / GHSA-c7w3 / GHSA-vvjj | npm audit fix --force |
| **object-path** <=0.11.7 | Prototype Pollution (3 CVEs) | GHSA-v39p / GHSA-cwx2 / GHSA-8v63 | npm audit fix --force |
| **path-to-regexp** 4.0.0-6.2.2 | ReDoS | GHSA-9wv6 | npm audit fix |
| **serialize-javascript** <=7.0.4 | RCE (2 CVEs) | GHSA-5c6j / GHSA-qj8w | npm audit fix --force |
| **tar** <=7.5.10 | Path Traversal (6 CVEs) | GHSA-34x7 / GHSA-8qq5 / GHSA-83g3 | npm audit fix |
| **terser** <4.8.1 | ReDoS | GHSA-4wf5 | npm audit fix --force |

---

## 🟠 VULNERABILIDADES MODERADAS (4)

| Paquete | Issue | CVE |
|---------|-------|-----|
| **postcss** <8.5.10 | XSS (4 CVEs) | GHSA-qx2v / GHSA-hwj9 / GHSA-566m / GHSA-7fh5 |
| **uuid** <14.0.0 | Buffer bounds check | GHSA-w5hq-g745-h8pq |
| **@babel/runtime** <7.26.10 | ReDoS in generated code | GHSA-968p-4wvh-cqc8 |
| **browserslist** 4.0.0-4.16.4 | ReDoS | GHSA-w8qv-6jwh-64r5 |
| **cookiename, path, domain** | OOB chars | GHSA-pxg6-pf52-xh8x |
| **jose** <2.0.7 | Resource exhaustion | GHSA-hhhv-q57g-882q |
| **xml2js** <0.5.0 | Prototype pollution | GHSA-776f-qx25-q3cc |

---

## 📋 PLAN DE ACCIÓN (RECOMENDADO)

### URGENCIA MÁXIMA 🔴

1. **Actualizar Next.js** (v9.3.4-canary → v16.2+)
   ```bash
   npm install next@latest
   ```
   - Resuelve: loader-utils, webpack, terser, postcss, devalue, etc.

2. **Migrar de next-auth legacy** (3.x → 5.x)
   ```bash
   npm install next-auth@latest
   npm uninstall @next-auth/typeorm-legacy-adapter
   npm install @next-auth/prisma-adapter
   ```
   - Resuelve: typeorm SQL injection, jose, nodemailer

3. **Actualizar Baileys**
   ```bash
   npm install @whiskeysockets/baileys@latest
   ```
   - Resuelve: protobufjs arbitrary code execution

### URGENCIA ALTA 🟠

4. **npm audit fix**
   ```bash
   npm audit fix --force
   ```
   - Resuelve: minimatch, braces, http-proxy, json5, object-path, etc.

5. **Reemplazar pm2** (sin fix disponible)
   - Usar: Node.js clustering o Docker con process manager
   - O esperar a pm2 actualizar con fix de seguridad

### PRECAUCIÓN ⚠️

6. **Validar compatibilidad** después de actualizar:
   ```bash
   npm run type-check  # TypeScript
   npm test           # Tests
   npm run build      # Build
   ```

---

## 🛑 BLOQUEO ACTUAL

**NO hacer `npm audit fix --force`** porque:
1. Baja Next.js a v9.3.3 (16 años atrás, INCOMPATIBLE)
2. Causa conflictos de peer dependencies
3. Rompe la aplicación

---

## ✅ ESTADO DESPUÉS DE ACTUALIZACIÓN

```
npm audit                    # Status esperado:
                             # 0 vulnerabilities
                             # 100% seguro
```

---

## 🔗 REFERENCIAS

- [npm audit report](https://docs.npmjs.com/cli/v8/commands/npm-audit)
- [Next.js v16 migration](https://nextjs.org/docs/upgrading/from-pages-to-app)
- [NextAuth v5 migration](https://authjs.dev/getting-started/upgrade-guide)
- [Baileys releases](https://github.com/WhiskeySockets/Baileys/releases)

---

## 📝 NOTAS

**Proyecto:** SegurITech Bot Pro  
**Responsabilidad:** Actualizar paquetes en próxima sprint de mantenimiento  
**Timeline:** ASAP (vulnerabilidades críticas detectadas)  
**Impacto:** BAJO - son actualizaciones de dependencias, no cambios en lógica de negocio


