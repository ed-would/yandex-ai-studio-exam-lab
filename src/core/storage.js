import { BANK_VERSION } from '../data/meta.js';
import { copy, evaluate, isValidResponse, sessionKey } from './exam.js';

export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const validDate = (x) => typeof x === 'string' && x.length <= 40 && Number.isFinite(Date.parse(x));
export const storageKey = (pathname = '/') => `ai-practicum:v1:${pathname.replace(/index\.html$/, '').replace(/\/+$/, '') || '/'}`;
export const freshState = () => ({ schemaVersion: SCHEMA_VERSION, bankVersion: BANK_VERSION, revision: 0, sessions: {}, history: [] });

export function validateState(value, questions) {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION || value.bankVersion !== BANK_VERSION) throw new Error('Формат сохранения или версия вопросов не совпадает.');
  if (!record(value.sessions) || !Array.isArray(value.history) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('Структура сохранения повреждена.');
  const bank = new Map(questions.map((q) => [q.id, q]));
  const usedIds = new Set();
  const validateAttempt = (input, completed) => {
    const a = copy(input);
    if (!record(a) || typeof a.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(a.id) || usedIds.has(a.id)) throw new Error('Некорректный идентификатор попытки.');
    usedIds.add(a.id);
    if (![1, 2, 3].includes(a.level) || !['exam', 'mistakes'].includes(a.mode) || a.bankVersion !== BANK_VERSION) throw new Error('Некорректный уровень или версия попытки.');
    if (!Array.isArray(a.questionIds) || !a.questionIds.length || a.questionIds.length > 60 || new Set(a.questionIds).size !== a.questionIds.length || a.questionIds.some((id) => bank.get(id)?.level !== a.level)) throw new Error('Некорректный состав теста.');
    const fullIds = questions.filter((q) => q.level === a.level).map((q) => q.id);
    if (a.mode === 'exam' && (a.questionIds.length !== fullIds.length || a.questionIds.some((id, i) => fullIds[i] !== id))) throw new Error('Полный экзамен должен содержать все вопросы уровня в исходном порядке.');
    if (!validDate(a.startedAt) || !validDate(a.updatedAt) || (completed ? !validDate(a.completedAt) : a.completedAt !== null)) throw new Error('Некорректное состояние завершения.');
    if (!Number.isInteger(a.cursor) || a.cursor < 0 || a.cursor >= a.questionIds.length || !record(a.answers) || !record(a.drafts) || !Array.isArray(a.bookmarks)) throw new Error('Некорректное состояние ответа.');
    if (new Set(a.bookmarks).size !== a.bookmarks.length || a.bookmarks.some((id) => !a.questionIds.includes(id))) throw new Error('Некорректные закладки.');
    for (const [id, answer] of Object.entries(a.answers)) {
      if (!a.questionIds.includes(id) || !record(answer) || !isValidResponse(bank.get(id), answer.response, true) || !validDate(answer.submittedAt)) throw new Error('Некорректный сохранённый ответ.');
      // Балл всегда пересчитывается из ответа, а не берётся на веру из импортированного файла.
      answer.correct = evaluate(bank.get(id), answer.response);
    }
    for (const [id, response] of Object.entries(a.drafts)) {
      if (!a.questionIds.includes(id) || a.answers[id] || !isValidResponse(bank.get(id), response)) throw new Error('Некорректный черновик.');
    }
    if (completed && Object.keys(a.drafts).length) throw new Error('В завершённой попытке не может быть черновиков.');
    return a;
  };
  const sessions = {};
  for (const [key, a] of Object.entries(value.sessions)) {
    if (key !== sessionKey(a.level, a.mode)) throw new Error('Некорректный ключ незавершённой попытки.');
    sessions[key] = validateAttempt(a, false);
  }
  return { schemaVersion: SCHEMA_VERSION, bankVersion: BANK_VERSION, revision: value.revision, sessions, history: value.history.map((a) => validateAttempt(a, true)) };
}

export function readState(storage, key, questions) {
  let raw = null;
  try {
    if (!storage) throw new Error('Хранилище браузера недоступно.');
    raw = storage.getItem(key);
    return { state: raw ? validateState(JSON.parse(raw), questions) : freshState(), warning: '', protected: false, raw };
  } catch (error) {
    return { state: freshState(), warning: raw ? 'Сохранённые данные не удалось прочитать. Они сохранены без изменений. Скачай исходную копию, затем сбрось данные или импортируй совместимую копию.' : 'Браузер не разрешил доступ к сохранениям. Тест работает, но прогресс останется только в открытой вкладке.', protected: Boolean(raw), raw };
  }
}

export function writeState(storage, key, state, expectedRevision = null) {
  try {
    if (!storage) throw new Error('Хранилище недоступно');
    if (expectedRevision !== null) {
      const existing = storage.getItem(key);
      const revision = existing ? JSON.parse(existing).revision : 0;
      if (revision !== expectedRevision) return { ok: false, conflict: true, warning: 'Прогресс изменился в другой вкладке. Обнови данные перед продолжением, чтобы не перезаписать результат.' };
    }
    storage.setItem(key, JSON.stringify(state));
    return { ok: true, warning: '' };
  } catch {
    return { ok: false, warning: 'Не удалось сохранить прогресс на устройстве. Возможно, хранилище заполнено или отключено. Скачай резервную копию до закрытия вкладки.' };
  }
}

export function clearLevel(state, level) {
  return { ...state, sessions: Object.fromEntries(Object.entries(state.sessions).filter(([, a]) => a.level !== level)), history: state.history.filter((a) => a.level !== level) };
}

export function completeSession(state, key, completedAttempt) {
  if (!completedAttempt.completedAt || state.history.some((a) => a.id === completedAttempt.id)) return state;
  const active = state.sessions[key];
  if (key !== sessionKey(completedAttempt.level, completedAttempt.mode) || !active || active.id !== completedAttempt.id) return state;
  const sessions = { ...state.sessions };
  delete sessions[key];
  return { ...state, sessions, history: [...state.history, completedAttempt] };
}

export const makeBackup = (state) => ({ application: 'ai-practicum', exportedAt: new Date().toISOString(), state });

export function parseBackup(text, questions) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Резервная копия больше 10 МБ.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Файл не является корректным JSON.'); }
  if (parsed?.application !== 'ai-practicum') throw new Error('Это не резервная копия Практикума ИИ.');
  return validateState(parsed.state, questions);
}
