import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createResultFixtures, previewAttemptId, RESULT_SCENARIOS } from '../src/dev/results-fixtures.ts';
import { evaluate, isValidResponse, scoreAttempt } from '../src/core/exam.ts';
import { freshState, validateState } from '../src/core/storage.ts';
import { resultOutcome } from '../src/core/coaching.ts';
import type { Attempt, LevelId, Question } from '../src/types.ts';

const files = await Promise.all(
  Array.from({ length: 6 }, (_, index) =>
    readFile(new URL(`../src/data/domain-${index + 1}.json`, import.meta.url), 'utf8'),
  ),
);
const questions = files
  .flatMap((text): Question[] => JSON.parse(text) as Question[])
  .sort((a, b) => a.level - b.level || a.domain - b.domain || a.id.localeCompare(b.id));
const questionById = new Map<string, Question>(questions.map((question) => [question.id, question]));
const byScenario = (attempts: Attempt[], id: string, level: LevelId = 1): Attempt =>
  attempts.find((attempt) => attempt.level === level && attempt.id === previewAttemptId(level, id))!;

test('создаёт по 12 завершённых валидных попыток на каждый уровень', () => {
  const attempts = createResultFixtures(questions);
  assert.equal(attempts.length, 36);
  assert.equal(new Set(attempts.map((attempt) => attempt.id)).size, 36);
  assert.doesNotThrow(() =>
    validateState(
      {
        ...freshState(),
        history: attempts,
      },
      questions,
    ),
  );
  for (const attempt of attempts) {
    assert.equal(attempt.completedAt, '2026-01-01T09:30:00.000Z');
    assert.equal(attempt.drafts && Object.keys(attempt.drafts).length, 0);
    for (const [id, answer] of Object.entries(attempt.answers)) {
      const question = questionById.get(id);
      assert.ok(isValidResponse(question, answer.response, true), `${attempt.id}: ${id}`);
      assert.equal(answer.correct, evaluate(question, answer.response));
    }
  }
});

test('покрывает границы результатов и досрочное завершение', () => {
  const attempts = createResultFixtures(questions);
  const expected: ReadonlyArray<readonly [string, number, number, number, string]> = [
    ['empty', 0, 0, 60, 'starting'],
    ['all-wrong', 0, 60, 0, 'starting'],
    ['below60', 35, 60, 0, 'starting'],
    ['close60', 36, 60, 0, 'close'],
    ['below80', 47, 60, 0, 'close'],
    ['target80', 48, 60, 0, 'confident'],
    ['below95', 56, 60, 0, 'confident'],
    ['excellent95', 57, 60, 0, 'excellent'],
    ['perfect', 60, 60, 0, 'excellent'],
    ['early', 50, 52, 8, 'confident'],
  ];
  for (const [id, correct, answered, skipped, outcome] of expected) {
    const score = scoreAttempt(byScenario(attempts, id), questions);
    assert.deepEqual([score.correct, score.answered, score.unanswered], [correct, answered, skipped], id);
    assert.equal(resultOutcome(score.percent).id, outcome, id);
  }
  const early = byScenario(attempts, 'early');
  assert.equal(scoreAttempt(early, questions).percent, 83.3);
});

test('создаёт реальные подборки практики с правильным объёмом и типами', () => {
  const attempts = createResultFixtures(questions);
  for (const level of [1, 2, 3] as LevelId[]) {
    const practice = byScenario(attempts, 'practice', level);
    const perfect = byScenario(attempts, 'practice-perfect', level);
    for (const attempt of [practice, perfect]) {
      assert.equal(attempt.mode, 'mistakes');
      assert.equal(attempt.questionIds.length, 12);
      assert.deepEqual(
        new Set(attempt.questionIds.map((id) => questionById.get(id)!.type)),
        new Set(['single', 'multi', 'match']),
      );
    }
    assert.deepEqual([scoreAttempt(practice, questions).correct, scoreAttempt(perfect, questions).correct], [8, 12]);
  }
});

test('результаты и время воспроизводимы, а закладки распределены по доменам', () => {
  const first = createResultFixtures(questions);
  const second = createResultFixtures(questions);
  assert.deepEqual(second, first);
  for (const attempt of first) {
    const bookmarkDomains = new Set(attempt.bookmarks.map((id) => questionById.get(id)!.domain));
    assert.deepEqual(bookmarkDomains, new Set([1, 3, 5]), attempt.id);
    assert.ok(
      attempt.bookmarks.every((id) => attempt.questionIds.includes(id)),
      attempt.id,
    );
  }
});

test('отбрасывает банк с неожиданной композицией', () => {
  assert.throws(() => createResultFixtures(questions.slice(1)), /180|60/);
});

assert.equal(RESULT_SCENARIOS.length, 12);
