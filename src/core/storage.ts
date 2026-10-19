import { APP_NAME, BANK_VERSION } from '../data/meta.ts';
import { copy, evaluate, isValidResponse, QUESTION_SECONDS, sessionKey } from './exam.ts';
import type {
  AnswerRecord,
  AppState,
  Attempt,
  AttemptMode,
  LevelId,
  Question,
  Response,
  StorageLike,
  StorageReadResult,
  StorageWriteResult,
  Timing,
} from '../types.ts';

export const SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const record = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const stringArray = (x: unknown): x is string[] => Array.isArray(x) && x.every((item) => typeof item === 'string');
const validDate = (x: unknown): x is string =>
  typeof x === 'string' && x.length <= 40 && Number.isFinite(Date.parse(x));
// Стабильный внутренний ключ: переименование не должно скрывать сохранённый прогресс.
export const storageKey = (pathname = '/') =>
  `ai-practicum:v1:${pathname.replace(/index\.html$/, '').replace(/\/+$/, '') || '/'}`;
export const freshState = (): AppState => ({
  schemaVersion: SCHEMA_VERSION,
  bankVersion: BANK_VERSION,
  revision: 0,
  sessions: {},
  history: [],
});

export function validateState(value: unknown, questions: Question[]): AppState {
  if (!record(value) || value.schemaVersion !== SCHEMA_VERSION || value.bankVersion !== BANK_VERSION)
    throw new Error('Формат сохранения или версия вопросов не совпадает.');
  const sessionsValue = value.sessions;
  const historyValue = value.history;
  const revisionValue = value.revision;
  if (
    !record(sessionsValue) ||
    !Array.isArray(historyValue) ||
    typeof revisionValue !== 'number' ||
    !Number.isSafeInteger(revisionValue) ||
    revisionValue < 0
  )
    throw new Error('Структура сохранения повреждена.');
  const bank = new Map(questions.map((q) => [q.id, q]));
  const usedIds = new Set<string>();
  const validateAttempt = (input: unknown, completed: boolean): Attempt => {
    if (!record(input)) throw new Error('Некорректный идентификатор попытки.');
    const id = input.id;
    const bankVersion = input.bankVersion;
    const levelValue = input.level;
    const modeValue = input.mode;
    const questionIds = input.questionIds;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || usedIds.has(id))
      throw new Error('Некорректный идентификатор попытки.');
    usedIds.add(id);
    if (
      (levelValue !== 1 && levelValue !== 2 && levelValue !== 3) ||
      (modeValue !== 'exam' && modeValue !== 'mistakes') ||
      bankVersion !== BANK_VERSION
    )
      throw new Error('Некорректный уровень или версия попытки.');
    if (
      !stringArray(questionIds) ||
      !questionIds.length ||
      questionIds.length > 60 ||
      new Set(questionIds).size !== questionIds.length ||
      questionIds.some((questionId) => bank.get(questionId)?.level !== levelValue)
    )
      throw new Error('Некорректный состав теста.');
    const fullIds = questions.filter((q) => q.level === levelValue).map((q) => q.id);
    if (
      modeValue === 'exam' &&
      (questionIds.length !== fullIds.length || questionIds.some((questionId, i) => fullIds[i] !== questionId))
    )
      throw new Error('Полный экзамен должен содержать все вопросы уровня в исходном порядке.');
    const startedAt = input.startedAt;
    const updatedAt = input.updatedAt;
    const completedAt = input.completedAt;
    if (!validDate(startedAt) || !validDate(updatedAt)) throw new Error('Некорректное состояние завершения.');
    if (completed ? !validDate(completedAt) : completedAt !== null)
      throw new Error('Некорректное состояние завершения.');
    const startedDate = startedAt;
    const updatedDate = updatedAt;
    const completedDate = completedAt;
    const cursor = input.cursor;
    const answersValue = input.answers;
    const draftsValue = input.drafts;
    const bookmarks = input.bookmarks;
    if (typeof cursor !== 'number' || !Number.isInteger(cursor) || cursor < 0 || cursor >= questionIds.length)
      throw new Error('Некорректное состояние ответа.');
    if (!record(answersValue) || !record(draftsValue) || !stringArray(bookmarks))
      throw new Error('Некорректное состояние ответа.');
    if (new Set(bookmarks).size !== bookmarks.length || bookmarks.some((bookmark) => !questionIds.includes(bookmark)))
      throw new Error('Некорректные закладки.');
    const rawTiming = input.timing;
    let timing: Timing | undefined;
    if (rawTiming !== undefined) {
      if (!record(rawTiming)) throw new Error('Некорректное состояние таймера.');
      const secondsPerQuestion = rawTiming.secondsPerQuestion;
      const deadlinesValue = rawTiming.deadlines;
      if (secondsPerQuestion !== QUESTION_SECONDS || !record(deadlinesValue))
        throw new Error('Некорректное состояние таймера.');
      if (
        !Object.keys(deadlinesValue).length ||
        Object.entries(deadlinesValue).some(
          ([deadlineId, deadline]) =>
            !questionIds.includes(deadlineId) ||
            !validDate(deadline) ||
            Date.parse(deadline) < Date.parse(startedDate) + QUESTION_SECONDS * 1000 ||
            Date.parse(deadline) > Date.parse(updatedDate) + QUESTION_SECONDS * 1000,
        ) ||
        (!completed && !answersValue[questionIds[cursor]] && !deadlinesValue[questionIds[cursor]])
      )
        throw new Error('Некорректное состояние таймера.');
      timing = {
        secondsPerQuestion: QUESTION_SECONDS,
        deadlines: Object.fromEntries(
          Object.entries(deadlinesValue).map(([deadlineId, deadline]) => [
            deadlineId,
            new Date(deadline as string).toISOString(),
          ]),
        ),
      };
    }
    const answers: Record<string, AnswerRecord> = {};
    for (const [answerId, answer] of Object.entries(answersValue)) {
      if (!record(answer)) throw new Error('Некорректный сохранённый ответ.');
      const response = answer.response;
      const submittedAt = answer.submittedAt;
      const timedOutValue = answer.timedOut;
      const timedOut = timedOutValue === true;
      const responseObject = response !== null && typeof response === 'object' ? response : null;
      if (!validDate(submittedAt)) throw new Error('Некорректный сохранённый ответ.');
      const responseValid = timedOut
        ? isValidResponse(bank.get(answerId), response) &&
          responseObject !== null &&
          Object.keys(responseObject).length === 0
        : isValidResponse(bank.get(answerId), response, true);
      if (
        !questionIds.includes(answerId) ||
        !responseValid ||
        (timedOutValue !== undefined && !timedOut) ||
        (timedOut &&
          (!timing?.deadlines[answerId] || Date.parse(submittedAt) !== Date.parse(timing.deadlines[answerId]))) ||
        (timing &&
          (!timing.deadlines[answerId] ||
            (!timedOut && Date.parse(submittedAt) >= Date.parse(timing.deadlines[answerId]))))
      )
        throw new Error('Некорректный сохранённый ответ.');
      // Балл всегда пересчитывается из ответа, а не берётся на веру из импортированного файла.
      answers[answerId] = {
        response: copy(response) as Response,
        submittedAt: new Date(submittedAt).toISOString(),
        correct: evaluate(bank.get(answerId), response),
        ...(timedOut && { timedOut: true }),
      };
    }
    const drafts: Record<string, Response> = {};
    for (const [draftId, response] of Object.entries(draftsValue)) {
      if (
        !questionIds.includes(draftId) ||
        answersValue[draftId] ||
        !isValidResponse(bank.get(draftId), response) ||
        (timing && !timing.deadlines[draftId])
      )
        throw new Error('Некорректный черновик.');
      drafts[draftId] = copy(response) as Response;
    }
    if (completed && Object.keys(draftsValue).length)
      throw new Error('В завершённой попытке не может быть черновиков.');
    // Импорт сохраняет только поля приложения, а не произвольную нагрузку из файла.
    return {
      id,
      bankVersion: BANK_VERSION,
      level: levelValue as LevelId,
      mode: modeValue as AttemptMode,
      questionIds: [...questionIds],
      startedAt: new Date(startedDate).toISOString(),
      updatedAt: new Date(updatedDate).toISOString(),
      completedAt: completed ? new Date(completedDate as string).toISOString() : null,
      cursor,
      answers,
      drafts,
      bookmarks: [...bookmarks],
      ...(timing && { timing }),
    };
  };
  const sessions: Record<string, Attempt> = {};
  for (const [key, rawAttempt] of Object.entries(sessionsValue)) {
    const attempt = validateAttempt(rawAttempt, false);
    if (key !== sessionKey(attempt.level, attempt.mode)) throw new Error('Некорректный ключ незавершённой попытки.');
    sessions[key] = attempt;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    bankVersion: BANK_VERSION,
    revision: revisionValue,
    sessions,
    history: historyValue.map((rawAttempt) => validateAttempt(rawAttempt, true)),
  };
}

export function readState(
  storage: StorageLike | null | undefined,
  key: string,
  questions: Question[],
): StorageReadResult {
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

const tabProgressKey = (key: string): string => `${key}:tab-progress`;

export function readTabProgress(
  tabStorage: StorageLike | null | undefined,
  key: string,
  sourceRaw: string | null,
  questions: Question[],
): AppState | null {
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

export function writeTabProgress(
  tabStorage: StorageLike | null | undefined,
  key: string,
  sourceRaw: string | null,
  state: AppState | null,
): StorageWriteResult {
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

export function writeState(
  storage: StorageLike | null | undefined,
  key: string,
  state: AppState,
  expectedRevision: number | null = null,
): StorageWriteResult {
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

export function clearLevel(state: AppState, level: number): AppState {
  return {
    ...state,
    sessions: Object.fromEntries(Object.entries(state.sessions).filter(([, a]) => a.level !== level)),
    history: state.history.filter((a) => a.level !== level),
  };
}

export function completeSession(state: AppState, key: string, completedAttempt: Attempt): AppState {
  if (!completedAttempt.completedAt || state.history.some((a) => a.id === completedAttempt.id)) return state;
  const active = state.sessions[key];
  if (key !== sessionKey(completedAttempt.level, completedAttempt.mode) || !active || active.id !== completedAttempt.id)
    return state;
  const sessions = { ...state.sessions };
  delete sessions[key];
  return { ...state, sessions, history: [...state.history, completedAttempt] };
}

export const makeBackup = (state: AppState) => ({
  application: 'ai-basics-exam-trainer',
  exportedAt: new Date().toISOString(),
  state,
});

export function parseBackup(text: string, questions: Question[]): AppState {
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
