import { BANK_VERSION, DOMAINS } from '../data/meta.js';

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const copy = (value) => JSON.parse(JSON.stringify(value));
export const emptyResponse = (question) => question.type === 'match' ? {} : [];

export function isValidResponse(question, response, complete = false) {
  if (!question) return false;
  if (question.type === 'match') {
    if (!isRecord(response)) return false;
    const left = question.left.map((item) => item.id);
    const right = question.right.map((item) => item.id);
    const entries = Object.entries(response);
    if (entries.some(([a, b]) => !left.includes(a) || !right.includes(b))) return false;
    if (new Set(Object.values(response)).size !== entries.length) return false;
    return !complete || entries.length === left.length;
  }
  if (!Array.isArray(response) || new Set(response).size !== response.length) return false;
  if (response.some((id) => !question.options.some((item) => item.id === id))) return false;
  if (question.type === 'single' && response.length > 1) return false;
  return !complete || response.length > 0;
}

export function evaluate(question, response) {
  if (!isValidResponse(question, response, true)) return false;
  if (question.type === 'match') {
    return question.left.every(({ id }) => response[id] === question.pairs[id]);
  }
  return response.length === question.correct.length && question.correct.every((id) => response.includes(id));
}

export function connectPair(question, response, leftId, rightId) {
  if (question.type !== 'match' || !isValidResponse(question, response)) return response;
  if (!question.left.some((x) => x.id === leftId) || !question.right.some((x) => x.id === rightId)) return response;
  const next = { ...response };
  if (next[leftId] === rightId) {
    delete next[leftId];
    return next;
  }
  for (const key of Object.keys(next)) if (next[key] === rightId) delete next[key];
  next[leftId] = rightId;
  return next;
}

export const sessionKey = (level, mode = 'exam') => `${mode}:${level}`;

export function makeAttempt(level, questions, mode = 'exam', ids = null, now = new Date().toISOString()) {
  if (![1, 2, 3].includes(Number(level)) || !['exam', 'mistakes'].includes(mode)) throw new Error('Неизвестный режим теста.');
  const all = questions.filter((q) => q.level === Number(level));
  const questionIds = mode === 'exam' ? all.map((q) => q.id) : all.filter((q) => ids?.includes(q.id)).map((q) => q.id);
  if (!questionIds.length) throw new Error('В этой подборке нет вопросов.');
  return {
    id: globalThis.crypto?.randomUUID?.() || `attempt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    bankVersion: BANK_VERSION, level: Number(level), mode, questionIds,
    startedAt: now, updatedAt: now, completedAt: null, cursor: 0,
    answers: {}, drafts: {}, bookmarks: [],
  };
}

export function setDraft(attempt, question, response) {
  if (attempt.completedAt || attempt.answers[question.id] || !attempt.questionIds.includes(question.id)) return attempt;
  if (!isValidResponse(question, response)) return attempt;
  return { ...attempt, drafts: { ...attempt.drafts, [question.id]: copy(response) }, updatedAt: new Date().toISOString() };
}

export function submitAnswer(attempt, question, response, now = new Date().toISOString()) {
  if (attempt.completedAt || attempt.answers[question.id]) return attempt;
  if (!attempt.questionIds.includes(question.id) || !isValidResponse(question, response, true)) return attempt;
  const drafts = { ...attempt.drafts };
  delete drafts[question.id];
  return {
    ...attempt, updatedAt: now, drafts,
    answers: { ...attempt.answers, [question.id]: { response: copy(response), correct: evaluate(question, response), submittedAt: now } },
  };
}

export function moveCursor(attempt, cursor) {
  if (attempt.completedAt || !Number.isInteger(cursor)) return attempt;
  return { ...attempt, cursor: Math.max(0, Math.min(attempt.questionIds.length - 1, cursor)), updatedAt: new Date().toISOString() };
}

export function toggleBookmark(attempt, questionId) {
  if (attempt.completedAt || !attempt.questionIds.includes(questionId)) return attempt;
  const selected = attempt.bookmarks.includes(questionId);
  return { ...attempt, bookmarks: selected ? attempt.bookmarks.filter((id) => id !== questionId) : [...attempt.bookmarks, questionId] };
}

export function finishAttempt(attempt, now = new Date().toISOString()) {
  if (attempt.completedAt) return attempt;
  return { ...attempt, completedAt: now, updatedAt: now, drafts: {} };
}

export function scoreAttempt(attempt, questions) {
  const bank = new Map(questions.map((q) => [q.id, q]));
  const byDomain = DOMAINS.map((domain) => ({ domain: domain.id, total: 0, answered: 0, correct: 0, weight: domain.weight }));
  let answered = 0;
  let correct = 0;
  for (const id of attempt.questionIds) {
    const q = bank.get(id);
    if (!q) continue;
    const row = byDomain[q.domain - 1];
    row.total++;
    const answer = attempt.answers[id];
    if (answer) { answered++; row.answered++; }
    if (answer && evaluate(q, answer.response)) { correct++; row.correct++; }
  }
  const total = attempt.questionIds.length;
  const percent = total ? Math.round(correct / total * 1000) / 10 : 0;
  const weighted = attempt.mode === 'exam' && byDomain.every((row) => row.total > 0)
    ? Math.round(byDomain.reduce((sum, row) => sum + row.correct / row.total * row.weight, 0) * 10) / 10 : null;
  return { correct, total, answered, wrong: answered - correct, unanswered: total - answered, incorrect: total - correct, percent, weighted, byDomain };
}

export function errorIds(attempt, questions) {
  const bank = new Map(questions.map((q) => [q.id, q]));
  return attempt.questionIds.filter((id) => !evaluate(bank.get(id), attempt.answers[id]?.response));
}

export function levelStats(state, level, questions) {
  const exams = state.history.filter((a) => a.level === level && a.mode === 'exam').sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const latest = exams.at(-1) || null;
  const best = exams.length ? Math.max(...exams.map((a) => scoreAttempt(a, questions).percent)) : null;
  const previous = exams.length > 1 ? scoreAttempt(exams.at(-2), questions).percent : null;
  return { exams, latest, best, previous, latestScore: latest ? scoreAttempt(latest, questions) : null };
}
