# 📋 COMANDOS LISTOS PARA COPIAR Y PEGAR

## ⚡ Estos comandos funcionan en PowerShell

Copia y pega **UNO POR UNO** (presiona Enter después de cada uno):

---

### ✅ PASO 1: Compilar el proyecto

```powershell
cd "C:\Users\micho\IdeaProjects\seguritech-bot-pro"
npm run build
```

**Espera que termine. Debe decir: `PS C:\Users\micho\IdeaProjects\seguritech-bot-pro>`**

---

### ✅ PASO 2: Crear archivo .env

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

**Ahora edita el archivo `.env` con tu número de WhatsApp.**

---

### ✅ PASO 3: Inicializar Git

```powershell
git init
```

---

### ✅ PASO 4: Configurar Git

```powershell
git config user.name "Tu Nombre Completo Aqui"
git config user.email "tu.email@ejemplo.com"
```

**Reemplaza con tu nombre y email reales.**

---

### ✅ PASO 5: Agregar archivos

```powershell
git add .
```

---

### ✅ PASO 6: Hacer commit

```powershell
git commit -m "feat: SegurITech Bot Pro - Baileys + TypeScript + Arquitectura Hexagonal"
```

---

### ✅ PASO 7: Crear repositorio en GitHub

**Abre en tu navegador:** https://github.com/new

1. Repository name: `seguritech-bot-pro`
2. Description: `Professional WhatsApp Chatbot with Baileys, TypeScript & Hexagonal Architecture`
3. Private o Public: Tu elección
4. **NO marques:** Add a README, Add .gitignore, Choose a license
5. Click: **Create repository**

---

### ✅ PASO 8: Conectar con GitHub

```powershell
git remote add origin https://github.com/TU_USUARIO/seguritech-bot-pro.git
```

**Reemplaza `TU_USUARIO` con tu usuario de GitHub.**

---

### ✅ PASO 9: Cambiar rama a main

```powershell
git branch -M main
```

---

### ✅ PASO 10: Hacer push a GitHub

```powershell
git push -u origin main
```

**Esto subirá todo tu código a GitHub. Espera que termine.**

---

## ✅ LISTO

Ve a: https://github.com/TU_USUARIO/seguritech-bot-pro

Deberías ver todos tus archivos. ¡Éxito! 🎉

---

## 🆘 SI ALGO FALLA

### Error: "fatal: not a git repository"
```powershell
git init
```

### Error: "! [rejected] main -> main"
Borra el repositorio en GitHub e intenta de nuevo.

### Error: npm ERR! code ERESOLVE
```powershell
npm install --legacy-peer-deps
```

### El QR no aparece
1. Elimina la carpeta `.bot_auth/`
2. Edita `.env` con tu número real
3. Ejecuta: `npm run dev`

---

**¡Hecho! Tu proyecto está en GitHub 🚀**

