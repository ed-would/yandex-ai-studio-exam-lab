import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import {
  connectPair,
  copy,
  emptyResponse,
  expireTimedQuestions,
  errorIds,
  evaluate,
  finishAttempt,
  isValidResponse,
  levelStats,
  makeAttempt,
  moveCursor,
  QUESTION_SECONDS,
  questionSecondsLeft,
  scoreAttempt,
  sessionKey,
  setDraft,
  submitAnswer,
  toggleBookmark,
} from '../src/core/exam.js';
import {
  clearLevel,
  completeSession,
  freshState,
  makeBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  readState,
  SCHEMA_VERSION,
  storageKey,
  validateState,
  writeState,
} from '../src/core/storage.js';
import { createHtmlReport } from '../src/core/report.js';
import { resultCoaching, resultOutcome } from '../src/core/coaching.js';
import { BANK_VERSION, DOMAINS } from '../src/data/meta.js';
import { validateBank } from '../scripts/validate-bank.mjs';

// Read the same authored JSON as the application; tests need no browser,
// bundler, DOM implementation, network or JSON-module import extension.
const files = await Promise.all(
  Array.from({ length: 6 }, (_, i) => readFile(new URL(`../src/data/domain-${i + 1}.json`, import.meta.url), 'utf8')),
);
const questions = files
  .flatMap((text) => JSON.parse(text))
  .sort((a, b) => a.level - b.level || a.domain - b.domain || a.id.localeCompare(b.id));
const at = (type, level = 1) => questions.find((q) => q.level === level && q.type === type);
const start = '2026-10-09T09:00:00.000Z';
const checked = '2026-10-09T09:01:00.000Z';
const ended = '2026-10-09T10:00:00.000Z';
const clone = (value) => JSON.parse(JSON.stringify(value));
const rightResponse = (q) => clone(q.type === 'match' ? q.pairs : q.correct);
const wrongResponse = (q) => {
  if (q.type === 'single') return [q.options.find((o) => !q.correct.includes(o.id)).id];
  if (q.type === 'multi') {
    const extra = q.options.find((o) => !q.correct.includes(o.id));
    return extra ? [...q.correct, extra.id] : q.correct.slice(1);
  }
  const response = { ...q.pairs };
  const [left, other] = q.left;
  [response[left.id], response[other.id]] = [response[other.id], response[left.id]];
  return response;
};
const attempt = (level = 1, mode = 'exam', ids = null) => makeAttempt(level, questions, mode, ids, start);
const withSession = (a, revision = 0) => ({
  ...freshState(),
  revision,
  sessions: { [sessionKey(a.level, a.mode)]: a },
});
const completed = (level = 1, isCorrect = () => false, completedAt = ended, mode = 'exam', ids = null) => {
  let a = attempt(level, mode, ids);
  for (const id of a.questionIds) {
    const q = questions.find((item) => item.id === id);
    a = submitAnswer(a, q, isCorrect(q) ? rightResponse(q) : wrongResponse(q), checked);
  }
  return finishAttempt(a, completedAt);
};

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
    this.writes = 0;
  }
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.writes += 1;
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

test('состояние результата меняется ровно на границах 60, 80 и 95 процентов', () => {
  for (const [percent, expected] of [
    [0, 'starting'],
    [59.9, 'starting'],
    [60, 'close'],
    [79.9, 'close'],
    [80, 'confident'],
    [94.9, 'confident'],
    [95, 'excellent'],
    [100, 'excellent'],
  ])
    assert.equal(resultOutcome(percent).id, expected, String(percent));
});

test('рекомендации ранжируют реальные ошибки и называют темы из ошибочных заданий', () => {
  const extraFailures = questions.filter((q) => q.level === 1 && q.domain === 6).slice(0, 2);
  const failedIds = new Set(extraFailures.map((q) => q.id));
  const a = completed(1, (q) => q.domain !== 2 && !failedIds.has(q.id));
  const coaching = resultCoaching(a, questions);
  assert.equal(coaching.score.percent, 80);
  assert.equal(coaching.needed, 0);
  assert.deepEqual(
    coaching.priorities.map((row) => row.id),
    [2, 6],
  );
  assert.deepEqual(
    coaching.strong.map((row) => row.id),
    [1, 3, 4, 5, 6],
  );
  assert.equal(coaching.priorities[0].wrong, 10);
  assert.deepEqual(
    coaching.priorities[1].topics,
    extraFailures.map((q) => ({ title: q.topic, takeaway: q.takeaway })),
  );
  for (const row of coaching.priorities) {
    const expected = new Set(
      questions
        .filter((q) => q.level === 1 && q.domain === row.id && (q.domain === 2 || failedIds.has(q.id)))
        .map((q) => q.topic),
    );
    assert.deepEqual(new Set(row.topics.map((topic) => topic.title)), expected);
  }
  assert.equal(
    coaching.formatFocus.wrong,
    Math.max(
      ...['single', 'multi', 'match'].map(
        (type) =>
          questions.filter((q) => q.level === 1 && q.type === type && (q.domain === 2 || failedIds.has(q.id))).length,
      ),
    ),
  );
});

test('пропуски и непроверенные черновики не превращаются в рекомендации о слабых знаниях', () => {
  let a = attempt();
  const qs = questions.filter((q) => q.level === 1);
  for (const q of qs.slice(0, 8)) a = submitAnswer(a, q, rightResponse(q), checked);
  a = submitAnswer(a, qs[8], wrongResponse(qs[8]), checked);
  a = setDraft(a, qs[10], rightResponse(qs[10]));
  const coaching = resultCoaching(finishAttempt(a, ended), questions);
  assert.equal(coaching.score.wrong, 1);
  assert.equal(coaching.score.unanswered, 51);
  assert.deepEqual(
    coaching.priorities.map((row) => row.id),
    [1],
  );
  assert.equal(coaching.strong.length, 0);
  assert.equal(coaching.skipped.length, 6);
  assert.equal(coaching.domains[1].topics.length, 0);
  assert.equal(coaching.outcome.achievement, 'Попытка завершена досрочно');
  assert.match(coaching.outcome.description, /по пропускам ещё предстоит проверить знания/);
});

test('без проверенных ответов нет сильных, слабых тем и совета по формату', () => {
  const coaching = resultCoaching(finishAttempt(attempt(), ended), questions);
  assert.equal(coaching.outcome.title, 'Начни с первого ответа.');
  assert.equal(coaching.priorities.length, 0);
  assert.equal(coaching.strong.length, 0);
  assert.equal(coaching.formatFocus, null);
  assert.equal(coaching.needed, 48);
});

test('идеальная подборка ошибок не выдаётся за полный экзамен; оформление не меняет общие шаблоны', () => {
  const ids = questions
    .filter((q) => q.level === 1 && q.domain === 2)
    .slice(0, 3)
    .map((q) => q.id);
  const practice = resultCoaching(
    completed(1, () => true, ended, 'mistakes', ids),
    questions,
  );
  assert.equal(practice.isPractice, true);
  assert.equal(practice.score.total, 3);
  assert.equal(practice.score.weighted, null);
  assert.equal(practice.outcome.achievement, 'Подборка без ошибок');
  assert.match(practice.outcome.description, /результат выбранной подборки/);
  const full = resultCoaching(
    completed(1, () => true),
    questions,
  );
  assert.equal(full.outcome.achievement, 'Все 60 — на своих местах');
  assert.equal(full.strong.length, 6);
  assert.equal(resultOutcome(100).achievement, 'Точность в деталях');
});

test('до учебной цели указано реальное число недостающих правильных ответов', () => {
  const correctIds = new Set(
    questions
      .filter((q) => q.level === 1)
      .slice(0, 35)
      .map((q) => q.id),
  );
  const coaching = resultCoaching(
    completed(1, (q) => correctIds.has(q.id)),
    questions,
  );
  assert.equal(coaching.score.percent, 58.3);
  assert.equal(coaching.needed, 13);
});

test('реальный банк проходит контракт и содержит 180 самостоятельных заданий', () => {
  const result = validateBank(questions);
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.total, 180);
  assert.equal(result.stats.cells.length, 18);
  for (const cell of result.stats.cells)
    assert.deepEqual([cell.total, cell.single, cell.multi, cell.match], [10, 4, 4, 2]);
});

test('валидатор обнаруживает поломки распределения, языка, ключей, пар и источников', async (t) => {
  const cases = [
    [
      'дубликат ID',
      (bank) => {
        bank[1].id = bank[0].id;
      },
    ],
    [
      'нечисловой уровень',
      (bank) => {
        bank[0].level = '[';
      },
    ],
    [
      'повтор формулировки с пробелами',
      (bank) => {
        bank[1].prompt = `  ${bank[0].prompt.toLocaleUpperCase('ru')}  `;
      },
    ],
    [
      'английский вопрос',
      (bank) => {
        bank[0].prompt = 'Which answer is correct?';
      },
    ],
    [
      'пустое объяснение варианта',
      (bank) => {
        bank.find((q) => q.type === 'single').options[0].explanation = '';
      },
    ],
    [
      'неизвестный правильный вариант',
      (bank) => {
        bank.find((q) => q.type === 'single').correct = ['z'];
      },
    ],
    [
      'два ответа single',
      (bank) => {
        bank.find((q) => q.type === 'single').correct = ['a', 'b'];
      },
    ],
    [
      'слишком мало вариантов multi',
      (bank) => {
        bank.find((q) => q.type === 'multi').options.pop();
      },
    ],
    [
      'повтор правой части пары',
      (bank) => {
        const q = bank.find((item) => item.type === 'match');
        q.pairs[q.left[1].id] = q.pairs[q.left[0].id];
      },
    ],
    [
      'нет объяснения пары',
      (bank) => {
        const q = bank.find((item) => item.type === 'match');
        delete q.pairExplanations[q.left[0].id];
      },
    ],
    [
      'источник исполняет код',
      (bank) => {
        bank[0].sources[0].url = 'javascript:alert(1)';
      },
    ],
    [
      'источник с логином',
      (bank) => {
        bank[0].sources[0].url = 'https://user:secret@example.com/article';
      },
    ],
    [
      'сокращённый источник',
      (bank) => {
        bank[0].sources[0].url = 'https://bit.ly/example';
      },
    ],
    [
      'неполная матрица',
      (bank) => {
        bank.pop();
      },
    ],
  ];
  for (const [name, mutate] of cases)
    await t.test(name, () => {
      const bank = clone(questions);
      mutate(bank);
      assert.ok(validateBank(bank).errors.length > 0);
    });
  assert.ok(validateBank(null).errors.length > 0);
});

test('полные эталонные ответы всех типов оцениваются строго, без частичных баллов', () => {
  for (const q of questions) {
    assert.equal(evaluate(q, rightResponse(q)), true, q.id);
    assert.equal(evaluate(q, wrongResponse(q)), false, q.id);
    assert.equal(evaluate(q, emptyResponse(q)), false, q.id);
    assert.equal(evaluate(q, null), false, q.id);
  }
  assert.equal(evaluate(undefined, []), false);
});

test('single отклоняет два варианта, дубликаты, пустой ответ и неизвестный ID', () => {
  const q = at('single');
  const correct = q.correct[0];
  for (const value of [[], [correct, correct], [correct, wrongResponse(q)[0]], ['missing'], correct, {}, undefined]) {
    assert.equal(evaluate(q, value), false);
  }
  assert.equal(isValidResponse(q, [], false), true);
  assert.equal(isValidResponse(q, [], true), false);
});

test('multi требует ровно правильный набор: порядок не важен, лишнее или пропуск дают ноль', () => {
  const q = questions.find((item) => item.type === 'multi' && item.correct.length >= 2 && item.correct.length <= 4);
  assert.equal(evaluate(q, [...q.correct].reverse()), true);
  assert.equal(evaluate(q, q.correct.slice(1)), false);
  assert.equal(evaluate(q, [...q.correct, q.options.find((o) => !q.correct.includes(o.id)).id]), false);
  assert.equal(evaluate(q, [...q.correct, q.correct[0]]), false);
  const one = questions.find((item) => item.type === 'multi' && item.correct.length === 1);
  const all = questions.find((item) => item.type === 'multi' && item.correct.length === 5);
  assert.equal(evaluate(one, rightResponse(one)), true);
  assert.equal(evaluate(all, all.options.map((o) => o.id).reverse()), true);
  assert.equal(
    evaluate(
      all,
      all.options.slice(1).map((o) => o.id),
    ),
    false,
  );
});

test('match требует все правильные пары и запрещает повторное использование правого элемента', () => {
  const q = at('match');
  const incomplete = rightResponse(q);
  delete incomplete[q.left[0].id];
  assert.equal(isValidResponse(q, incomplete, false), true);
  assert.equal(evaluate(q, incomplete), false);
  const duplicated = rightResponse(q);
  duplicated[q.left[1].id] = duplicated[q.left[0].id];
  assert.equal(isValidResponse(q, duplicated), false);
  assert.equal(evaluate(q, duplicated), false);
  assert.equal(evaluate(q, { ...q.pairs, missing: q.right[0].id }), false);
  assert.equal(evaluate(q, []), false);
  assert.equal(evaluate(q, wrongResponse(q)), false);
});

test('пару можно переназначить, забрать занятую правую карточку и снять повторным нажатием', () => {
  const q = at('match');
  const [l1, l2] = q.left.map((x) => x.id);
  const [r1, r2] = q.right.map((x) => x.id);
  const original = {};
  const first = connectPair(q, original, l1, r1);
  assert.deepEqual(original, {});
  assert.deepEqual(first, { [l1]: r1 });
  const changed = connectPair(q, first, l1, r2);
  assert.deepEqual(changed, { [l1]: r2 });
  const reassigned = connectPair(q, changed, l2, r2);
  assert.deepEqual(reassigned, { [l2]: r2 });
  assert.deepEqual(connectPair(q, reassigned, l2, r2), {});
  assert.strictEqual(connectPair(q, reassigned, 'unknown', r1), reassigned);
  assert.strictEqual(connectPair(q, reassigned, l1, 'unknown'), reassigned);
});

test('проверенный ответ фиксируется: повторная проверка и попытка правки не меняют результат', () => {
  const q = at('single');
  const before = attempt();
  const response = wrongResponse(q);
  const submitted = submitAnswer(before, q, response, checked);
  assert.equal(Object.keys(before.answers).length, 0);
  assert.equal(submitted.answers[q.id].correct, false);
  response[0] = q.correct[0];
  assert.deepEqual(submitted.answers[q.id].response, wrongResponse(q));
  assert.strictEqual(submitAnswer(submitted, q, rightResponse(q), ended), submitted);
  assert.strictEqual(setDraft(submitted, q, rightResponse(q)), submitted);
  assert.equal(scoreAttempt(submitted, questions).correct, 0);
  assert.equal(scoreAttempt(submitted, questions).answered, 1);
});

test('незаполненные и чужие ответы не засчитываются', () => {
  const a = attempt();
  const q = at('single');
  const otherLevel = at('single', 2);
  assert.strictEqual(submitAnswer(a, q, []), a);
  assert.strictEqual(submitAnswer(a, q, ['missing']), a);
  assert.strictEqual(submitAnswer(a, otherLevel, rightResponse(otherLevel)), a);
  assert.strictEqual(setDraft(a, otherLevel, rightResponse(otherLevel)), a);
  assert.strictEqual(setDraft(a, q, ['missing']), a);
  assert.equal(scoreAttempt(a, questions).answered, 0);
});

test('черновики, частичные пары, курсор и закладки переживают сохранение и продолжение', () => {
  const q = at('single');
  const pairQ = at('match');
  let a = attempt();
  const response = rightResponse(q);
  a = setDraft(a, q, response);
  response[0] = wrongResponse(q)[0];
  a = setDraft(a, pairQ, { [pairQ.left[0].id]: pairQ.right[0].id });
  a = moveCursor(a, 12);
  a = toggleBookmark(a, q.id);
  const storage = new MemoryStorage();
  const state = { ...withSession(a), revision: 1 };
  assert.equal(writeState(storage, 'progress', state, 0).ok, true);
  const loaded = readState(storage, 'progress', questions);
  assert.equal(loaded.warning, '');
  const restored = loaded.state.sessions['exam:1'];
  assert.equal(restored.id, a.id);
  assert.equal(restored.cursor, 12);
  assert.deepEqual(restored.bookmarks, [q.id]);
  assert.deepEqual(restored.drafts[q.id], q.correct);
  assert.equal(Object.keys(restored.drafts[pairQ.id]).length, 1);
  assert.equal(scoreAttempt(restored, questions).answered, 0);
  const after = submitAnswer(restored, q, restored.drafts[q.id], checked);
  assert.equal(after.answers[q.id].correct, true);
  assert.ok(!Object.hasOwn(after.drafts, q.id));
  assert.ok(Object.hasOwn(after.drafts, pairQ.id));
});

test('курсор ограничен тестом, закладки переключаются, завершённая попытка неизменна', () => {
  const original = attempt();
  assert.equal(moveCursor(original, -100).cursor, 0);
  assert.equal(moveCursor(original, 1000).cursor, 59);
  assert.strictEqual(moveCursor(original, 1.5), original);
  const q = at('single');
  const saved = toggleBookmark(original, q.id);
  assert.deepEqual(toggleBookmark(saved, q.id).bookmarks, []);
  assert.strictEqual(toggleBookmark(saved, 'missing'), saved);
  const done = finishAttempt(saved, ended);
  for (const next of [
    moveCursor(done, 1),
    toggleBookmark(done, q.id),
    setDraft(done, q, rightResponse(q)),
    submitAnswer(done, q, rightResponse(q)),
    finishAttempt(done),
  ]) {
    assert.strictEqual(next, done);
  }
});

test('досрочное завершение оставляет пропущенные вопросы с нулём и удаляет черновики', () => {
  const singles = questions.filter((q) => q.level === 1 && q.type === 'single');
  let a = attempt();
  a = submitAnswer(a, singles[0], rightResponse(singles[0]), checked);
  a = submitAnswer(a, singles[1], wrongResponse(singles[1]), checked);
  a = setDraft(a, singles[2], rightResponse(singles[2]));
  const done = finishAttempt(a, ended);
  assert.deepEqual(done.drafts, {});
  const score = scoreAttempt(done, questions);
  assert.deepEqual(
    [score.correct, score.total, score.answered, score.wrong, score.unanswered, score.incorrect],
    [1, 60, 2, 1, 58, 59],
  );
  assert.equal(score.percent, 1.7);
  assert.equal(errorIds(done, questions).length, 59);
  assert.ok(errorIds(done, questions).includes(singles[2].id));
  const empty = scoreAttempt(finishAttempt(attempt(), ended), questions);
  assert.deepEqual([empty.percent, empty.correct, empty.unanswered], [0, 0, 60]);
});

test('основной балл пропорционален 60 вопросам, взвешенный отдельно учитывает веса программы', () => {
  assert.equal(
    DOMAINS.reduce((sum, d) => sum + d.weight, 0),
    100,
  );
  const onlyD6 = completed(1, (q) => q.domain === 6);
  const score = scoreAttempt(onlyD6, questions);
  assert.deepEqual([score.correct, score.total, score.answered, score.percent, score.weighted], [10, 60, 60, 16.7, 28]);
  assert.deepEqual(
    score.byDomain.map((row) => row.correct),
    [0, 0, 0, 0, 0, 10],
  );
  assert.ok(score.byDomain.every((row) => row.total === 10 && row.answered === 10));
  const perfect = scoreAttempt(
    completed(2, () => true),
    questions,
  );
  assert.deepEqual([perfect.percent, perfect.weighted, perfect.correct], [100, 100, 60]);
  const wrong = scoreAttempt(completed(3), questions);
  assert.deepEqual([wrong.percent, wrong.weighted], [0, 0]);
});

test('режим ошибок включает только выбранные вопросы уровня и не получает взвешенный балл', () => {
  const ids = [at('single').id, at('multi').id, at('single', 2).id, 'missing', at('single').id];
  const a = attempt(1, 'mistakes', ids);
  assert.deepEqual(new Set(a.questionIds), new Set(ids.slice(0, 2)));
  assert.equal(a.questionIds.length, 2);
  const done = completed(1, () => true, ended, 'mistakes', ids);
  assert.deepEqual([scoreAttempt(done, questions).percent, scoreAttempt(done, questions).weighted], [100, null]);
  assert.equal(attempt(1, 'exam', [ids[0]]).questionIds.length, 60);
  assert.throws(() => attempt(1, 'mistakes', ['missing']));
  assert.throws(() => attempt(4));
  assert.throws(() => attempt(1, 'unknown'));
});

test('режимы и уровни имеют независимые сессии, clearLevel удаляет только выбранный уровень', () => {
  const e1 = attempt(1);
  const e2 = attempt(2);
  const e3 = attempt(3);
  const m1 = attempt(1, 'mistakes', [at('single').id]);
  const h1 = completed(1);
  const h2 = completed(2, () => true);
  const h3 = completed(3, () => true, ended, 'mistakes', [at('single', 3).id]);
  const state = {
    ...freshState(),
    sessions: { 'exam:1': e1, 'exam:2': e2, 'exam:3': e3, 'mistakes:1': m1 },
    history: [h1, h2, h3],
  };
  const checkedState = validateState(state, questions);
  assert.equal(Object.keys(checkedState.sessions).length, 4);
  const cleared = clearLevel(checkedState, 1);
  assert.deepEqual(Object.keys(cleared.sessions).sort(), ['exam:2', 'exam:3']);
  assert.deepEqual(
    cleared.history.map((a) => a.id),
    [h2.id, h3.id],
  );
  assert.equal(state.history.length, 3);
  assert.equal(Object.keys(state.sessions).length, 4);
  assert.deepEqual(freshState(), {
    schemaVersion: SCHEMA_VERSION,
    bankVersion: BANK_VERSION,
    revision: 0,
    sessions: {},
    history: [],
  });
});

test('история сохраняется один раз, новый пересдаваемый экзамен не меняет прошлый результат', () => {
  const active = attempt();
  const state = withSession(active);
  const done = finishAttempt(submitAnswer(active, at('single'), wrongResponse(at('single')), checked), ended);
  const next = completeSession(state, 'exam:1', done);
  assert.equal(next.history.length, 1);
  assert.equal(next.sessions['exam:1'], undefined);
  assert.strictEqual(completeSession(next, 'exam:1', done), next);
  assert.strictEqual(completeSession(state, 'exam:1', active), state);
  const retry = attempt();
  assert.notEqual(retry.id, done.id);
  assert.deepEqual(retry.answers, {});
  assert.equal(scoreAttempt(next.history[0], questions).correct, 0);
});

test('завершение с неверным ключом не должно удалять экзамен другого уровня', () => {
  const e1 = attempt(1);
  const e2 = attempt(2);
  const state = { ...freshState(), sessions: { 'exam:1': e1, 'exam:2': e2 }, history: [] };
  const done1 = finishAttempt(e1, ended);
  const next = completeSession(state, 'exam:2', done1);
  assert.deepEqual(next, state, 'Чужой ключ завершения должен быть отклонён целиком.');
});

test('завершение устаревшей попытки не должно стирать новую попытку того же уровня', () => {
  const stale = attempt(1);
  const current = attempt(1);
  const state = withSession(current);
  const next = completeSession(state, 'exam:1', finishAttempt(stale, ended));
  assert.deepEqual(next, state, 'Должен совпадать идентификатор активной попытки, а не только уровень.');
});

test('статистика уровня учитывает только полные экзамены и сортирует завершения по времени', () => {
  const first = completed(1, () => false, '2026-10-08T10:00:00.000Z');
  const second = completed(1, (q) => q.domain === 6, '2026-10-09T10:00:00.000Z');
  const third = completed(1, () => true, '2026-10-10T10:00:00.000Z');
  const practice = completed(1, () => true, '2026-10-11T10:00:00.000Z', 'mistakes', [at('single').id]);
  const otherLevel = completed(2, () => true);
  const state = { ...freshState(), history: [third, first, otherLevel, practice, second] };
  const stats = levelStats(state, 1, questions);
  assert.deepEqual(
    stats.exams.map((a) => a.id),
    [first.id, second.id, third.id],
  );
  assert.equal(stats.best, 100);
  assert.equal(stats.previous, 16.7);
  assert.equal(stats.latest.id, third.id);
  assert.equal(stats.latestScore.percent, 100);
  assert.deepEqual(levelStats(freshState(), 1, questions), {
    exams: [],
    latest: null,
    best: null,
    previous: null,
    latestScore: null,
  });
});

test('резервная копия восстанавливает историю и черновик; подменённый correct пересчитывается', () => {
  const q = at('single');
  let active = submitAnswer(attempt(), q, wrongResponse(q), checked);
  active = setDraft(active, at('multi'), rightResponse(at('multi')));
  const done = completed(2, () => true);
  const state = { ...withSession(active, 7), history: [done] };
  const saved = makeBackup(state);
  assert.equal(saved.application, 'ai-basics-exam-trainer');
  saved.state.sessions['exam:1'].answers[q.id].correct = true;
  saved.state.history[0].answers[at('single', 2).id].correct = false;
  const restored = parseBackup(JSON.stringify(saved), questions);
  assert.deepEqual(
    parseBackup(JSON.stringify({ ...saved, application: 'ai-practicum' }), questions),
    restored,
    'Резервные копии до переименования остаются совместимыми.',
  );
  assert.equal(restored.revision, 0);
  assert.equal(restored.sessions['exam:1'].answers[q.id].correct, false);
  assert.equal(restored.history[0].answers[at('single', 2).id].correct, true);
  assert.deepEqual(restored.sessions['exam:1'].drafts, active.drafts);
  assert.equal(scoreAttempt(restored.sessions['exam:1'], questions).correct, 0);
  assert.equal(scoreAttempt(restored.history[0], questions).percent, 100);
  assert.equal(
    saved.state.sessions['exam:1'].answers[q.id].correct,
    true,
    'Валидация не должна менять переданный объект.',
  );
});

test('score не доверяет флагу correct даже до валидации импортированного состояния', () => {
  const q = at('single');
  const a = submitAnswer(attempt(), q, wrongResponse(q), checked);
  a.answers[q.id].correct = true;
  assert.equal(scoreAttempt(a, questions).correct, 0);
  a.answers[q.id].response = rightResponse(q);
  a.answers[q.id].correct = false;
  assert.equal(scoreAttempt(a, questions).correct, 1);
});

test('повреждённые, несовместимые и структурно неверные сохранения отклоняются', async (t) => {
  const base = withSession(attempt());
  const cases = [
    [
      'неверная версия схемы',
      (s) => {
        s.schemaVersion += 1;
      },
    ],
    [
      'неверная версия банка',
      (s) => {
        s.bankVersion = 'other';
      },
    ],
    [
      'отрицательная ревизия',
      (s) => {
        s.revision = -1;
      },
    ],
    [
      'дробная ревизия',
      (s) => {
        s.revision = 0.5;
      },
    ],
    [
      'массив вместо sessions',
      (s) => {
        s.sessions = [];
      },
    ],
    [
      'объект вместо history',
      (s) => {
        s.history = {};
      },
    ],
    [
      'неверный ключ сессии',
      (s) => {
        s.sessions['exam:2'] = s.sessions['exam:1'];
        delete s.sessions['exam:1'];
      },
    ],
    [
      'чужой уровень вопроса',
      (s) => {
        s.sessions['exam:1'].questionIds[0] = at('single', 2).id;
      },
    ],
    [
      'дубли вопросов',
      (s) => {
        s.sessions['exam:1'].questionIds[1] = s.sessions['exam:1'].questionIds[0];
      },
    ],
    [
      'пустой тест',
      (s) => {
        s.sessions['exam:1'].questionIds = [];
      },
    ],
    [
      'сокращённый экзамен',
      (s) => {
        s.sessions['exam:1'].questionIds.pop();
      },
    ],
    [
      'переставленные вопросы экзамена',
      (s) => {
        s.sessions['exam:1'].questionIds.reverse();
      },
    ],
    [
      'курсор вне теста',
      (s) => {
        s.sessions['exam:1'].cursor = 60;
      },
    ],
    [
      'неверная дата',
      (s) => {
        s.sessions['exam:1'].startedAt = 'not-a-date';
      },
    ],
    [
      'завершённая активная сессия',
      (s) => {
        s.sessions['exam:1'].completedAt = ended;
      },
    ],
    [
      'опасный ID',
      (s) => {
        s.sessions['exam:1'].id = '<script>alert(1)</script>';
      },
    ],
    [
      'неизвестный режим',
      (s) => {
        s.sessions['exam:1'].mode = 'admin';
      },
    ],
    [
      'чужая закладка',
      (s) => {
        s.sessions['exam:1'].bookmarks = [at('single', 2).id];
      },
    ],
    [
      'повтор закладки',
      (s) => {
        const id = at('single').id;
        s.sessions['exam:1'].bookmarks = [id, id];
      },
    ],
    [
      'неизвестный ответ',
      (s) => {
        s.sessions['exam:1'].answers.unknown = { response: ['a'], correct: true, submittedAt: checked };
      },
    ],
    [
      'неполный проверенный ответ',
      (s) => {
        s.sessions['exam:1'].answers[at('single').id] = { response: [], correct: true, submittedAt: checked };
      },
    ],
    [
      'неизвестный вариант',
      (s) => {
        s.sessions['exam:1'].answers[at('single').id] = { response: ['z'], correct: true, submittedAt: checked };
      },
    ],
    [
      'черновик чужого вопроса',
      (s) => {
        s.sessions['exam:1'].drafts[at('single', 2).id] = rightResponse(at('single', 2));
      },
    ],
    [
      'черновик проверенного ответа',
      (s) => {
        const q = at('single');
        s.sessions['exam:1'] = submitAnswer(s.sessions['exam:1'], q, rightResponse(q), checked);
        s.sessions['exam:1'].drafts[q.id] = rightResponse(q);
      },
    ],
    [
      'повтор ID попытки',
      (s) => {
        s.history = [finishAttempt(s.sessions['exam:1'], ended)];
      },
    ],
    [
      'незавершённая попытка в истории',
      (s) => {
        const a = s.sessions['exam:1'];
        s.sessions = {};
        s.history = [a];
      },
    ],
    [
      'черновик в завершённой истории',
      (s) => {
        const q = at('single');
        const a = finishAttempt(s.sessions['exam:1'], ended);
        a.drafts[q.id] = rightResponse(q);
        s.sessions = {};
        s.history = [a];
      },
    ],
  ];
  for (const [name, mutate] of cases)
    await t.test(name, () => {
      const damaged = clone(base);
      mutate(damaged);
      assert.throws(() => validateState(damaged, questions));
      assert.throws(() => parseBackup(JSON.stringify({ application: 'ai-practicum', state: damaged }), questions));
    });
  for (const value of [null, [], 17, 'state', {}, undefined]) assert.throws(() => validateState(value, questions));
});

test('резервные копии: некорректный JSON, чужое приложение и предел именно в байтах', () => {
  assert.throws(() => parseBackup('{broken', questions), /JSON/u);
  assert.throws(
    () => parseBackup(JSON.stringify({ application: 'other', state: freshState() }), questions),
    /резервная копия/u,
  );
  assert.throws(() => parseBackup(null, questions));
  const tooManyAscii = 'x'.repeat(MAX_BACKUP_BYTES + 1);
  assert.throws(() => parseBackup(tooManyAscii, questions), /10 МБ/u);
  const multibyte = 'я'.repeat(Math.floor(MAX_BACKUP_BYTES / 2) + 1);
  assert.ok(multibyte.length < MAX_BACKUP_BYTES);
  assert.throws(() => parseBackup(multibyte, questions), /10 МБ/u);
  const valid = JSON.stringify(makeBackup(freshState()));
  assert.deepEqual(parseBackup(valid, questions), freshState());
});

test('повреждённое локальное сохранение защищено от молчаливой перезаписи при чтении', () => {
  for (const raw of ['', '{неполный JSON']) {
    const storage = new MemoryStorage([['progress', raw]]);
    const result = readState(storage, 'progress', questions);
    assert.deepEqual(result.state, freshState());
    assert.equal(result.protected, true);
    assert.equal(result.raw, raw);
    assert.ok(result.warning);
    assert.equal(writeState(storage, 'progress', freshState(), 0).ok, false);
    assert.equal(storage.getItem('progress'), raw);
    assert.equal(storage.writes, 0);
  }
  const unavailable = readState(
    {
      getItem() {
        throw new Error('SecurityError');
      },
    },
    'progress',
    questions,
  );
  assert.equal(unavailable.protected, false);
  assert.ok(unavailable.warning);
  assert.deepEqual(readState(null, 'progress', questions).state, freshState());
});

test('нехватка места или запрет записи возвращают предупреждение, не уничтожая сохранение', () => {
  const original = JSON.stringify({ ...freshState(), revision: 2 });
  const storage = new MemoryStorage([['progress', original]]);
  storage.setItem = () => {
    const error = new Error('quota full');
    error.name = 'QuotaExceededError';
    throw error;
  };
  const result = writeState(storage, 'progress', { ...freshState(), revision: 3 }, 2);
  assert.equal(result.ok, false);
  assert.ok(result.warning);
  assert.equal(storage.getItem('progress'), original);
  assert.equal(writeState(null, 'progress', freshState()).ok, false);
});

test('конфликт вкладок не перезаписывает более свежую ревизию', () => {
  const fresh = { ...freshState(), revision: 5 };
  const storage = new MemoryStorage([['progress', JSON.stringify(fresh)]]);
  const staleResult = writeState(storage, 'progress', { ...freshState(), revision: 4 }, 3);
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.conflict, true);
  assert.equal(storage.writes, 0);
  assert.deepEqual(JSON.parse(storage.getItem('progress')), fresh);
  const newState = { ...fresh, revision: 6 };
  assert.equal(writeState(storage, 'progress', newState, 5).ok, true);
  assert.deepEqual(JSON.parse(storage.getItem('progress')), newState);
  const missing = new MemoryStorage();
  assert.equal(writeState(missing, 'progress', newState, 5).conflict, true);
  assert.equal(missing.getItem('progress'), null);
});

test('несовместимое содержимое не перезаписывается при проверке ревизии', () => {
  const storage = new MemoryStorage([['progress', '{bad']]);
  const result = writeState(storage, 'progress', freshState(), 0);
  assert.equal(result.ok, false);
  assert.equal(storage.getItem('progress'), '{bad');
  assert.equal(storage.writes, 0);
});

test('ключ локального хранилища одинаков для index.html и отделяет проекты GitHub Pages', () => {
  assert.equal(storageKey('/'), storageKey('/index.html'));
  assert.equal(storageKey('/study/'), storageKey('/study/index.html'));
  assert.notEqual(storageKey('/study/'), storageKey('/another/'));
  assert.notEqual(sessionKey(1, 'exam'), sessionKey(1, 'mistakes'));
  assert.notEqual(sessionKey(1), sessionKey(2));
});

test('HTML-отчёт содержит исходные ответы, пояснения и нули за пропущенные задания', () => {
  const q = at('single');
  const a = finishAttempt(submitAnswer(attempt(), q, wrongResponse(q), checked), ended);
  const html = createHtmlReport(a, questions);
  assert.match(html, /<html lang="ru" data-theme="light">/u);
  assert.match(createHtmlReport(a, questions, 'dark'), /<html lang="ru" data-theme="dark">/u);
  assert.match(html, /0 \/ 60/u);
  assert.match(html, /Ошибки: 1\. Пропущено: 59/u);
  assert.match(html, /твой выбор/u);
  assert.match(html, /Запомнить:/u);
  assert.match(html, /не является официальной оценкой Яндекса/u);
  assert.doesNotMatch(html, /<script\b/iu);
  assert.equal((html.match(/<article>/gu) || []).length, 60);
});

test('HTML-отчёт экранирует тексты, пояснения, даты, пары и атрибуты ссылок', () => {
  const marker = `<img src=x onerror="alert('x')"> & <script>alert(1)</script>`;
  const q = clone(at('single'));
  q.prompt = marker;
  q.explanation = marker;
  q.takeaway = marker;
  q.options[0].text = marker;
  q.options[0].explanation = marker;
  q.sources = [
    { title: marker, url: 'https://safe.example/?q=" onclick="alert(1)' },
    { title: 'Недопустимая ссылка', url: 'javascript:alert(1)' },
    { title: 'Недопустимые данные', url: 'data:text/html,<script>alert(1)</script>' },
    { title: 'Без протокола', url: '//unsafe.example/' },
  ];
  const pair = clone(at('match'));
  pair.left[0].text = marker;
  pair.right[0].text = marker;
  pair.pairExplanations[pair.left[0].id] = marker;
  const localBank = questions.map((item) => (item.id === q.id ? q : item.id === pair.id ? pair : item));
  let a = makeAttempt(1, localBank, 'mistakes', [q.id, pair.id], start);
  a = submitAnswer(a, q, rightResponse(q), checked);
  a = submitAnswer(a, pair, rightResponse(pair), checked);
  a = finishAttempt(a, marker); // Direct report defence, even if the caller skipped date validation.
  const html = createHtmlReport(a, localBank);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; &lt;script&gt;'));
  assert.ok(html.includes('href="https://safe.example/?q=&quot; onclick=&quot;alert(1)"'));
  assert.doesNotMatch(html, /<img\b|<script\b/iu);
  assert.doesNotMatch(html, /href="(?:javascript:|data:|\/\/)/iu);
  assert.doesNotMatch(html, /<a[^>]*\sonclick="/iu);
  assert.equal((html.match(/<article>/gu) || []).length, 2);
});

test('copy и сохранение ответа не создают общих изменяемых ссылок на выбранный набор', () => {
  const q = at('match');
  const response = rightResponse(q);
  const saved = submitAnswer(attempt(), q, response, checked);
  delete response[q.left[0].id];
  assert.equal(Object.keys(saved.answers[q.id].response).length, q.left.length);
  const cloned = copy(saved);
  cloned.answers[q.id].response[q.left[0].id] = 'missing';
  assert.equal(evaluate(q, saved.answers[q.id].response), true);
});

test('импорт не переносит счётчик устройства и очищает посторонние поля без мутации источника', () => {
  const q = at('single');
  const a = submitAnswer(attempt(), q, rightResponse(q), checked);
  a.unusedPayload = { nested: 'unused'.repeat(1000) };
  a.answers[q.id].unusedPayload = 'ignored';
  a.answers[q.id].correct = false;
  const state = withSession(a, Number.MAX_SAFE_INTEGER);
  const original = JSON.stringify(state);
  const result = parseBackup(JSON.stringify(makeBackup(state)), questions);
  assert.equal(result.revision, 0);
  assert.equal(result.sessions['exam:1'].unusedPayload, undefined);
  assert.equal(result.sessions['exam:1'].answers[q.id].unusedPayload, undefined);
  assert.equal(result.sessions['exam:1'].answers[q.id].correct, true);
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(validateState(result, questions), result);
});

test('responsive-изображения имеют реальные размеры и существующие локальные файлы', async () => {
  const manifest = JSON.parse(await readFile(new URL('../src/data/image-variants.json', import.meta.url), 'utf8'));
  for (const [source, image] of Object.entries(manifest)) {
    assert.ok(image.width > 0 && image.height > 0, source);
    const original = await readFile(new URL(`../public/images/${source}`, import.meta.url)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return readFile(new URL(`../docs/design-lab/${source.replace(/^brand\//, 'logos/')}`, import.meta.url));
    });
    let previous = 0;
    for (const [width, path] of image.variants) {
      assert.ok(width > previous && width <= image.width, path);
      previous = width;
      assert.ok(path === source || path.endsWith('-optimized.webp'), path);
      assert.equal(path.slice(0, path.lastIndexOf('/')), source.slice(0, source.lastIndexOf('/')), path);
      const variant = await readFile(new URL(`../public/images/${path}`, import.meta.url));
      assert.ok(variant.length > 0, path);
      if (path !== source) assert.ok(variant.length < original.length, path);
    }
    assert.equal(previous, image.width, source);
  }
  const folders = (await readdir(new URL('../public/images/', import.meta.url))).filter((file) => file !== '.DS_Store');
  assert.deepEqual(folders.sort(), ['artwork', 'brand']);
  const files = new Set(
    (
      await Promise.all(
        folders.map(async (folder) =>
          (await readdir(new URL(`../public/images/${folder}/`, import.meta.url)))
            .filter((file) => file !== '.DS_Store')
            .map((file) => `${folder}/${file}`),
        ),
      )
    ).flat(),
  );
  const used = new Set(Object.values(manifest).flatMap(({ variants }) => variants.map(([, file]) => file)));
  used.add('brand/ai-studio-white.svg');
  assert.deepEqual(files, used);
});
test('таймер даёт 72 секунды и сохраняет сроки при переходах между вопросами', () => {
  assert.equal(QUESTION_SECONDS, 72);
  assert.equal(attempt().timing, undefined);
  const timed = makeAttempt(1, questions, 'exam', null, start, true);
  const first = timed.questionIds[0];
  const startMs = Date.parse(start);
  assert.equal(questionSecondsLeft(timed, first, startMs), 72);
  assert.equal(questionSecondsLeft(timed, first, startMs + 62000), 10);
  assert.equal(questionSecondsLeft(timed, first, startMs + 72000), 0);
  assert.equal(questionSecondsLeft(timed, first, startMs + 100000), 0);
  const moved = moveCursor(timed, 1, new Date(startMs + 20000).toISOString());
  const returned = moveCursor(moved, 0, new Date(startMs + 30000).toISOString());
  assert.equal(returned.timing.deadlines[first], timed.timing.deadlines[first]);
  assert.equal(questionSecondsLeft(returned, first, startMs + 30000), 42);
  assert.equal(questionSecondsLeft(returned, timed.questionIds[1], startMs + 30000), 62);
  assert.deepEqual(validateState(withSession(returned), questions), withSession(returned));
});

test('таймер фиксирует ошибку для любого формата и не принимает просроченный ответ или черновик', () => {
  const deadline = new Date(Date.parse(start) + 72000).toISOString();
  const justBefore = new Date(Date.parse(deadline) - 1).toISOString();
  for (const type of ['single', 'multi', 'match']) {
    const q = at(type);
    const timed = makeAttempt(1, questions, 'mistakes', [q.id], start, true);
    const drafted = setDraft(timed, q, rightResponse(q), start);
    const accepted = submitAnswer(drafted, q, rightResponse(q), justBefore);
    assert.equal(accepted.answers[q.id].correct, true);
    const expired = submitAnswer(drafted, q, rightResponse(q), deadline);
    assert.equal(expired.answers[q.id].correct, false);
    assert.equal(expired.answers[q.id].timedOut, true);
    assert.deepEqual(expired.answers[q.id].response, emptyResponse(q));
    assert.deepEqual(expired.drafts, {});
    assert.deepEqual(setDraft(drafted, q, rightResponse(q), deadline), expired);
    assert.equal(submitAnswer(expired, q, rightResponse(q), deadline), expired);
    assert.equal(expireTimedQuestions(expired, questions, ended), expired);
    const score = scoreAttempt(expired, questions);
    assert.equal(score.wrong, 1);
    assert.equal(score.unanswered, 0);
    assert.deepEqual(errorIds(expired, questions), [q.id]);
    assert.deepEqual(validateState(withSession(expired), questions), withSession(expired));
    const complete = finishAttempt(expired, deadline);
    const state = { ...freshState(), history: [complete] };
    assert.deepEqual(parseBackup(JSON.stringify(makeBackup(state)), questions), state);
    assert.match(createHtmlReport(complete, questions), /Ошибка · время вышло/);
  }
});

test('таймер сжигает все просроченные посещённые вопросы и открывает ближайший без ответа', () => {
  const timed = makeAttempt(1, questions, 'exam', null, start, true);
  const later = moveCursor(timed, 2, checked);
  const when = new Date(Date.parse(checked) + 72000).toISOString();
  const expired = expireTimedQuestions(later, questions, when);
  assert.ok(expired.answers[timed.questionIds[0]].timedOut);
  assert.ok(expired.answers[timed.questionIds[2]].timedOut);
  assert.equal(expired.cursor, 3);
  assert.equal(questionSecondsLeft(expired, timed.questionIds[3], Date.parse(when)), 72);
  const review = moveCursor(expired, 0, when);
  assert.equal(expireTimedQuestions(review, questions, when), review);
});

test('таймер не меняет старые попытки и отклоняет подделанные сроки и ответы', () => {
  const legacy = withSession(attempt());
  assert.deepEqual(validateState(legacy, questions), legacy);
  const timed = makeAttempt(1, questions, 'exam', null, start, true);
  const expired = expireTimedQuestions(timed, questions, new Date(Date.parse(start) + 72000).toISOString());
  const original = withSession(expired);
  for (const mutate of [
    (a) => {
      a.timing.secondsPerQuestion = 73;
    },
    (a) => {
      a.timing.deadlines.unknown = ended;
    },
    (a) => {
      a.timing.deadlines[a.questionIds[0]] = 'broken';
    },
    (a) => {
      a.timing.deadlines[a.questionIds[0]] = ended;
    },
    (a) => {
      delete a.timing;
    },
    (a) => {
      a.answers[a.questionIds[0]].response = rightResponse(questions[0]);
    },
    (a) => {
      a.answers[a.questionIds[0]].timedOut = false;
    },
    (a) => {
      delete a.timing.deadlines[a.questionIds[a.cursor]];
    },
  ]) {
    const broken = clone(original);
    mutate(broken.sessions['exam:1']);
    assert.throws(() => validateState(broken, questions));
  }
});
