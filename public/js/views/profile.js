import { esc, toast } from '../utils.js';
import { post } from '../api.js';
import { currentUser, refreshAuth } from '../auth.js';

const ROLE_LABEL = { owner: 'Administrador', admin: 'Administrador', profesor: 'Profesor', monitor: 'Monitor' };

export async function render(main) {
  const u = currentUser() || {};
  main.innerHTML = `
    <h1>Mi perfil</h1>
    <p class="subtitle">Datos de la sesión actual y cambio de contraseña.</p>
    <div class="card profile-card">
      <div class="profile-id">
        <span class="user-avatar large">${esc((u.name || u.email || 'U').slice(0, 1).toUpperCase())}</span>
        <div><div class="profile-name">${esc(u.name || u.email || '—')}</div>
          <div class="muted">${esc(u.email || '')}</div>
          <span class="badge">${esc(ROLE_LABEL[u.role] || u.role || '')}</span></div>
      </div>
      <form id="password-form" class="stack">
        <h2>Cambiar contraseña</h2>
        <div class="row">
          <div class="field"><label>Contraseña actual</label><input name="current_password" type="password" autocomplete="current-password" required></div>
          <div class="field"><label>Nueva contraseña (mínimo 8 caracteres)</label><input name="new_password" type="password" autocomplete="new-password" minlength="8" required></div>
        </div>
        <p class="notice">Al cambiar la contraseña se cierran todas las sesiones abiertas de esta cuenta.</p>
        <div><button type="submit" class="btn primary">Actualizar contraseña</button></div>
      </form>
    </div>`;

  main.querySelector('#password-form').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await post('auth/password', {
        current_password: String(fd.get('current_password') || ''),
        new_password: String(fd.get('new_password') || '')
      });
      await refreshAuth();
      e.target.reset();
      toast('Contraseña actualizada');
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; }
  };
}
