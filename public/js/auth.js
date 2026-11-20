import { api, post } from './api.js';
import { qs, esc } from './utils.js';
import { invalidate } from './store.js';

let user = null;
let remembered = '';
let onSuccess = null;
let currentId = null;

export const currentUser = () => user;
export const isAdmin = () => ['owner', 'admin'].includes(user?.role);
export const rememberedUser = () => remembered;

export async function refreshAuth() {
  try {
    const me = await api('auth/me');
    user = me.authenticated ? me.user : null;
    remembered = me.remembered_username || '';
  } catch (_) {
    user = null;
    remembered = '';
  }
  const nextId = user?.id ?? null;
  if (nextId !== currentId) {
    invalidate('students', 'levels', 'program');
    currentId = nextId;
  }
  return user;
}

export function showAuthScreen(mode = 'login', token = '', callback = null) {
  if (callback) onSuccess = callback;
  const app = qs('.app');
  const screen = qs('#auth-screen');
  app.hidden = true;
  screen.hidden = false;
  screen.innerHTML = shell(mode === 'login' ? loginView() : mode === 'forgot' ? forgotView() : resetView(token));
  bind(mode, token);
  const first = qs('input', screen);
  if (first && mode !== 'reset') first.focus();
}

export function hideAuthScreen() {
  qs('.app').hidden = false;
  qs('#auth-screen').hidden = true;
  qs('#auth-screen').innerHTML = '';
}

function shell(body) {
  return `
    <div class="auth-card">
      <div class="auth-brand"><span class="brand-mark">P</span><span>Piano <b>Manager</b></span></div>
      ${body}
    </div>`;
}

function loginView() {
  return `
    <h1>Iniciar sesión</h1>
    <p class="subtitle">Acceso privado a tu estudio de piano.</p>
    <form id="login-form" class="auth-form" autocomplete="on">
      <div class="field">
        <label for="login-user">Usuario o correo electrónico</label>
        <input id="login-user" name="username" type="email" inputmode="email" autocomplete="username"
               maxlength="254" value="${esc(remembered)}" required>
      </div>
      <div class="field">
        <label for="login-pass">Contraseña</label>
        <div class="password-field">
          <input id="login-pass" name="password" type="password" autocomplete="current-password" maxlength="200" required>
          <button type="button" class="icon-btn" id="toggle-pass" aria-label="Mostrar contraseña" title="Mostrar u ocultar contraseña">◉</button>
        </div>
      </div>
      <label class="check-line"><input type="checkbox" name="remember_user" ${remembered ? 'checked' : ''}> Recordar mi usuario</label>
      <label class="check-line"><input type="checkbox" name="keep_signed_in"> Mantener mi sesión iniciada</label>
      <p class="form-error" id="login-error" role="alert" hidden></p>
      <button type="submit" class="btn primary auth-submit">Iniciar sesión</button>
    </form>
    <button type="button" class="link-btn" id="show-forgot">¿Olvidaste tu contraseña?</button>
    <p class="auth-foot">Solo el administrador puede crear usuarios.</p>`;
}

function forgotView() {
  return `
    <h1>Recuperar contraseña</h1>
    <p class="subtitle">Te enviaremos un enlace de un solo uso si el correo está registrado.</p>
    <form id="forgot-form" class="auth-form">
      <div class="field">
        <label for="forgot-email">Correo electrónico</label>
        <input id="forgot-email" name="email" type="email" autocomplete="email" maxlength="254" value="${esc(remembered)}" required>
      </div>
      <p class="form-error" id="forgot-error" role="alert" hidden></p>
      <p class="notice" id="forgot-ok" hidden>Revisa tu correo. El enlace vence en 60 minutos.</p>
      <button type="submit" class="btn primary auth-submit">Enviar enlace</button>
    </form>
    <button type="button" class="link-btn" data-auth-mode="login">Volver al inicio de sesión</button>`;
}

function resetView(token) {
  return `
    <h1>Restablecer contraseña</h1>
    <p class="subtitle">Elige una contraseña nueva de al menos 8 caracteres.</p>
    <form id="reset-form" class="auth-form">
      <div class="field">
        <label for="reset-pass">Nueva contraseña</label>
        <div class="password-field">
          <input id="reset-pass" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" required>
          <button type="button" class="icon-btn" id="toggle-pass" aria-label="Mostrar contraseña">◉</button>
        </div>
      </div>
      <p class="form-error" id="reset-error" role="alert" hidden></p>
      <button type="submit" class="btn primary auth-submit">Guardar contraseña</button>
    </form>
    <button type="button" class="link-btn" data-auth-mode="login">Volver al inicio de sesión</button>`;
}

function error(id, message) {
  const el = qs('#' + id);
  if (!el) return;
  el.textContent = message || '';
  el.hidden = !message;
}

function bind(mode, token) {
  const toggle = qs('#toggle-pass');
  if (toggle) toggle.onclick = () => {
    const input = qs('#login-pass') || qs('#reset-pass');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    toggle.textContent = show ? '◌' : '◉';
    toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    input.focus();
  };

  qsaAuth('[data-auth-mode]').forEach(b => b.onclick = () => {
    const next = b.dataset.authMode;
    if (next === 'login') location.hash = '#dashboard';
    showAuthScreen(next, '', onSuccess);
  });
  const forgot = qs('#show-forgot');
  if (forgot) forgot.onclick = () => showAuthScreen('forgot', '', onSuccess);

  const login = qs('#login-form');
  if (login) login.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(login);
    error('login-error', '');
    const btn = qs('.auth-submit', login);
    btn.disabled = true;
    try {
      await post('auth/login', {
        username: String(fd.get('username') || '').trim(),
        password: String(fd.get('password') || ''),
        remember_user: fd.has('remember_user'),
        keep_signed_in: fd.has('keep_signed_in')
      });
      await refreshAuth();
      hideAuthScreen();
      await onSuccess?.();
    } catch (err) {
      error('login-error', err.message);
      qs('#login-pass')?.focus();
    } finally { btn.disabled = false; }
  };

  const forgotForm = qs('#forgot-form');
  if (forgotForm) forgotForm.onsubmit = async e => {
    e.preventDefault();
    error('forgot-error', '');
    qs('#forgot-ok').hidden = true;
    const btn = qs('.auth-submit', forgotForm);
    btn.disabled = true;
    try {
      await post('auth/forgot', { email: String(new FormData(forgotForm).get('email') || '').trim() });
      qs('#forgot-ok').hidden = false;
    } catch (err) { error('forgot-error', err.message); }
    finally { btn.disabled = false; }
  };

  const resetForm = qs('#reset-form');
  if (resetForm) resetForm.onsubmit = async e => {
    e.preventDefault();
    error('reset-error', '');
    const btn = qs('.auth-submit', resetForm);
    btn.disabled = true;
    try {
      await post('auth/reset', {
        token,
        password: String(new FormData(resetForm).get('password') || '')
      });
      location.hash = '#dashboard';
      showAuthScreen('login', '', onSuccess);
    } catch (err) { error('reset-error', err.message); }
    finally { btn.disabled = false; }
  };
}

function qsaAuth(selector) {
  return Array.from(qs('#auth-screen').querySelectorAll(selector));
}

export async function logout() {
  try { await post('auth/logout', {}); } catch (_) { /* se cierra igual */ }
  user = null;
  currentId = null;
  invalidate('students', 'levels', 'program');
  hideAuthScreen();
  showAuthScreen('login', '', onSuccess);
}
