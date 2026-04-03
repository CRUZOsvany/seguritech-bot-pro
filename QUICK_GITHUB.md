# 🎯 GUÍA RÁPIDA PARA GITHUB - 5 MINUTOS

## ⚡ VERSIÓN EXPRESS

Copia y pega estos comandos en PowerShell **línea por línea**:

```powershell
# 1. Asegúrate de estar en el proyecto
cd "C:\Users\micho\IdeaProjects\seguritech-bot-pro"

# 2. Verificar que todo está ok
npm run build

# 3. Si .env no existe, créalo
if (!(Test-Path .env)) { Copy-Item .env.example .env }

# 4. Inicializar Git (solo si no lo has hecho)
git init
git config user.name "Tu Nombre Aqui"
git config user.email "tu.email@example.com"

# 5. Agregar archivos
git add .

# 6. Crear commit
git commit -m "feat: SegurITech Bot Pro - Baileys + TypeScript + Arquitectura Hexagonal"

# 7. (IMPORTANTE) Ve a https://github.com/new y crea un repo VACÍO llamado "seguritech-bot-pro"
# NO marques: Add a README, Add .gitignore, Choose a license

# 8. Conectar con GitHub (reemplaza TU_USUARIO)
git remote add origin https://github.com/TU_USUARIO/seguritech-bot-pro.git
git branch -M main
git push -u origin main
```

---

## ✅ AL TERMINAR

Deberías ver en https://github.com/TU_USUARIO/seguritech-bot-pro:

```
seguritech-bot-pro/
├── src/                  ✅ Visible
├── package.json         ✅ Visible
├── tsconfig.json        ✅ Visible
├── .env                 ❌ NO visible (está en .gitignore)
├── node_modules/        ❌ NO visible (está en .gitignore)
├── dist/                ❌ NO visible (está en .gitignore)
└── .bot_auth/           ❌ NO visible (está en .gitignore)
```

---

## 🚀 ¡LISTO!

Tu proyecto está en GitHub. Para otros:

```powershell
git clone https://github.com/TU_USUARIO/seguritech-bot-pro.git
cd seguritech-bot-pro
npm install
Copy-Item .env.example .env
# Editar .env con número de WhatsApp
npm run dev
```

---

## 🆘 ERRORES COMUNES

| Error | Solución |
|-------|----------|
| `fatal: not a git repository` | `git init` |
| `! [rejected] main -> main` | Borra el repo en GitHub e intenta de nuevo |
| `npm ERR! code ERESOLVE` | `npm install --legacy-peer-deps` |
| El QR no aparece | Elimina `.bot_auth/`, edita `.env`, intenta de nuevo |

---

**¡Hecho en 5 minutos! 🎉**

