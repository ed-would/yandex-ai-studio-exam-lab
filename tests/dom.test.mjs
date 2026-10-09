import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';

// Проверка DOM и пользовательских событий без запуска браузера или preview-сервера.
const window = new Window({ url: 'https://example.test/repository/' });
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.ResizeObserver = window.ResizeObserver;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
const { render } = await import('preact');
const { act } = await import('preact/test-utils');
const { html } = await import('../src/components/ui.js');
const { App } = await import('../src/app.js');
const { freshState, makeBackup } = await import('../src/core/storage.js');
const { makeAttempt, submitAnswer, finishAttempt, scoreAttempt } = await import('../src/core/exam.js');
const questions = Array.from({ length: 6 }, (_, index) => JSON.parse(readFileSync(new URL(`../src/data/domain-${index + 1}.json`, import.meta.url), 'utf8'))).flat().sort((a, b) => a.level - b.level || a.domain - b.domain || a.id.localeCompare(b.id));
const key = 'test-practicum';
let container;
let storage;

class MemoryStorage {
  map = new Map();
  getItem(name) { return this.map.get(name) ?? null; }
  setItem(name, value) { this.map.set(name, String(value)); }
  removeItem(name) { this.map.delete(name); }
}
const currentState = () => JSON.parse(storage.getItem(key));
const get = (selector) => { const node = container.querySelector(selector); assert.ok(node, `Элемент не найден: ${selector}`); return node; };
const text = () => container.textContent;
const click = async (selectorOrNode) => { const node = typeof selectorOrNode === 'string' ? get(selectorOrNode) : selectorOrNode; await act(() => node.click()); };
const findButton = (value) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === value);
const go = async (hash) => { await act(() => { window.location.hash = hash; window.dispatchEvent(new window.HashChangeEvent('hashchange')); }); };
const mount = async () => { await act(() => render(html`<${App} questions=${questions} storage=${storage} storageName=${key}/>`, container)); };
const unmount = async () => { await act(() => render(null, container)); };

beforeEach(async () => {
  storage = new MemoryStorage();
  window.location.hash = '#/';
  document.body.innerHTML = '<div id="test-app"></div>';
  container = document.getElementById('test-app');
});
afterEach(async () => { await unmount(); });

test('Главная содержит три уровня, русскую навигацию и все шесть доменов', async () => {
  await mount();
  assert.equal(container.querySelectorAll('.level-card').length, 3);
  assert.equal(container.querySelectorAll('.domain-row').length, 6);
  assert.match(text(), /180 авторских вопросов/);
  assert.match(text(), /Тесты.*Прогресс.*Материалы/s);
  assert.doesNotMatch(text(), /undefined|\[object Object\]|NaN/);
  assert.equal(container.querySelectorAll('nav a[aria-current="page"]').length, 1);
});

test('Одиночный ответ фиксируется; ошибку нельзя исправить после показа объяснения', async () => {
  await mount(); await click('[data-start="1"]');
  const q = questions.find((q) => q.level === 1);
  assert.equal(get('[data-action="check-answer"]').disabled, true);
  const wrong = q.options.find((o) => !q.correct.includes(o.id));
  await click(`input[value="${wrong.id}"]`);
  assert.equal(get('[data-action="check-answer"]').disabled, false);
  await click('[data-action="check-answer"]');
  assert.ok(get('.feedback.incorrect'));
  assert.match(text(), new RegExp(q.takeaway.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok([...container.querySelectorAll('.choice input')].every((i) => i.disabled));
  assert.equal(get('.feedback .reasoning-details').open, true);
  const original = JSON.stringify(currentState().sessions['exam:1'].answers[q.id]);
  await click(`input[value="${q.correct[0]}"]`);
  assert.equal(JSON.stringify(currentState().sessions['exam:1'].answers[q.id]), original);
  assert.equal(currentState().sessions['exam:1'].answers[q.id].correct, false);
  assert.ok(container.querySelectorAll('.feedback-sources a').length >= 1);
});

test('Мультивыбор принимает пять ответов и не раскрывает решение до проверки', async () => {
  await mount(); await click('[data-start="1"]');
  const q = questions.find((q) => q.level === 1 && q.type === 'multi' && q.correct.length === 5);
  assert.ok(q);
  const levelQuestions = questions.filter((q) => q.level === 1);
  await click(`[data-question-index="${levelQuestions.indexOf(q)}"]`);
  assert.equal(container.querySelectorAll('.choice.is-correct').length, 0);
  for (const option of q.options) await click(`input[value="${option.id}"]`);
  assert.equal(container.querySelectorAll('.choice input:checked').length, 5);
  await click('[data-action="check-answer"]');
  assert.ok(container.querySelector('.feedback.correct'));
  assert.equal(currentState().sessions['exam:1'].answers[q.id].correct, true);
});

test('Сопоставление создаёт, заменяет и удаляет связи; все пары нужны для проверки', async () => {
  await mount(); await click('[data-start="1"]');
  const qs = questions.filter((q) => q.level === 1);
  const q = qs.find((q) => q.type === 'match');
  await click(`[data-question-index="${qs.indexOf(q)}"]`);
  const [l1, l2] = q.left, [r1, r2] = q.right;
  assert.equal(get('[data-action="check-answer"]').disabled, true);
  // Можно начать с правой колонки.
  await click(`[data-right="${r1.id}"]`); await click(`[data-left="${l1.id}"]`);
  assert.equal(currentState().sessions['exam:1'].drafts[q.id][l1.id], r1.id);
  await click(`[data-left="${l2.id}"]`); await click(`[data-right="${r1.id}"]`);
  let pairs = currentState().sessions['exam:1'].drafts[q.id];
  assert.equal(pairs[l1.id], undefined); assert.equal(pairs[l2.id], r1.id);
  await click('.disconnect');
  assert.deepEqual(currentState().sessions['exam:1'].drafts[q.id], {});
  // Повторное указание уже созданной пары разрывает связь.
  await click(`[data-left="${l1.id}"]`); await click(`[data-right="${r2.id}"]`);
  await click(`[data-right="${r2.id}"]`); await click(`[data-left="${l1.id}"]`);
  assert.deepEqual(currentState().sessions['exam:1'].drafts[q.id], {});
  for (const left of q.left) { await click(`[data-left="${left.id}"]`); await click(`[data-right="${q.pairs[left.id]}"]`); }
  assert.equal(get('[data-action="check-answer"]').disabled, false);
  assert.equal(container.querySelectorAll('.match-lines path').length, q.left.length);
  await click('[data-action="check-answer"]');
  assert.ok(get('.feedback.correct'));
  assert.ok([...container.querySelectorAll('.match-node')].every((b) => b.disabled));
  assert.equal(container.querySelectorAll('.pair-explanation').length, q.left.length);
});

test('Черновик, ответ, текущая позиция и закладка переживают перезапуск приложения', async () => {
  await mount(); await click('[data-start="2"]');
  const qs = questions.filter((q) => q.level === 2);
  await click(`input[value="${qs[0].correct[0]}"]`); await click('[data-action="check-answer"]');
  await click('[data-action="next-question"]');
  await click(`input[value="${qs[1].correct[0]}"]`);
  await click('.bookmark-button');
  const id = currentState().sessions['exam:2'].id;
  await unmount(); await mount();
  assert.equal(get('.question-prompt').textContent, qs[1].prompt);
  assert.equal(get('.bookmark-button').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelectorAll('input:checked').length, 1);
  assert.equal(currentState().sessions['exam:2'].id, id);
  assert.equal(Object.keys(currentState().sessions['exam:2'].answers).length, 1);
  await go('#/'); await click('[data-start="1"]');
  assert.ok(currentState().sessions['exam:1']); assert.ok(currentState().sessions['exam:2']);
});

test('Досрочное завершение считает непроверенный черновик пропуском и открывает весь разбор', async () => {
  await mount(); await click('[data-start="1"]');
  const q = questions.find((q) => q.level === 1);
  await click(`input[value="${q.correct[0]}"]`);
  await click(findButton('Завершить'));
  assert.match(get('[role="dialog"]').textContent, /60 непроверенных/);
  await click(findButton('Завершить и посмотреть балл'));
  assert.ok(get('.results-page'));
  assert.equal(currentState().history.length, 1);
  assert.equal(currentState().sessions['exam:1'], undefined);
  assert.equal(scoreAttempt(currentState().history[0], questions).correct, 0);
  assert.equal(container.querySelectorAll('.review-item').length, 60);
  assert.equal(container.querySelectorAll('.review-item.status-unanswered').length, 60);
  await click('.review-item summary');
  assert.ok(get('.review-item .feedback-sources a'));
  await click(findButton('Повторить ошибки (60)'));
  assert.ok(currentState().sessions['mistakes:1']);
  assert.equal(currentState().history[0].mode, 'exam');
});

test('Все 180 заданий проходимы через DOM: три полных экзамена дают три результата 60/60', async () => {
  await mount();
  for (const level of [1, 2, 3]) {
    await go('#/'); await click(`[data-start="${level}"]`);
    const qs = questions.filter((q) => q.level === level);
    for (const [index, q] of qs.entries()) {
      assert.equal(get('.question-prompt').textContent, q.prompt, q.id);
      if (q.type === 'match') {
        for (const left of q.left) { await click(`[data-left="${left.id}"]`); await click(`[data-right="${q.pairs[left.id]}"]`); }
      } else {
        for (const id of q.correct) await click(`input[value="${id}"]`);
      }
      assert.equal(get('[data-action="check-answer"]').disabled, false, q.id);
      await click('[data-action="check-answer"]');
      assert.ok(container.querySelector('.feedback.correct'), q.id);
      assert.equal(Object.keys(currentState().sessions[`exam:${level}`].answers).length, index + 1);
      await click('[data-action="next-question"]');
    }
    assert.ok(get('.results-page'));
    assert.equal(container.querySelectorAll('.review-item.status-correct').length, 60);
    const result = currentState().history.at(-1);
    assert.equal(result.level, level); assert.equal(scoreAttempt(result, questions).percent, 100);
  }
  assert.equal(currentState().history.length, 3);
  await go('#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 3);
  assert.equal(container.querySelectorAll('.stats-value').length, 3);
  assert.ok([...container.querySelectorAll('.stats-value')].every((node) => node.textContent.includes('100%')));
});

test('Очистка отдельного уровня сохраняет другие, полная очистка удаляет все попытки', async () => {
  const initial = freshState();
  for (const level of [1, 2]) initial.history.push(finishAttempt(makeAttempt(level, questions)));
  initial.sessions['exam:3'] = makeAttempt(3, questions);
  storage.setItem(key, JSON.stringify(initial));
  await mount(); await go('#/history');
  await click('[aria-label="Очистить результаты уровня 1"]');
  await click(findButton('Очистить результаты'));
  assert.equal(currentState().history.length, 1); assert.equal(currentState().history[0].level, 2);
  assert.ok(currentState().sessions['exam:3']);
  await click(findButton('Очистить все результаты')); await click(findButton('Очистить результаты'));
  assert.equal(currentState().history.length, 0); assert.deepEqual(currentState().sessions, {});
});

test('Материалы переключаются по шести доменам, имеют источники и поиск', async () => {
  await mount(); await go('#/study/6');
  assert.match(get('.study-domain-heading h2').textContent, /Алиса AI Про/);
  assert.equal(container.querySelectorAll('.study-nav button').length, 6);
  assert.equal(container.querySelectorAll('.official-grid a').length, 7);
  assert.ok(container.querySelectorAll('.study-sources a').length > 0);
  for (const button of [...container.querySelectorAll('.study-nav button')]) {
    await click(button);
    assert.equal(container.querySelectorAll('.study-guide article').length, 4);
    assert.ok(container.querySelectorAll('.study-sources a').length > 0);
  }
  const input = get('input[type="search"]');
  await act(() => { input.value = 'несуществующий материал'; input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  assert.equal(container.querySelectorAll('.study-sources a').length, 0);
  assert.match(text(), /Материалов с таким названием нет/);
});

test('Повреждённое сохранение не стирается автоматически и показывает восстановление', async () => {
  storage.setItem(key, '{broken');
  await mount();
  assert.ok(get('.storage-warning'));
  await click('[data-start="1"]');
  await click(`input[value="${questions[0].correct[0]}"]`);
  assert.equal(storage.getItem(key), '{broken');
  assert.ok(get('.question-prompt'));
});

test('Конфликт вкладок не перезаписывает чужой прогресс', async () => {
  await mount(); await click('[data-start="1"]');
  const external = currentState(); external.revision += 1; external.sessions['exam:2'] = makeAttempt(2, questions);
  storage.setItem(key, JSON.stringify(external));
  await click(`input[value="${questions[0].correct[0]}"]`);
  assert.ok(get('.storage-warning'));
  assert.match(text(), /Прогресс изменился в другой вкладке/);
  assert.ok(currentState().sessions['exam:2']);
  assert.deepEqual(currentState().sessions['exam:1'].drafts, {});
  await click(findButton('Обновить данные'));
  await click(`input[value="${questions[0].correct[0]}"]`);
  assert.ok(currentState().sessions['exam:1'].drafts[questions[0].id]);
  assert.ok(currentState().sessions['exam:2']);
});

test('Импорт копии требует явного подтверждения и восстанавливает отдельно все уровни', async () => {
  const backupState = freshState();
  backupState.history.push(finishAttempt(makeAttempt(2, questions)));
  backupState.sessions['exam:3'] = makeAttempt(3, questions);
  await mount(); await go('#/history');
  const input = get('input[type="file"]');
  const file = new window.File([JSON.stringify(makeBackup(backupState))], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
  assert.ok(get('[role="dialog"]'));
  assert.equal(storage.getItem(key), null);
  await click(findButton('Восстановить'));
  assert.equal(currentState().history.length, 1); assert.equal(currentState().history[0].level, 2);
  assert.ok(currentState().sessions['exam:3']);
});

test('Ссылка перехода к содержимому не покидает текущий экзамен', async () => {
  await mount(); await click('[data-start="1"]');
  const before = window.location.hash;
  await click('.skip-link');
  assert.equal(window.location.hash, before);
  assert.ok(get('.question-prompt'));
});
