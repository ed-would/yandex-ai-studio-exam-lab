import { APP_NAME, BANK_VERSION } from '../data/meta.js';
import { copy, evaluate, isValidResponse, QUESTION_SECONDS, sessionKey } from './exam.js';

export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const validDate = (x) => typeof x === 'string' && x.length <= 40 && Number.isFinite(Date.parse(x));
// Стабильный внутренний ключ: переименование не должно скрывать сохранённый прогресс.
export const storageKey = (pathname = '/') =>
  `ai-practicum:v1:${pathname.replace(/index\.html$/, '').replace(/\/+$/, '') || '/'}`;
export const freshState = () => ({
  schemaVersion: SCHEMA_VERSION,
  bankVersion: BANK_VERSION,
  revision: 0,
  sessions: {},
  history: [],
});

export function validateState(value, questions) {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION || value.bankVersion !== BANK_VERSION)
    throw new Error('Формат сохранения или версия вопросов не совпадает.');
  if (
    !record(value.sessions) ||
    !Array.isArray(value.history) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new Error('Структура сохранения повреждена.');
  const bank = new Map(questions.map((q) => [q.id, q]));
  const usedIds = new Set();
  const validateAttempt = (input, completed) => {
    const a = input;
    if (!record(a) || typeof a.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(a.id) || usedIds.has(a.id))
      throw new Error('Некорректный идентификатор попытки.');
    usedIds.add(a.id);
    if (![1, 2, 3].includes(a.level) || !['exam', 'mistakes'].includes(a.mode) || a.bankVersion !== BANK_VERSION)
      throw new Error('Некорректный уровень или версия попытки.');
    if (
      !Array.isArray(a.questionIds) ||
      !a.questionIds.length ||
      a.questionIds.length > 60 ||
      new Set(a.questionIds).size !== a.questionIds.length ||
      a.questionIds.some((id) => bank.get(id)?.level !== a.level)
    )
      throw new Error('Некорректный состав теста.');
    const fullIds = questions.filter((q) => q.level === a.level).map((q) => q.id);
    if (
      a.mode === 'exam' &&
      (a.questionIds.length !== fullIds.length || a.questionIds.some((id, i) => fullIds[i] !== id))
    )
      throw new Error('Полный экзамен должен содержать все вопросы уровня в исходном порядке.');
    if (
      !validDate(a.startedAt) ||
      !validDate(a.updatedAt) ||
      (completed ? !validDate(a.completedAt) : a.completedAt !== null)
    )
      throw new Error('Некорректное состояние завершения.');
    if (
      !Number.isInteger(a.cursor) ||
      a.cursor < 0 ||
      a.cursor >= a.questionIds.length ||
      !record(a.answers) ||
      !record(a.drafts) ||
      !Array.isArray(a.bookmarks)
    )
      throw new Error('Некорректное состояние ответа.');
    if (new Set(a.bookmarks).size !== a.bookmarks.length || a.bookmarks.some((id) => !a.questionIds.includes(id)))
      throw new Error('Некорректные закладки.');
    let timing;
    if (a.timing !== undefined) {
      if (
        !record(a.timing) ||
        a.timing.secondsPerQuestion !== QUESTION_SECONDS ||
        !record(a.timing.deadlines) ||
        !Object.keys(a.timing.deadlines).length ||
        Object.entries(a.timing.deadlines).some(
          ([id, deadline]) =>
            !a.questionIds.includes(id) ||
            !validDate(deadline) ||
            Date.parse(deadline) < Date.parse(a.startedAt) + QUESTION_SECONDS * 1000 ||
            Date.parse(deadline) > Date.parse(a.updatedAt) + QUESTION_SECONDS * 1000,
        ) ||
        (!completed && !a.answers[a.questionIds[a.cursor]] && !a.timing.deadlines[a.questionIds[a.cursor]])
      )
        throw new Error('Некорректное состояние таймера.');
      timing = {
        secondsPerQuestion: QUESTION_SECONDS,
        deadlines: Object.fromEntries(
          Object.entries(a.timing.deadlines).map(([id, deadline]) => [id, new Date(deadline).toISOString()]),
        ),
      };
    }
    const answers = {};
    for (const [id, answer] of Object.entries(a.answers)) {
      const timedOut = answer?.timedOut === true;
      const responseValid = timedOut
        ? isValidResponse(bank.get(id), answer.response) && Object.keys(answer.response).length === 0
        : isValidResponse(bank.get(id), answer?.response, true);
      if (
        !a.questionIds.includes(id) ||
        !record(answer) ||
        !responseValid ||
        !validDate(answer.submittedAt) ||
        (answer.timedOut !== undefined && !timedOut) ||
        (timedOut && (!timing?.deadlines[id] || Date.parse(answer.submittedAt) !== Date.parse(timing.deadlines[id]))) ||
        (timing &&
          (!timing.deadlines[id] || (!timedOut && Date.parse(answer.submittedAt) >= Date.parse(timing.deadlines[id]))))
      )
        throw new Error('Некорректный сохранённый ответ.');
      // Балл всегда пересчитывается из ответа, а не берётся на веру из импортированного файла.
      answers[id] = {
        response: copy(answer.response),
        submittedAt: new Date(answer.submittedAt).toISOString(),
        correct: evaluate(bank.get(id), answer.response),
        ...(timedOut && { timedOut: true }),
      };
    }
    const drafts = {};
    for (const [id, response] of Object.entries(a.drafts)) {
      if (
        !a.questionIds.includes(id) ||
        a.answers[id] ||
        !isValidResponse(bank.get(id), response) ||
        (timing && !timing.deadlines[id])
      )
        throw new Error('Некорректный черновик.');
      drafts[id] = copy(response);
    }
    if (completed && Object.keys(a.drafts).length) throw new Error('В завершённой попытке не может быть черновиков.');
    // Импорт сохраняет только поля приложения, а не произвольную нагрузку из файла.
    return {
      id: a.id,
      bankVersion: BANK_VERSION,
      level: a.level,
      mode: a.mode,
      questionIds: [...a.questionIds],
      startedAt: new Date(a.startedAt).toISOString(),
      updatedAt: new Date(a.updatedAt).toISOString(),
      completedAt: completed ? new Date(a.completedAt).toISOString() : null,
      cursor: a.cursor,
      answers,
      drafts,
      bookmarks: [...a.bookmarks],
      ...(timing && { timing }),
    };
  };
  const sessions = {};
  for (const [key, a] of Object.entries(value.sessions)) {
    if (key !== sessionKey(a.level, a.mode)) throw new Error('Некорректный ключ незавершённой попытки.');
    sessions[key] = validateAttempt(a, false);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    bankVersion: BANK_VERSION,
    revision: value.revision,
    sessions,
    history: value.history.map((a) => validateAttempt(a, true)),
  };
}

export function readState(storage, key, questions) {
  let raw = null;
  try {
    if (!storage) throw new Error('Хранилище браузера недоступно.');
    raw = storage.getItem(key);
    const saved = raw === null ? null : JSON.parse(raw);
    if (record(saved) && typeof saved.bankVersion === 'string' && saved.bankVersion !== BANK_VERSION) {
      return {
        state: freshState(),
        warning:
          'Найдены сохранения с предыдущей версией вопросов. Они не загружены и останутся без изменений. Скачай исходные данные и выбери «Очистить все результаты» в управлении данными. До очистки новые попытки не сохраняются на устройстве.',
        protected: true,
        raw,
      };
    }
    return { state: raw === null ? freshState() : validateState(saved, questions), warning: '', protected: false, raw };
  } catch {
    return {
      state: freshState(),
      warning:
        raw !== null
          ? 'Сохранённые данные не удалось прочитать. Они сохранены без изменений. Скачай исходную копию, затем сбрось данные или импортируй совместимую копию.'
          : 'Браузер не разрешил доступ к сохранениям. Тест работает, но прогресс останется только в открытой вкладке.',
      protected: raw !== null,
      raw,
    };
  }
}

const tabProgressKey = (key) => `${key}:tab-progress`;

export function readTabProgress(tabStorage, key, sourceRaw, questions) {
  try {
    if (!tabStorage) return null;
    const raw = tabStorage.getItem(tabProgressKey(key));
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!record(payload) || payload.sourceRaw !== sourceRaw) {
      tabStorage.removeItem(tabProgressKey(key));
      return null;
    }
    return validateState(payload.state, questions);
  } catch {
    return null;
  }
}

export function writeTabProgress(tabStorage, key, sourceRaw, state) {
  try {
    if (!tabStorage) return { ok: false };
    const cacheKey = tabProgressKey(key);
    if (state === null) tabStorage.removeItem(cacheKey);
    else tabStorage.setItem(cacheKey, JSON.stringify({ sourceRaw, state }));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function writeState(storage, key, state, expectedRevision = null) {
  try {
    if (!storage) throw new Error('Хранилище недоступно');
    if (expectedRevision !== null) {
      const existing = storage.getItem(key);
      const revision = existing === null ? 0 : JSON.parse(existing).revision;
      if (revision !== expectedRevision)
        return {
          ok: false,
          conflict: true,
          warning:
            'Прогресс изменился в другой вкладке. Обнови данные перед продолжением, чтобы не перезаписать результат.',
        };
    }
    storage.setItem(key, JSON.stringify(state));
    return { ok: true, warning: '' };
  } catch {
    return {
      ok: false,
      warning:
        'Не удалось сохранить прогресс на устройстве. Возможно, хранилище заполнено или отключено. Скачай резервную копию до закрытия вкладки.',
    };
  }
}

export function clearLevel(state, level) {
  return {
    ...state,
    sessions: Object.fromEntries(Object.entries(state.sessions).filter(([, a]) => a.level !== level)),
    history: state.history.filter((a) => a.level !== level),
  };
}

export function completeSession(state, key, completedAttempt) {
  if (!completedAttempt.completedAt || state.history.some((a) => a.id === completedAttempt.id)) return state;
  const active = state.sessions[key];
  if (key !== sessionKey(completedAttempt.level, completedAttempt.mode) || !active || active.id !== completedAttempt.id)
    return state;
  const sessions = { ...state.sessions };
  delete sessions[key];
  return { ...state, sessions, history: [...state.history, completedAttempt] };
}

export const makeBackup = (state) => ({
  application: 'ai-basics-exam-trainer',
  exportedAt: new Date().toISOString(),
  state,
});

export function parseBackup(text, questions) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error('Резервная копия больше 10 МБ.');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }
  if (!['ai-basics-exam-trainer', 'ai-practicum'].includes(parsed?.application))
    throw new Error(`Это не резервная копия приложения ${APP_NAME}.`);
  // Revision относится к хранилищу устройства, а не к переносимым результатам.
  return { ...validateState(parsed.state, questions), revision: 0 };
}
