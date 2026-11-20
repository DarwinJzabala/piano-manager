export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDaysLocal(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
}
export const todayLocal = () => localISO();
export function weekdayLocal(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.getDay() === 0 ? 7 : d.getDay();
}
export function fmtDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '—';
  const [y, m, d] = String(dateStr).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtMonth(year, month) {
  const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${names[Number(month) - 1] || ''} ${year}`;
}
export const MODALITIES = [
  { code: 'particular', name: 'Particular' },
  { code: 'grupal', name: 'Grupal' },
  { code: 'domicilio', name: 'A domicilio' },
  { code: 'online', name: 'Online' }
];
export function modalityLabel(code) {
  return MODALITIES.find(m => m.code === code)?.name || String(code || '');
}
export function money(value) {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency', currency: 'DOP', minimumFractionDigits: 2
  }).format(Number(value || 0));
}
export function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}
export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const wd = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (wd - 1));
  return localISO(d);
}

export function toast(message, type = 'ok') {
  const wrap = qs('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function closeModal() {
  const dlg = qs('#app-modal');
  if (dlg && dlg.open) dlg.close();
}

export function showModal(title, bodyHTML, onSubmit, options = {}) {
  const dlg = qs('#app-modal');
  qs('.modal-title', dlg).textContent = title;
  const form = qs('.modal-body', dlg);
  form.innerHTML = bodyHTML;
  const submit = qs('.modal-foot [type="submit"]', dlg);
  submit.textContent = options.submitText || 'Guardar';
  form.onsubmit = async (e) => {
    e.preventDefault();
    submit.disabled = true;
    try {
      await onSubmit(new FormData(form), dlg);
    } catch (err) {
      toast(err.message || 'No se pudo guardar', 'error');
    } finally {
      submit.disabled = false;
    }
  };
  dlg.showModal();
  const first = qs('input, select, textarea', form);
  if (first && !options.noFocus) first.focus();
  return dlg;
}

export function v(fd, name) {
  const value = fd.get(name);
  return value === null ? '' : String(value).trim();
}
export function checkedIds(fd, name = 'student_ids') {
  return fd.getAll(name).map(Number).filter(Boolean);
}
export function confirmDelete(entity = 'registro') {
  return confirm(`¿Eliminar este ${entity}? Esta acción no se puede deshacer.`);
}

export function selectOptions(items, selected, valueKey = 'id', labelKey = 'name', placeholder = '—') {
  const opts = [`<option value="">${esc(placeholder)}</option>`];
  for (const it of items || []) {
    const val = it[valueKey];
    const sel = String(val) === String(selected) ? ' selected' : '';
    opts.push(`<option value="${esc(val)}"${it.level == null ? '' : ` data-level="${esc(it.level)}"`}${sel}>${esc(it[labelKey])}</option>`);
  }
  return opts.join('');
}

export function downloadFile(name, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
