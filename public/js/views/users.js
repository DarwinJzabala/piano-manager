import { esc, showModal, closeModal, toast, v } from '../utils.js';
import { get, post, put } from '../api.js';
import { currentUser } from '../auth.js';

const ROLES = ['owner', 'admin', 'profesor', 'monitor'];
const ROLE_LABEL = { owner: 'Administrador', admin: 'Administrador', profesor: 'Profesor', monitor: 'Monitor' };

function dialog(user) {
  return `
    <div class="row">
      <div class="field"><label>Correo electrónico</label><input name="email" type="email" maxlength="254" value="${esc(user?.email || '')}" ${user ? 'disabled' : ''} required></div>
      <div class="field"><label>Nombre</label><input name="name" maxlength="120" value="${esc(user?.name || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Rol</label><select name="role">
        ${ROLES.map(r => `<option value="${r}"${(user?.role || 'profesor') === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
      </select></div>
      <div class="field"><label>Contraseña ${user ? '(dejar vacío para conservar)' : '(mínimo 8 caracteres)'}</label>
        <input name="password" type="password" minlength="8" maxlength="200" ${user ? '' : 'required'}></div>
    </div>
    ${user ? `<label class="check-line"><input type="checkbox" name="active" ${user.active ? 'checked' : ''}> Usuario activo</label>` : ''}`;
}

export async function render(main) {
  const me = currentUser();
  if (!['owner', 'admin'].includes(me?.role)) {
    main.innerHTML = `<h1>Usuarios</h1><div class="empty">No tienes permiso para administrar usuarios.</div>`;
    return;
  }
  const users = await get('auth/users');
  main.innerHTML = `
    <h1>Usuarios</h1>
    <p class="subtitle">Solo el administrador puede crear cuentas. No hay registro público.</p>
    <div class="section-head">
      <h2>Cuentas (${users.length})</h2>
      <button class="btn primary" id="add-user">+ Nuevo usuario</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
      <tbody>${users.map(u => `
        <tr>
          <td data-label="Usuario">${esc(u.name || '—')}</td>
          <td data-label="Correo">${esc(u.email)}</td>
          <td data-label="Rol"><span class="badge">${esc(ROLE_LABEL[u.role] || u.role)}</span></td>
          <td data-label="Estado"><span class="badge ${u.active ? 'impartida' : 'cancelada'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
          <td data-label="Creado">${esc(String(u.created_at || '').slice(0, 10))}</td>
          <td class="table-actions"><button class="btn sm" data-edit="${u.id}">Editar</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty">No hay usuarios</td></tr>'}</tbody>
    </table></div>`;

  qsAdd(main, '#add-user').onclick = () => {
    showModal('Nuevo usuario', dialog(null), async fd => {
      await post('auth/users', {
        email: v(fd, 'email'), name: v(fd, 'name'), role: v(fd, 'role'), password: v(fd, 'password')
      });
      closeModal();
      toast('Usuario creado');
      await render(main);
    }, { submitText: 'Crear usuario' });
  };

  main.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => {
    const u = users.find(x => x.id === Number(btn.dataset.edit));
    showModal('Editar usuario', dialog(u), async fd => {
      await put(`auth/users/${u.id}`, {
        role: v(fd, 'role'), password: v(fd, 'password'), active: fd.has('active') ? 1 : 0
      });
      closeModal();
      toast('Usuario actualizado');
      await render(main);
    });
  });
}

function qsAdd(root, sel) { return root.querySelector(sel); }
