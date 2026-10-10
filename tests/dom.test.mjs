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
const { makeAttempt, finishAttempt, scoreAttempt, submitAnswer } = await import('../src/core/exam.js');
const { CompletionConfetti } = await import('../src/components/completion-confetti.js');
const questions = Array.from({ length: 6 }, (_, index) =>
  JSON.parse(readFileSync(new URL(`../src/data/domain-${index + 1}.json`, import.meta.url), 'utf8')),
)
  .flat()
  .sort((a, b) => a.level - b.level || a.domain - b.domain || a.id.localeCompare(b.id));
const key = 'test-ai-basics-trainer';
let container;
let storage;

class MemoryStorage {
  map = new Map();
  getItem(name) {
    return this.map.get(name) ?? null;
  }
  setItem(name, value) {
    this.map.set(name, String(value));
  }
  removeItem(name) {
    this.map.delete(name);
  }
}
const currentState = () => JSON.parse(storage.getItem(key));
const get = (selector) => {
  const node = container.querySelector(selector);
  assert.ok(node, `Элемент не найден: ${selector}`);
  return node;
};
const text = () => container.textContent;
const click = async (selectorOrNode) => {
  const node = typeof selectorOrNode === 'string' ? get(selectorOrNode) : selectorOrNode;
  await act(() => node.click());
};
const press = async (node, key) => {
  await act(() => node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
};
const findButton = (value) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === value);
const go = async (hash) => {
  await act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  });
};
const mount = async () => {
  await act(() => render(html`<${App} questions=${questions} storage=${storage} storageName=${key}/>`, container));
};
const unmount = async () => {
  await act(() => render(null, container));
};

beforeEach(async () => {
  storage = new MemoryStorage();
  window.location.hash = '#/';
  document.body.innerHTML = '<div id="test-app"></div>';
  container = document.getElementById('test-app');
});
afterEach(async () => {
  await unmount();
});

test('рекомендация открывает разбор именно ошибочных ответов выбранной темы и переносит фокус', async () => {
  let attempt = makeAttempt(1, questions);
  const failed = questions.filter((q) => q.level === 1 && q.domain === 2).slice(0, 2);
  for (const id of attempt.questionIds) {
    const q = questions.find((item) => item.id === id);
    const response = failed.some((item) => item.id === id)
      ? [q.options.find((o) => !q.correct.includes(o.id)).id]
      : q.type === 'match'
        ? { ...q.pairs }
        : [...q.correct];
    attempt = submitAnswer(attempt, q, response);
  }
  attempt = finishAttempt(attempt);
  const initial = freshState();
  initial.history.push(attempt);
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go(`#/results/${attempt.id}`);
  assert.ok(get('.outcome-excellent'));
  assert.equal(container.querySelector('.completion-confetti'), null);
  const card = get('[data-coaching-domain="2"]');
  for (const q of failed) assert.ok(card.textContent.includes(q.topic));
  assert.ok(card.textContent.includes(failed[0].takeaway));
  await click(card.querySelector('button'));
  assert.equal(document.activeElement.id, 'results-review-title');
  assert.equal(get('select[aria-label="Фильтр по домену"]').value, '2');
  assert.equal(findButton('Ошибки 2').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelectorAll('.review-item').length, 2);
  assert.ok(
    [...container.querySelectorAll('.review-question > strong')].every((node) =>
      failed.some((q) => q.prompt === node.textContent),
    ),
  );
  await click(card.querySelector('a'));
  await go('#/study/2');
  assert.ok(get('.study-page'));
});

test('досрочная попытка выше 80% показывает пропуски и не предлагает следующий уровень', async () => {
  let attempt = makeAttempt(1, questions);
  for (const id of attempt.questionIds.slice(0, 50)) {
    const q = questions.find((item) => item.id === id);
    attempt = submitAnswer(attempt, q, q.type === 'match' ? { ...q.pairs } : [...q.correct]);
  }
  attempt = finishAttempt(attempt);
  const initial = freshState();
  initial.history.push(attempt);
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go(`#/results/${attempt.id}`);
  assert.match(get('.achievement-label').textContent, /досрочно/);
  assert.equal(container.querySelectorAll('.coaching-card').length, 0);
  assert.equal(findButton('К уровню 2'), undefined);
  assert.match(get('.competency-untested').textContent, /Не проверено/);
  await click(get('.skipped-note button'));
  assert.equal(container.querySelectorAll('.review-item.status-unanswered').length, 10);
  assert.equal(findButton('Пропущено 10').getAttribute('aria-pressed'), 'true');
});

test('хлопушка появляется после завершения и не повторяется при фильтрации, возврате или перезапуске', async () => {
  let attempt = makeAttempt(1, questions);
  for (const id of attempt.questionIds) {
    const q = questions.find((item) => item.id === id);
    attempt = submitAnswer(attempt, q, q.type === 'match' ? { ...q.pairs } : [...q.correct]);
  }
  const initial = freshState();
  initial.sessions['exam:1'] = attempt;
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go('#/exam/1');
  await click(findButton('Завершить'));
  assert.equal(get('.completion-confetti').getAttribute('aria-hidden'), 'true');
  assert.equal(container.querySelectorAll('.completion-confetti i').length, 100);
  await click(findButton('Ошибки 0'));
  assert.equal(container.querySelectorAll('.completion-confetti i').length, 100);
  const id = currentState().history[0].id;
  await go('#/history');
  assert.equal(container.querySelector('.completion-confetti'), null);
  await go(`#/results/${id}`);
  assert.equal(container.querySelector('.completion-confetti'), null);
  await unmount();
  await mount();
  assert.ok(get('.results-page'));
  assert.equal(container.querySelector('.completion-confetti'), null);
});

test('хлопушка учитывает reduced motion, останавливается по таймеру и снимает обработчики', async () => {
  const matchMedia = window.matchMedia;
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;
  let listener;
  let stopped;
  let cleared;
  let removed;
  let consumed = 0;
  const motion = {
    matches: true,
    addEventListener: (_, handler) => {
      listener = handler;
    },
    removeEventListener: (_, handler) => {
      removed = handler;
    },
  };
  const onConsumed = () => {
    consumed++;
  };
  try {
    window.matchMedia = () => motion;
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 3800) {
        stopped = callback;
        return 12345;
      }
      return setTimeout.call(window, callback, delay, ...args);
    };
    window.clearTimeout = (id) => {
      if (id === 12345) cleared = true;
      else clearTimeout.call(window, id);
    };
    await act(() => render(html`<${CompletionConfetti} enabled=${true} onConsumed=${onConsumed}/>`, container));
    assert.equal(consumed, 1);
    assert.equal(container.querySelector('.completion-confetti'), null);
    assert.equal(stopped, undefined);
    await unmount();
    motion.matches = false;
    await act(() => render(html`<${CompletionConfetti} enabled=${true} onConsumed=${onConsumed}/>`, container));
    assert.equal(container.querySelectorAll('.completion-confetti i').length, 64);
    await act(() => listener({ matches: true }));
    assert.equal(container.querySelector('.completion-confetti'), null);
    await unmount();
    assert.equal(cleared, true);
    assert.equal(removed, listener);
    await act(() => render(html`<${CompletionConfetti} enabled=${true} onConsumed=${onConsumed}/>`, container));
    assert.equal(container.querySelectorAll('.completion-confetti i').length, 64);
    await act(() => stopped());
    assert.equal(container.querySelector('.completion-confetti'), null);
    await unmount();
  } finally {
    window.matchMedia = matchMedia;
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
  }
});

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
  await mount();
  await click('[data-start="1"]');
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
  await mount();
  await click('[data-start="1"]');
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
  await mount();
  await click('[data-start="1"]');
  const qs = questions.filter((q) => q.level === 1);
  const q = qs.find((q) => q.type === 'match');
  await click(`[data-question-index="${qs.indexOf(q)}"]`);
  const [l1, l2] = q.left,
    [r1, r2] = q.right;
  assert.equal(get('[data-action="check-answer"]').disabled, true);
  // Можно начать с правой колонки.
  await click(`[data-right="${r1.id}"]`);
  await click(`[data-left="${l1.id}"]`);
  assert.equal(currentState().sessions['exam:1'].drafts[q.id][l1.id], r1.id);
  await click(`[data-left="${l2.id}"]`);
  await click(`[data-right="${r1.id}"]`);
  let pairs = currentState().sessions['exam:1'].drafts[q.id];
  assert.equal(pairs[l1.id], undefined);
  assert.equal(pairs[l2.id], r1.id);
  await click('.disconnect');
  assert.deepEqual(currentState().sessions['exam:1'].drafts[q.id], {});
  // Повторное указание уже созданной пары разрывает связь.
  await click(`[data-left="${l1.id}"]`);
  await click(`[data-right="${r2.id}"]`);
  await click(`[data-right="${r2.id}"]`);
  await click(`[data-left="${l1.id}"]`);
  assert.deepEqual(currentState().sessions['exam:1'].drafts[q.id], {});
  for (const left of q.left) {
    await click(`[data-left="${left.id}"]`);
    await click(`[data-right="${q.pairs[left.id]}"]`);
  }
  assert.equal(get('[data-action="check-answer"]').disabled, false);
  assert.equal(container.querySelectorAll('.match-lines path').length, q.left.length);
  await click('[data-action="check-answer"]');
  assert.ok(get('.feedback.correct'));
  assert.ok([...container.querySelectorAll('.match-node')].every((b) => b.disabled));
  assert.equal(container.querySelectorAll('.pair-explanation').length, q.left.length);
});

test('Черновик, ответ, текущая позиция и закладка переживают перезапуск приложения', async () => {
  await mount();
  await click('[data-start="2"]');
  const qs = questions.filter((q) => q.level === 2);
  await click(`input[value="${qs[0].correct[0]}"]`);
  await click('[data-action="check-answer"]');
  await click('[data-action="next-question"]');
  await click(`input[value="${qs[1].correct[0]}"]`);
  await click('.bookmark-button');
  const id = currentState().sessions['exam:2'].id;
  await unmount();
  await mount();
  assert.equal(get('.question-prompt').textContent, qs[1].prompt);
  assert.equal(get('.bookmark-button').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelectorAll('input:checked').length, 1);
  assert.equal(currentState().sessions['exam:2'].id, id);
  assert.equal(Object.keys(currentState().sessions['exam:2'].answers).length, 1);
  await go('#/');
  await click('[data-start="1"]');
  assert.ok(currentState().sessions['exam:1']);
  assert.ok(currentState().sessions['exam:2']);
});

test('Досрочное завершение считает непроверенный черновик пропуском и открывает весь разбор', async () => {
  await mount();
  await click('[data-start="1"]');
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
    await go('#/');
    await click(`[data-start="${level}"]`);
    const qs = questions.filter((q) => q.level === level);
    for (const [index, q] of qs.entries()) {
      assert.equal(get('.question-prompt').textContent, q.prompt, q.id);
      if (q.type === 'match') {
        for (const left of q.left) {
          await click(`[data-left="${left.id}"]`);
          await click(`[data-right="${q.pairs[left.id]}"]`);
        }
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
    assert.equal(result.level, level);
    assert.equal(scoreAttempt(result, questions).percent, 100);
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
  await mount();
  await go('#/history');
  await click('[aria-label="Очистить результаты уровня 1"]');
  await click(findButton('Очистить результаты'));
  assert.equal(currentState().history.length, 1);
  assert.equal(currentState().history[0].level, 2);
  assert.ok(currentState().sessions['exam:3']);
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(currentState().history.length, 0);
  assert.deepEqual(currentState().sessions, {});
});

test('Материалы переключаются по шести доменам, имеют источники и поиск', async () => {
  await mount();
  await go('#/study/6');
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
  await act(() => {
    input.value = 'несуществующий материал';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
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
  await mount();
  await click('[data-start="1"]');
  const external = currentState();
  external.revision += 1;
  external.sessions['exam:2'] = makeAttempt(2, questions);
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
  await mount();
  await go('#/history');
  const input = get('input[type="file"]');
  const file = new window.File([JSON.stringify(makeBackup(backupState))], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(get('[role="dialog"]'));
  assert.equal(storage.getItem(key), null);
  await click(findButton('Восстановить'));
  assert.equal(currentState().history.length, 1);
  assert.equal(currentState().history[0].level, 2);
  assert.ok(currentState().sessions['exam:3']);
});

test('Ссылка перехода к содержимому не покидает текущий экзамен', async () => {
  await mount();
  await click('[data-start="1"]');
  const before = window.location.hash;
  await click('.skip-link');
  assert.equal(window.location.hash, before);
  assert.ok(get('.question-prompt'));
});

test('Фильтры истории: клавиатура, отмена выбора и совместная фильтрация уровня и режима', async () => {
  const initial = freshState();
  initial.history.push(finishAttempt(makeAttempt(1, questions)));
  initial.history.push(finishAttempt(makeAttempt(2, questions, 'mistakes', [questions.find((q) => q.level === 2).id])));
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go('#/history');
  const level = get('[role="combobox"][aria-label="Уровень в истории"]');
  const mode = get('[role="combobox"][aria-label="Режим в истории"]');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 2);

  await act(() => level.focus());
  await press(level, 'ArrowDown');
  assert.equal(level.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, level);
  assert.equal(document.getElementById(level.getAttribute('aria-activedescendant')).textContent, 'Все уровни');
  await press(level, 'End');
  assert.equal(document.getElementById(level.getAttribute('aria-activedescendant')).textContent, 'Уровень 3');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 2);
  await press(level, 'Escape');
  assert.equal(level.getAttribute('aria-expanded'), 'false');
  assert.equal(level.hasAttribute('aria-activedescendant'), false);
  assert.match(level.textContent, /Все уровни/);

  // Повторение буквы циклически находит следующие подходящие варианты.
  await press(level, 'у');
  await press(level, 'у');
  assert.equal(document.getElementById(level.getAttribute('aria-activedescendant')).textContent, 'Уровень 2');
  await press(level, 'Enter');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  assert.match(get('.history-title small').textContent, /Работа над ошибками/);
  assert.equal(get('select[aria-label="Уровень в истории"]').value, '2');

  await click(level);
  await press(level, 'Home');
  await press(level, 'ArrowDown');
  await press(level, 'Tab');
  assert.match(level.textContent, /Уровень 1/);
  assert.match(get('.history-title small').textContent, /Полный экзамен/);
  await click(mode);
  await click('[role="option"]:last-child');
  assert.match(text(), /Нет попыток с такими условиями/);
  assert.equal(document.activeElement, mode);

  // Системный мобильный выбор обновляет то же состояние и подпись десктопного поля.
  const native = get('select[aria-label="Уровень в истории"]');
  await act(() => {
    native.value = 'all';
    native.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.match(level.textContent, /Все уровни/);
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);

  await click(level);
  const firstListId = level.getAttribute('aria-controls');
  await act(() => mode.focus());
  await click(mode);
  assert.notEqual(mode.getAttribute('aria-controls'), firstListId);
  assert.equal(container.querySelectorAll('[role="listbox"]').length, 1);
});

test('Кастомный фильтр домена сохраняет разбор и сбрасывается вместе с фильтром результата', async () => {
  const initial = freshState();
  const attempt = finishAttempt(makeAttempt(1, questions));
  initial.history.push(attempt);
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go(`#/results/${attempt.id}`);
  const domain = get('[role="combobox"][aria-label="Фильтр по домену"]');
  assert.equal(container.querySelectorAll('.review-item').length, 60);
  await click(domain);
  await click('[role="option"]:nth-child(3)');
  const expected = new Set(questions.filter((q) => q.level === 1 && q.domain === 2).map((q) => q.prompt));
  assert.equal(container.querySelectorAll('.review-item').length, 10);
  assert.ok(
    [...container.querySelectorAll('.review-question > strong')].every((node) => expected.has(node.textContent)),
  );
  assert.equal(get('select[aria-label="Фильтр по домену"]').value, '2');

  // Стрелки исследуют список; потеря фокуса подтверждает активный вариант один раз.
  await click(domain);
  await press(domain, 'Home');
  const outside = findButton('Верно 0');
  await act(() => {
    outside.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    outside.focus();
  });
  assert.equal(domain.getAttribute('aria-expanded'), 'false');
  assert.equal(container.querySelectorAll('.review-item').length, 60);
  assert.equal(document.activeElement, outside);

  await click(domain);
  await press(domain, 'End');
  await press(domain, 'Enter');
  await click(outside);
  assert.match(text(), /В этой подборке нет вопросов/);
  await click(findButton('Показать все ответы'));
  assert.match(domain.textContent, /Все домены/);
  assert.equal(get('select[aria-label="Фильтр по домену"]').value, 'all');
  assert.equal(container.querySelectorAll('.review-item').length, 60);

  // На мобильном CSS скрывает кнопку и вызывает blur раньше resize: кандидат не должен подтвердиться.
  await click(domain);
  await press(domain, 'End');
  const originalMatchMedia = window.matchMedia;
  try {
    window.matchMedia = () => ({ matches: true });
    await act(() => domain.blur());
  } finally {
    window.matchMedia = originalMatchMedia;
  }
  assert.equal(domain.getAttribute('aria-expanded'), 'false');
  assert.equal(get('select[aria-label="Фильтр по домену"]').value, 'all');
  assert.equal(container.querySelectorAll('.review-item').length, 60);
  assert.equal(document.activeElement, get('select[aria-label="Фильтр по домену"]'));
});
