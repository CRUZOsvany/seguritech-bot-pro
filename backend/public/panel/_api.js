// ============================================================
// SegurITech Bot Pro — Panel Admin · cliente HTTP
//
// Auth: sesión por cookie HTTPOnly (Operación Búnker v2).
//   - /api/auth/login emite la cookie tras password+totp (opcional).
//   - Todo request a /api/admin va con credentials:'same-origin' y la cookie.
//   - Si el backend responde 401, redirigimos a /panel/login.html.
//
// En prod, Cloudflare Access encadena con el JWT propio (no lo reemplaza).
// El bypass loopback de dev fue REMOVIDO en Sprint F.
// ============================================================

const API_BASE = '/api/admin';
const AUTH_BASE = '/api/auth';

async function _fetch(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error(`Red caída: ${err.message}`);
  }

  // 401 fuera del propio /auth: la sesión expiró o no existe.
  if (res.status === 401 && !url.startsWith(AUTH_BASE)) {
    const here = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/panel/login.html?next=${here}`;
    // Devolvemos una promesa que nunca resuelve para evitar render parcial.
    return new Promise(() => {});
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sin body o no-JSON */
  }

  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const api = (method, path, body) => _fetch(method, API_BASE + path, body);
const enc = (s) => encodeURIComponent(String(s));

const Api = {
  // Tenants
  listTenants:      () => api('GET', '/tenants'),
  getTenantSummary: (id) => api('GET', `/tenants/${enc(id)}`),
  getTenantDetail:  (id) => api('GET', `/tenants/${enc(id)}/detail`),
  createTenant:     (body) => api('POST', '/tenants', body),
  updateTenant:     (id, body) => api('PATCH', `/tenants/${enc(id)}`, body),
  deleteTenant:     (id) => api('DELETE', `/tenants/${enc(id)}`),
  setStatus:        (id, status) => api('PATCH', `/tenants/${enc(id)}/status`, { status }),
  // Molde
  listTemplates:    () => api('GET', '/templates'),
  assignMolde:      (id, templateSlug) => api('POST', `/tenants/${enc(id)}/molde`, { templateSlug }),
  removeMolde:      (id) => api('DELETE', `/tenants/${enc(id)}/molde`),
  // Meta credentials
  upsertMetaCreds:  (id, body) => api('POST', `/tenants/${enc(id)}/meta-credentials`, body),
  revokeMetaCreds:  (id) => api('DELETE', `/tenants/${enc(id)}/meta-credentials`),
  // Messages
  tailMessages:     (id, limit = 50) => api('GET', `/tenants/${enc(id)}/messages?limit=${Number(limit) || 50}`),
  // Simulate
  simulate:         (body) => api('POST', '/simulate', body),
  simulateReset:    (body) => api('POST', '/simulate/reset', body),
};

const Auth = {
  login:          (body) => _fetch('POST', `${AUTH_BASE}/login`, body),
  logout:         () => _fetch('POST', `${AUTH_BASE}/logout`),
  me:             () => _fetch('GET', `${AUTH_BASE}/me`),
  changePassword: (body) => _fetch('POST', `${AUTH_BASE}/change-password`, body),
};

// ============================================================
// Helpers UI
// ============================================================

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 3000);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function statusBadge(status) {
  const cls = {
    draft:        'badge-unconfigured',
    sandbox:      'badge-paused',
    live:         'badge-active',
    active:       'badge-active',          // legacy (pre-006)
    paused:       'badge-paused',
    archived:     'badge-deleted',
    unconfigured: 'badge-unconfigured',    // legacy
    deleted:      'badge-deleted',
  }[status] || 'badge-unconfigured';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Header reutilizable con info de usuario + logout
function renderHeader() {
  const hdr = document.createElement('header');
  hdr.className = 'app-header';
  hdr.innerHTML = `
    <h1>SegurITech Bot Pro · Panel</h1>
    <nav>
      <a href="/panel/index.html">Clientes</a>
      <a href="/panel/new.html">+ Nuevo</a>
      <span class="nav-spacer"></span>
      <span class="nav-user" id="nav-user"></span>
      <button class="nav-logout" id="nav-logout" type="button">Salir</button>
    </nav>
  `;
  document.body.prepend(hdr);

  // Mostrar usuario actual
  Auth.me()
    .then((me) => {
      const el = $('#nav-user');
      if (el && me && me.email) {
        el.textContent = `${me.email} (${me.role})`;
      }
    })
    .catch(() => {
      // _fetch ya redirige a login en 401
    });

  // Logout
  const btn = $('#nav-logout');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await Auth.logout();
      } catch (_) {
        // Igual seguimos al login (la cookie ya quedó cleared)
      }
      window.location.href = '/panel/login.html';
    });
  }
}
