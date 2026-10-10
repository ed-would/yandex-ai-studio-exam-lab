import { evaluate, finishAttempt, isValidResponse, makeAttempt, submitAnswer, toggleBookmark } from '../core/exam.js';

const FIXTURE_STARTED_AT = '2026-01-01T09:00:00.000Z';
const FIXTURE_SUBMITTED_AT = '2026-01-01T09:05:00.000Z';
const FIXTURE_COMPLETED_AT = '2026-01-01T09:30:00.000Z';
const LEVELS = [1, 2, 3];
const DOMAINS = [1, 2, 3, 4, 5, 6];
const TYPES = ['single', 'multi', 'match'];

export const RESULT_SCENARIOS = [
  { id: 'empty', label: 'Без ответов', mode: 'exam', total: 60, answered: 0, correct: 0, skipped: 60 },
  { id: 'all-wrong', label: 'Все ответы неверны', mode: 'exam', total: 60, answered: 60, correct: 0, skipped: 0 },
  { id: 'below60', label: 'Ниже 60%', mode: 'exam', total: 60, answered: 60, correct: 35, skipped: 0 },
  { id: 'close60', label: 'Ровно 60%', mode: 'exam', total: 60, answered: 60, correct: 36, skipped: 0 },
  { id: 'below80', label: 'Ниже 80%', mode: 'exam', total: 60, answered: 60, correct: 47, skipped: 0 },
  { id: 'target80', label: 'Ровно 80%', mode: 'exam', total: 60, answered: 60, correct: 48, skipped: 0 },
  { id: 'below95', label: 'Ниже 95%', mode: 'exam', total: 60, answered: 60, correct: 56, skipped: 0 },
  { id: 'excellent95', label: 'Ровно 95%', mode: 'exam', total: 60, answered: 60, correct: 57, skipped: 0 },
  { id: 'perfect', label: 'Идеальный результат', mode: 'exam', total: 60, answered: 60, correct: 60, skipped: 0 },
  {
    id: 'early',
    label: 'Завершено досрочно',
    mode: 'exam',
    total: 60,
    answered: 52,
    correct: 50,
    skipped: 8,
    early: true,
  },
  { id: 'practice', label: 'Работа над ошибками', mode: 'mistakes', total: 12, answered: 12, correct: 8, skipped: 0 },
  {
    id: 'practice-perfect',
    label: 'Работа над ошибками без ошибок',
    mode: 'mistakes',
    total: 12,
    answered: 12,
    correct: 12,
    skipped: 0,
  },
];

export function previewAttemptId(level, scenarioId) {
  return `preview-${level}-${scenarioId}`;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function questionHash(question) {
  let hash = 2166136261;
  for (const character of `${question.level}:${question.domain}:${question.type}:${question.id}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateBank(questions) {
  if (!Array.isArray(questions)) throw new Error('Результаты нельзя построить без банка вопросов.');
  const ids = new Set();
  for (const question of questions) {
    if (!question || typeof question !== 'object' || typeof question.id !== 'string' || ids.has(question.id)) {
      throw new Error('Банк содержит некорректные или повторяющиеся идентификаторы вопросов.');
    }
    ids.add(question.id);
  }
  for (const level of LEVELS) {
    const levelQuestions = questions.filter((question) => question.level === level);
    if (levelQuestions.length !== 60) throw new Error(`Уровень ${level} должен содержать 60 вопросов.`);
    for (const domain of DOMAINS) {
      if (levelQuestions.filter((question) => question.domain === domain).length !== 10)
        throw new Error(`Уровень ${level} должен содержать по 10 вопросов каждого домена.`);
    }
    for (const type of TYPES) {
      const count = levelQuestions.filter((question) => question.type === type).length;
      const expected = type === 'match' ? 12 : 24;
      if (count !== expected) throw new Error(`Уровень ${level} должен содержать ${expected} вопросов типа ${type}.`);
    }
    for (const question of levelQuestions) {
      const response = question.type === 'match' ? question.pairs : question.correct;
      if (
        !TYPES.includes(question.type) ||
        !DOMAINS.includes(question.domain) ||
        !isValidResponse(question, response, true)
      )
        throw new Error(`Вопрос ${question.id} имеет неподдерживаемую структуру.`);
    }
  }
  if (questions.length !== 180) throw new Error('Банк должен содержать 180 вопросов.');
}

function spreadQuestions(levelQuestions) {
  const queues = new Map();
  for (const domain of DOMAINS) {
    for (const type of TYPES) {
      queues.set(
        `${domain}:${type}`,
        levelQuestions
          .filter((question) => question.domain === domain && question.type === type)
          .sort((a, b) => questionHash(a) - questionHash(b) || a.id.localeCompare(b.id)),
      );
    }
  }
  const result = [];
  for (let round = 0; result.length < levelQuestions.length; round++) {
    for (const domain of DOMAINS) {
      for (const type of TYPES) {
        const queue = queues.get(`${domain}:${type}`);
        if (queue?.length) result.push(queue.shift());
      }
    }
    if (round > levelQuestions.length) throw new Error('Не удалось равномерно распределить вопросы банка.');
  }
  return result;
}

function statusQuestions(orderedQuestions, correct, answered) {
  const wrong = answered - correct;
  const statusOrder = [
    ...Array(correct).fill('correct'),
    ...Array(wrong).fill('wrong'),
    ...Array(orderedQuestions.length - answered).fill('skipped'),
  ];
  const result = new Map();
  const step = 37;
  for (let index = 0; index < statusOrder.length; index++) {
    result.set(orderedQuestions[(index * step) % orderedQuestions.length].id, statusOrder[index]);
  }
  return result;
}

function wrongResponse(question) {
  if (question.type === 'single') {
    const option = question.options.find((item) => !question.correct.includes(item.id));
    if (!option) throw new Error(`Для вопроса ${question.id} нельзя построить неверный одиночный ответ.`);
    return [option.id];
  }
  if (question.type === 'multi') {
    const extra = question.options.find((item) => !question.correct.includes(item.id));
    const response = extra ? [...question.correct, extra.id] : question.correct.slice(1);
    if (!isValidResponse(question, response, true))
      throw new Error(`Для вопроса ${question.id} нельзя построить неверный множественный ответ.`);
    return response;
  }
  if (question.type === 'match' && question.left.length > 1) {
    const response = clone(question.pairs);
    const [first, second] = question.left;
    [response[first.id], response[second.id]] = [response[second.id], response[first.id]];
    if (!isValidResponse(question, response, true) || evaluate(question, response))
      throw new Error(`Для вопроса ${question.id} нельзя построить неверную пару.`);
    return response;
  }
  throw new Error(`Для вопроса ${question.id} нельзя построить неверный ответ.`);
}

function practiceQuestions(levelQuestions) {
  const selected = [];
  const cycles = [
    ['single', 'multi'],
    ['multi', 'match'],
    ['match', 'single'],
    ['single', 'multi'],
    ['multi', 'match'],
    ['match', 'single'],
  ];
  for (const [domain, types] of DOMAINS.map((domain, index) => [domain, cycles[index]])) {
    for (const type of types) {
      const question = levelQuestions.find(
        (candidate) => candidate.domain === domain && candidate.type === type && !selected.includes(candidate),
      );
      if (!question) throw new Error(`Не удалось подобрать практический вопрос для домена ${domain}.`);
      selected.push(question);
    }
  }
  return selected;
}

function makeFixture(level, scenario, levelQuestions) {
  const allQuestions = spreadQuestions(levelQuestions);
  const selected = scenario.mode === 'mistakes' ? practiceQuestions(levelQuestions) : levelQuestions;
  const selectedIds = selected.map((question) => question.id);
  let attempt = makeAttempt(
    level,
    levelQuestions,
    scenario.mode,
    scenario.mode === 'mistakes' ? selectedIds : null,
    FIXTURE_STARTED_AT,
  );
  const questionById = new Map(levelQuestions.map((question) => [question.id, question]));
  const orderedSelected = allQuestions.filter((question) => selectedIds.includes(question.id));
  const statuses = statusQuestions(orderedSelected, scenario.correct, scenario.answered);
  for (const question of orderedSelected) {
    const status = statuses.get(question.id);
    if (!status || status === 'skipped') continue;
    const response =
      status === 'correct'
        ? clone(question.type === 'match' ? question.pairs : question.correct)
        : wrongResponse(question);
    attempt = submitAnswer(attempt, questionById.get(question.id), response, FIXTURE_SUBMITTED_AT);
  }
  for (const domain of [1, 3, 5]) {
    const question = selected.find((candidate) => candidate.domain === domain);
    if (question) attempt = toggleBookmark(attempt, question.id);
  }
  attempt = finishAttempt(attempt, FIXTURE_COMPLETED_AT);
  return { ...attempt, id: previewAttemptId(level, scenario.id) };
}

export function createResultFixtures(questions) {
  validateBank(questions);
  return LEVELS.flatMap((level) => {
    const levelQuestions = questions.filter((question) => question.level === level);
    return RESULT_SCENARIOS.map((scenario) => makeFixture(level, scenario, levelQuestions));
  });
}
