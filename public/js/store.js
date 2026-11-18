import { get } from './api.js';

const cache = { students: null, levels: null, program: null };

export async function students(force = false) {
  if (!cache.students || force) cache.students = await get('students');
  return cache.students;
}
export async function levels(force = false) {
  if (!cache.levels || force) cache.levels = await get('levels');
  return cache.levels;
}
export async function program(force = false) {
  if (!cache.program || force) cache.program = await get('program');
  return cache.program;
}
export function invalidate(...keys) {
  keys.forEach(k => { cache[k] = null; });
}
