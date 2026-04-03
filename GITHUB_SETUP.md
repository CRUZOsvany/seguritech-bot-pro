# 🚀 PASOS EXACTOS PARA GITHUB

## ✅ Pasos sin errores

### **PASO 1: Instalar dependencias (ejecutar UNA sola vez)**

```powershell
npm install
```

**Output esperado:**
```
added XXX packages
```

---

### **PASO 2: Verificar que todo está ok**

```powershell
npm run type-check
```

**Output esperado:**
```
(No hay errores, solo se muestra la versión de TypeScript)
```

---

### **PASO 3: Compilar el proyecto**

```powershell
npm run build
```

**Output esperado:**
```
dist/ generado exitosamente
```

---

### **PASO 4: Crear archivo .env (IMPORTANTE)**

```powershell
# Copiar del ejemplo
Copy-Item .env.example .env

# Editar con tu editor favorito
# Cambiar solo: WHATSAPP_PHONE_NUMBER=5491234567890 (tu número)
```

**El archivo .env NUNCA se sube a GitHub (ya está en .gitignore)**

---

### **PASO 5: Probar que el bot funciona**

```powershell
npm run dev
```

**Output esperado:**
```
🚀 Iniciando SegurITech Bot...
📲 QR Code generado. Escanea con tu teléfono:
[aquí aparecerá un QR]
```

1. **Escanea el QR con tu WhatsApp**
2. En tu teléfono: Settings → Linked devices → Link a device
3. Apunta la cámara al QR en la terminal

**Una vez conectado, verás:**
```
✅ Conectado exitosamente como Tu Nombre
📱 Número: 5491234567890@s.whatsapp.net
```

---

### **PASO 6: Inicializar Git (si no está hecho)**

```powershell
# En la raíz del proyecto
git init
git config user.name "Tu Nombre"
git config user.email "tu.email@example.com"
```

---

### **PASO 7: Preparar para GitHub**

```powershell
# Ver qué archivos se van a subir (debe excluir .env y node_modules)
git status

# Agregar todos los archivos permitidos
git add .

# Crear el primer commit
git commit -m "feat: Inicializar proyecto SegurITech Bot Pro con Baileys y TypeScript"
```

**Output esperado:**
```
[main (root-commit) abc1234] feat: Inicializar proyecto...
 XX files changed, YYYY insertions(+)
```

---

### **PASO 8: Crear repositorio en GitHub**

1. Ve a https://github.com/new
2. **Repository name**: `seguritech-bot-pro`
3. **Description**: `Professional WhatsApp Chatbot with Baileys, TypeScript & Hexagonal Architecture`
4. **Private**: Selecciona según necesidad
5. **Do NOT initialize** con README, .gitignore, o LICENSE (ya los tenemos)
6. Click **Create repository**

---

### **PASO 9: Conectar tu repositorio local con GitHub**

```powershell
# Reemplaza USER con tu usuario de GitHub
git remote add origin https://github.com/USER/seguritech-bot-pro.git

# Cambiar rama a 'main' (si estás en 'master')
git branch -M main

# Push del código al repositorio
git push -u origin main
```

**Output esperado:**
```
Enumerating objects: XX, done.
Counting objects: 100% (XX/XX), done.
Delta compression using up to X threads
Compressing objects: 100% (XX/XX), done.
Writing objects: 100% (XX/XX)
remote: Create a pull request for 'main' on GitHub by visiting:
remote: https://github.com/USER/seguritech-bot-pro/pull/new/main
To https://github.com/USER/seguritech-bot-pro.git
 * [new branch]      main -> main
```

---

### **PASO 10: Verificar en GitHub**

1. Ve a https://github.com/USER/seguritech-bot-pro
2. Verifica que aparezcan tus archivos
3. **IMPORTANTE**: Confirma que NO aparezca:
   - ❌ `node_modules/`
   - ❌ `.bot_auth/`
   - ❌ `.env` (solo `.env.example`)
   - ❌ `dist/` (opcional, pero mejor si no)
   - ❌ Archivos `.idea/`

---

## 🛑 ERRORES COMUNES Y SOLUCIONES

### **Error: "fatal: not a git repository"**
```powershell
git init
```

### **Error: "warning: adding embedded git repository"**
```powershell
# Significa que hay una carpeta con .git dentro
# Elimina carpetas .git innecesarias
Get-ChildItem -Recurse -Force .git | Remove-Item -Recurse -Force
git init
```

### **Error: "fatal: unable to access... 401 Unauthorized"**
- Tu token de GitHub expiró
- Genera uno nuevo: https://github.com/settings/tokens
- O usa SSH: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

### **Error: "would clobber existing tag"**
```powershell
git tag -d v1.0.0  # Elimina tag local
```

### **npm install falla con node-sass**
```powershell
# ✅ Ya está arreglado en package.json
# node-sass fue reemplazado por sass
npm install --legacy-peer-deps  # Si persiste
```

---

## 📋 CHECKLIST FINAL

Antes de hacer push a GitHub:

- [ ] `npm install` sin errores
- [ ] `npm run build` genera `/dist`
- [ ] `npm run type-check` sin errores
- [ ] `.env` existe y NO está en Git
- [ ] `node_modules/` NO aparece en `git status`
- [ ] `.bot_auth/` NO aparece en `git status`
- [ ] Primer commit creado exitosamente
- [ ] Remote añadido: `git remote -v` muestra origin
- [ ] `git push origin main` sin errores
- [ ] En GitHub puedes ver los archivos

---

## 🎯 PRÓXIMOS PASOS DESPUÉS DE GITHUB

1. **Agregar CI/CD** (GitHub Actions)
   ```yaml
   # .github/workflows/test.yml
   ```

2. **Agregar LICENSE** (MIT recomendado)

3. **Agregar CONTRIBUTING.md** para colaboradores

4. **Agregar branchs protegidas** en settings

5. **Configurar Dependabot** para seguridad

---

## 📞 SI ALGO FALLA

1. Ejecuta: `npm run type-check`
2. Mira el error específico
3. Grep en archivo: `grep -r "error" .`
4. Revisa `/dist` y `.bot_auth` no estén comiteados

---

**¡Listo! Tu proyecto está en GitHub! 🎉**

Para clonar en otra máquina:
```powershell
git clone https://github.com/USER/seguritech-bot-pro.git
cd seguritech-bot-pro
npm install
cp .env.example .env
npm run dev
```

