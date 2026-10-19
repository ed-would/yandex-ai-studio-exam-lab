import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window as HappyWindow } from 'happy-dom';
import type {
  AppState,
  Attempt,
  ChoiceQuestion,
  MatchQuestion,
  Question,
  QuestionOption,
  StorageLike,
  Timing,
} from '../src/types.ts';

// Проверка DOM и пользовательских событий без запуска браузера или preview-сервера.
const window = new HappyWindow({ url: 'https://example.test/repository/' }) as unknown as Window & typeof globalThis;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  ResizeObserver: window.ResizeObserver,
});
(window as unknown as { scrollTo: () => void }).scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
const { render } = await import('preact');
const { act } = await import('preact/test-utils');
const { formatPercent, h, Fragment } = await import('../src/components/ui.tsx');
// JSX factory bindings are emitted by the classic JSX transform.
void h;
void Fragment;
const { App } = await import('../src/app.tsx');
const { freshState, makeBackup, writeTabProgress } = await import('../src/core/storage.ts');
const { makeAttempt, finishAttempt, moveCursor, scoreAttempt, setDraft, submitAnswer } =
  await import('../src/core/exam.ts');
const { CompletionConfetti } = await import('../src/components/completion-confetti.tsx');
const { BANK_VERSION } = await import('../src/data/meta.ts');
type ImageVariant = { width?: number; height?: number; variants: [number, string][] };
const imageVariants = JSON.parse(
  readFileSync(new URL('../src/data/image-variants.json', import.meta.url), 'utf8'),
) as Record<string, ImageVariant>;
const { ResultsPreview, preparePreviewRoute } = await import('../src/dev/results-preview.tsx');
const questions: Question[] = Array.from(
  { length: 6 },
  (_, index) =>
    JSON.parse(readFileSync(new URL(`../src/data/domain-${index + 1}.json`, import.meta.url), 'utf8')) as Question[],
)
  .flat()
  .sort((a: Question, b: Question) => a.level - b.level || a.domain - b.domain || a.id.localeCompare(b.id));
const key = 'test-ai-basics-trainer';
let container: HTMLElement;
let storage: MemoryStorage;

type Download = { name: string; blob: Blob };
type MediaListener = (event: MediaQueryListEvent) => void;
type LockSave = () => void | Promise<void>;

const isChoiceQuestion = (question: Question): question is ChoiceQuestion => question.type !== 'match';
const isMatchQuestion = (question: Question): question is MatchQuestion => question.type === 'match';
const choice = (question: Question | undefined): ChoiceQuestion => {
  assert.ok(question && isChoiceQuestion(question), 'Ожидался вопрос с вариантами ответа');
  return question;
};
const match = (question: Question | undefined): MatchQuestion => {
  assert.ok(question && isMatchQuestion(question), 'Ожидался вопрос на сопоставление');
  return question;
};
const questionAt = (index: number): Question => {
  const question = questions[index];
  assert.ok(question, `Вопрос не найден: ${index}`);
  return question;
};
const firstChoice = (): ChoiceQuestion => choice(questionAt(0));
const questionById = (id: string): Question => {
  const question = questions.find((item) => item.id === id);
  assert.ok(question, `Вопрос не найден: ${id}`);
  return question;
};
const historyAt = (index: number): Attempt => {
  const history = currentState().history;
  const attempt = history[index < 0 ? history.length + index : index];
  assert.ok(attempt, `Попытка не найдена: ${index}`);
  return attempt;
};
const timingOf = (attempt: Attempt): Timing => {
  assert.ok(attempt.timing);
  return attempt.timing;
};
const matchDraft = (attemptId: string, questionId: string): Record<string, string> => {
  const response = currentState().sessions[attemptId]?.drafts[questionId];
  assert.ok(response && !Array.isArray(response));
  return response;
};
const choiceDraft = (attemptId: string, questionId: string): string[] => {
  const response = currentState().sessions[attemptId]?.drafts[questionId];
  assert.ok(Array.isArray(response));
  return response;
};
const responseFor = (question: Question): string[] | Record<string, string> =>
  isMatchQuestion(question) ? { ...question.pairs } : [...question.correct];
const clearLocks = (): void => {
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
};
const takeRequest = (requests: LockSave[]): LockSave => {
  const request = requests.shift();
  assert.ok(request);
  return request;
};

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(name: string): string | null {
    return this.map.get(name) ?? null;
  }
  setItem(name: string, value: string): void {
    this.map.set(name, String(value));
  }
  removeItem(name: string): void {
    this.map.delete(name);
  }
}
const currentState = (): AppState => JSON.parse(storage.getItem(key) as string) as AppState;
const get = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const node = container.querySelector<T>(selector);
  assert.ok(node, `Элемент не найден: ${selector}`);
  return node;
};
const query = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T => {
  const node = root.querySelector<T>(selector);
  assert.ok(node, `Элемент не найден: ${selector}`);
  return node;
};
const focused = (): Element => {
  const node = document.activeElement;
  assert.ok(node);
  return node;
};
// Semantic checks ignore typographic spaces; typography.test.tsx checks them exactly.
const readText = (node: Element): string => (node.textContent ?? '').replace(/[\u00a0\u202f]/g, ' ');
const text = () => readText(container);
const attr = (node: Element, name: string): string => {
  const value = node.getAttribute(name);
  assert.ok(value !== null, `Атрибут не найден: ${name}`);
  return value;
};
const click = async (selectorOrNode: string | Element | null | undefined) => {
  const node = typeof selectorOrNode === 'string' ? get(selectorOrNode) : selectorOrNode;
  assert.ok(node, 'Элемент для клика не найден');
  assert.ok(node instanceof HTMLElement, 'Элемент не поддерживает click()');
  await act(async () => {
    node.click();
    await Promise.resolve();
  });
};
const press = async (node: Element, key: string) => {
  await act(() => {
    node.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};
const findButton = (value: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => readText(b).trim() === value);
const button = (value: string): HTMLButtonElement => {
  const node = findButton(value);
  assert.ok(node, `Кнопка не найдена: ${value}`);
  return node;
};
const go = async (hash: string) => {
  await act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  });
};
const mount = async () => {
  await act(() => render(<App questions={questions} storage={storage} storageName={key} />, container));
};
const unmount = async () => {
  await act(() => render(null, container));
};

beforeEach(async () => {
  storage = new MemoryStorage();
  window.location.hash = '#/';
  document.body.innerHTML = '<div id="test-app"></div>';
  const root = document.getElementById('test-app');
  assert.ok(root);
  container = root;
});
afterEach(async () => {
  await unmount();
});

test('смена страницы переносит фокус в содержимое, сохраняя фокус вопросов и внутренних действий', async () => {
  const state = freshState();
  state.sessions['exam:1'] = makeAttempt(1, questions);
  const result = finishAttempt(makeAttempt(1, questions));
  state.history.push(result);
  storage.setItem(key, JSON.stringify(state));
  await mount();
  const navigation = get('.primary-nav a[href="#/history"]');
  navigation.focus();
  await go(attr(navigation, 'href'));
  assert.equal(document.activeElement, get('h1'));
  await go('#/study');
  assert.equal(document.activeElement, get('h1'));
  const search = get<HTMLInputElement>('.source-search input');
  search.focus();
  await act(() => {
    search.value = 'модель';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(document.activeElement, search);
  const theme = get('.theme-toggle');
  theme.focus();
  await click(theme);
  assert.equal(document.activeElement, theme);
  await go('#levels');
  assert.equal(document.activeElement, theme);
  await go('#/exam/1');
  assert.equal(document.activeElement, get('.question-prompt'));
  await click(`input[value="${choice(questionAt(0)).correct[0]}"]`);
  const bookmark = get('.bookmark-button');
  bookmark.focus();
  await click(bookmark);
  assert.equal(document.activeElement, bookmark);
  await go(`#/results/${result.id}`);
  assert.equal(document.activeElement, get('h1'));
  await click(findButton('Разобрать ответы'));
  assert.equal(document.activeElement, get('#results-review-title'));
  await go('#/');
  assert.equal(document.activeElement, get('h1'));
});

test('индикатор меню следует за текстом активного пункта при навигации и изменении размера', async (t) => {
  let scale = 1;
  const original = window.HTMLElement.prototype.getBoundingClientRect;
  t.mock.method(window.HTMLElement.prototype, 'getBoundingClientRect', function (this: HTMLElement) {
    if (this.matches('.primary-nav')) return new window.DOMRect(10, 0, 300 * scale, 48);
    if (this.matches('.primary-nav .nav-label')) {
      const index = [...this.closest('nav')!.querySelectorAll('.nav-label')].indexOf(this);
      const width = (40 + index * 20) * scale;
      return new window.DOMRect(10 + (index * 100 + (100 - (40 + index * 20)) / 2) * scale, 0, width, 20);
    }
    return original.call(this);
  });
  await mount();
  const navigation = get('.primary-nav');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-left'), '30px');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-width'), '40px');
  await go('#/history');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-left'), '120px');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-width'), '60px');
  scale = 1.5;
  await act(() => {
    window.dispatchEvent(new window.Event('resize'));
  });
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-left'), '180px');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-width'), '90px');
  await go('#/study');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-left'), '315px');
  assert.equal(navigation.style.getPropertyValue('--nav-indicator-width'), '120px');
});

test('страница без заголовка h1 получает фокус на main при смене маршрута', async () => {
  await mount();
  await go('#/results/missing-result');
  assert.equal(container.querySelector('h1'), null);
  assert.equal(document.activeElement, get('#main-content'));
  await go('#/exam/2');
  assert.equal(document.activeElement, get('#main-content'));
});

test('пустое повреждённое сохранение скачивается без подмены текущим прогрессом', async (t) => {
  const downloads: Download[] = [];
  let blob: Blob = new Blob();
  t.mock.method(URL, 'createObjectURL', (value: Blob | MediaSource) => {
    blob = value instanceof Blob ? value : new Blob();
    return 'blob:audit-original';
  });
  t.mock.method(window.HTMLAnchorElement.prototype, 'click', function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob });
  });
  storage.setItem(key, '');
  await mount();
  await click(findButton('Скачать исходную копию'));
  await click(findButton('Скачать текущий прогресс'));
  assert.equal(downloads[0].name, 'ai-basics-exam-trainer-original-data.json');
  assert.equal(downloads[0].blob.size, 0);
  assert.equal(await downloads[0].blob.text(), '');
  assert.equal(downloads[1].name, 'ai-basics-exam-trainer-backup.json');
  assert.equal(JSON.parse(await downloads[1].blob.text()).state.bankVersion, BANK_VERSION);
  assert.equal(storage.getItem(key), '');
});

test('процент показывает десятые и не добавляет ноль к целому значению', () => {
  assert.equal(formatPercent(65.8), '65,8');
  assert.equal(formatPercent(80), '80');
  assert.equal(formatPercent(100), '100');
});

test('макеты переключают уровни и результаты, переживают повторный монтаж и не меняют настоящий прогресс', async (t) => {
  const realKey = 'ai-practicum:v1:/';
  const before = window.localStorage.getItem(realKey);
  t.after(() =>
    before === null ? window.localStorage.removeItem(realKey) : window.localStorage.setItem(realKey, before),
  );
  const realState = freshState();
  realState.history.push(finishAttempt(makeAttempt(3, questions)));
  const raw = JSON.stringify(realState);
  window.localStorage.setItem(realKey, raw);
  preparePreviewRoute();
  const previewMount = () => act(() => render(<ResultsPreview questions={questions} />, container));
  await previewMount();
  assert.equal(window.location.hash, '#/results/preview-1-target80');
  assert.equal(readText(get('.score-number')), '80%');
  await click(findButton('Следующий'));
  assert.equal(window.location.hash, '#/results/preview-1-below95');
  assert.equal(readText(get('.score-number')), '93,3%');
  const select = get<HTMLSelectElement>('select[aria-label="Тест для просмотра"]');
  await act(() => {
    select.value = '3';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(window.location.hash, '#/results/preview-3-below95');
  assert.ok(get('.results-page.theme-3'));
  assert.equal(readText(get('.score-number')), '93,3%');
  await unmount();
  await previewMount();
  assert.equal(readText(get('.score-number')), '93,3%');
  await go('#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 36);
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(container.querySelector('.history-table'), null);
  await click(findButton('Открыть результат'));
  assert.equal(readText(get('.score-number')), '93,3%');
  await go('#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 36);
  assert.equal(window.localStorage.getItem(realKey), raw);
});

test('переключатель обновляет тему и иллюстрации, сохраняя текущий тест и черновик', async (t) => {
  const downloads: Download[] = [];
  let blob: Blob = new Blob();
  t.mock.method(URL, 'createObjectURL', (value: Blob | MediaSource) => {
    assert.ok(value instanceof Blob);
    blob = value;
    return 'blob:theme-report';
  });
  t.mock.method(window.HTMLAnchorElement.prototype, 'click', function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob });
  });
  const initial = freshState();
  const attempt = makeAttempt(1, questions);
  const q = choice(questionById(attempt.questionIds[0]));
  attempt.drafts[q.id] = [q.options[0].id];
  initial.sessions['exam:1'] = attempt;
  const completed = finishAttempt(makeAttempt(1, questions));
  initial.history.push(completed);
  storage.setItem(key, JSON.stringify(initial));
  window.localStorage.removeItem('ai-basics-exam-trainer:theme');
  runInNewContext(readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8'), { window, document });
  await mount();
  await go('#/exam/1');
  const saved = storage.getItem(key);
  const root = document.documentElement;
  const before = root.dataset.theme;
  await click('.theme-toggle');
  assert.notEqual(root.dataset.theme, before);
  assert.equal(get('.theme-toggle').getAttribute('aria-pressed'), String(root.dataset.theme === 'dark'));
  await go('#/');
  await click('.restart-link');
  assert.match(get('.modal-copy').textContent, /уровня 1\u00a0будет/);
  assert.match(get('.modal-copy').textContent, /проверено 0\u00a0из\u00a060\u00a0вопросов/);
  await click(button('Отмена'));
  const heroSource = container.querySelector<HTMLSourceElement>('.hero-visual .generative-art source');
  assert.equal(heroSource?.media, root.dataset.theme === 'dark' ? 'all' : undefined);
  assert.match(attr(get('.hero-visual img'), 'src'), /images\/artwork\/hero-ribbon-expanded\.webp$/);
  for (const image of container.querySelectorAll('.generative-art img, .section-backdrop img, .brand-symbol img')) {
    const source = attr(image, 'src').replace(/^\.\/images\//, '');
    assert.ok(
      Object.values(imageVariants).some(({ variants }) => variants.at(-1)?.[1] === source),
      source,
    );
  }
  for (const image of container.querySelectorAll('img[srcset], source[srcset]')) {
    for (const candidate of attr(image, 'srcset').split(', ')) {
      const source = candidate.split(' ')[0].replace(/^\.\/images\//, '');
      assert.ok(
        Object.values(imageVariants).some(({ variants }) => variants.some(([, file]) => file === source)),
        source,
      );
    }
  }
  await go('#/exam/1');
  assert.equal(get<HTMLInputElement>('.choice input').checked, true);
  assert.equal(storage.getItem(key), saved);
  assert.equal(window.location.hash, '#/exam/1');
  await go(`#/results/${completed.id}`);
  const reportTheme = root.dataset.theme;
  await click('.theme-toggle');
  assert.notEqual(root.dataset.theme, reportTheme);
  await click('.export-report');
  assert.equal(downloads.length, 1);
  assert.match(await downloads[0].blob.text(), new RegExp(`data-theme="${root.dataset.theme}"`));
  if (root.dataset.theme === 'dark') await click('.theme-toggle');
  window.localStorage.removeItem('ai-basics-exam-trainer:theme');
});

test('рекомендация открывает разбор именно ошибочных ответов выбранной темы и переносит фокус', async () => {
  let attempt = makeAttempt(1, questions);
  const failed = questions.filter((q) => q.level === 1 && q.domain === 2).slice(0, 2);
  for (const id of attempt.questionIds) {
    const q = questionById(id);
    const response = failed.some((item) => item.id === id)
      ? [choice(q).options.find((o: QuestionOption) => !choice(q).correct.includes(o.id))!.id]
      : responseFor(q);
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
  for (const q of failed) assert.ok(readText(card).includes(q.topic));
  assert.ok(readText(card).includes(failed[0].takeaway));
  await click(card.querySelector('button'));
  assert.equal(focused().id, 'results-review-title');
  assert.equal(get<HTMLSelectElement>('select[aria-label="Фильтр по домену"]').value, '2');
  assert.equal(button('Ошибки 2').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelectorAll('.review-item').length, 2);
  assert.ok(
    [...container.querySelectorAll('.review-question > strong')].every((node) =>
      failed.some((q) => q.prompt === readText(node)),
    ),
  );
  await click(query<HTMLAnchorElement>(card, 'a'));
  await go('#/study/2');
  assert.ok(get('.study-page'));
});

test('досрочная попытка выше 80% показывает пропуски и не предлагает следующий уровень', async () => {
  let attempt = makeAttempt(1, questions);
  for (const id of attempt.questionIds.slice(0, 50)) {
    const q = questionById(id);
    attempt = submitAnswer(attempt, q, responseFor(q));
  }
  attempt = finishAttempt(attempt);
  const initial = freshState();
  initial.history.push(attempt);
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go(`#/results/${attempt.id}`);
  assert.match(readText(get('.achievement-label')), /досрочно/);
  assert.equal(container.querySelectorAll('.coaching-card').length, 0);
  assert.equal(findButton('К уровню 2'), undefined);
  assert.match(readText(get('.competency-untested')), /Не проверено/);
  await click(get('.unanswered-summary-action'));
  assert.equal(container.querySelectorAll('.review-item.status-unanswered').length, 10);
  assert.equal(button('Пропущено 10').getAttribute('aria-pressed'), 'true');
});

test('хлопушка появляется после завершения и не повторяется при фильтрации, возврате или перезапуске', async () => {
  let attempt = makeAttempt(1, questions);
  for (const id of attempt.questionIds) {
    const q = questionById(id);
    attempt = submitAnswer(attempt, q, responseFor(q));
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

test('карточки прогресса сохраняют места результата и диаграммы без выдуманных баллов', async () => {
  await mount();
  await go('#/history');
  assert.equal(container.querySelectorAll('.stats-value-empty').length, 3);
  assert.equal(container.querySelectorAll('.mini-chart-empty').length, 3);
  assert.equal(container.querySelectorAll('.chart-column').length, 0);
  assert.ok([...container.querySelectorAll('.stats-value')].every((node) => readText(node) === '–пока нет результата'));
  await unmount();

  const empty = finishAttempt(makeAttempt(1, questions));
  const answeredQuestion = choice(questions.find((question) => question.level === 1 && question.type === 'single'));
  const answered = finishAttempt(
    submitAnswer(makeAttempt(1, questions), answeredQuestion, [
      answeredQuestion.options.find((option) => !answeredQuestion.correct.includes(option.id))!.id,
    ]),
  );
  const initial = freshState();
  initial.history.push(empty, answered, finishAttempt(makeAttempt(2, questions)));
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go('#/history');

  assert.equal(container.querySelectorAll('.stats-value').length, 3);
  assert.equal(container.querySelectorAll('.mini-chart').length, 3);
  assert.equal(readText(get('.stats-card.theme-1 .stats-value')), '0%лучший результат');
  for (const level of [2, 3]) {
    const card = get(`.stats-card.theme-${level}`);
    assert.equal(readText(query(card, '.stats-value')), '–пока нет результата');
    assert.equal(query(card, '.mini-chart').getAttribute('aria-label'), 'Нет данных о результатах попыток');
    assert.equal(card.querySelector('.chart-column'), null);
    assert.equal(Boolean(card.querySelector('.stats-card-footer button')), level === 2);
  }
});

test('хлопушка учитывает reduced motion, останавливается по таймеру и снимает обработчики', async () => {
  const matchMedia = window.matchMedia;
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;
  let listener: MediaListener | undefined;
  let stopped: (() => void) | undefined;
  let cleared = false;
  let removed: MediaListener | undefined;
  let consumed = 0;
  const motion = {
    matches: true,
    addEventListener: (_: string, handler: MediaListener) => {
      listener = handler;
    },
    removeEventListener: (_: string, handler: MediaListener) => {
      removed = handler;
    },
  } as unknown as MediaQueryList;
  const onConsumed = () => {
    consumed++;
  };
  try {
    window.matchMedia = () => motion;
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 3800) {
        stopped =
          typeof callback === 'function' ? () => (callback as (...values: unknown[]) => void)(...args) : undefined;
        return 12345;
      }
      return Reflect.apply(setTimeout, window, [callback, delay, ...args]) as ReturnType<typeof setTimeout>;
    }) as typeof window.setTimeout;
    window.clearTimeout = (id) => {
      if (id === 12345) cleared = true;
      else clearTimeout.call(window, id);
    };
    await act(() => render(<CompletionConfetti enabled={true} onConsumed={onConsumed} />, container));
    assert.equal(consumed, 1);
    assert.equal(container.querySelector('.completion-confetti'), null);
    assert.equal(stopped, undefined);
    await unmount();
    (motion as unknown as { matches: boolean }).matches = false;
    await act(() => render(<CompletionConfetti enabled={true} onConsumed={onConsumed} />, container));
    assert.equal(container.querySelectorAll('.completion-confetti i').length, 64);
    assert.ok(listener);
    const onChange = listener;
    await act(() => onChange({ matches: true } as MediaQueryListEvent));
    assert.equal(container.querySelector('.completion-confetti'), null);
    await unmount();
    assert.equal(cleared, true);
    assert.equal(removed, listener);
    await act(() => render(<CompletionConfetti enabled={true} onConsumed={onConsumed} />, container));
    assert.equal(container.querySelectorAll('.completion-confetti i').length, 64);
    assert.ok(stopped);
    const stop = stopped as () => void;
    await act(() => {
      stop();
    });
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
  const q = choice(questions.find((q) => q.level === 1));
  assert.equal(get<HTMLButtonElement>('[data-action="check-answer"]').disabled, true);
  const wrong = q.options.find((o) => !q.correct.includes(o.id));
  assert.ok(wrong);
  await click(`input[value="${wrong.id}"]`);
  assert.equal(get<HTMLButtonElement>('[data-action="check-answer"]').disabled, false);
  await click('[data-action="check-answer"]');
  assert.ok(get('.feedback.incorrect'));
  assert.match(text(), new RegExp(q.takeaway.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok([...container.querySelectorAll<HTMLInputElement>('.choice input')].every((i) => i.disabled));
  assert.equal(get<HTMLDetailsElement>('.feedback .reasoning-details').open, true);
  const original = JSON.stringify(currentState().sessions['exam:1'].answers[q.id]);
  await click(`input[value="${q.correct[0]}"]`);
  assert.equal(JSON.stringify(currentState().sessions['exam:1'].answers[q.id]), original);
  assert.equal(currentState().sessions['exam:1'].answers[q.id].correct, false);
  assert.ok(container.querySelectorAll('.feedback-sources a').length >= 1);
});

test('Мультивыбор принимает пять ответов и не раскрывает решение до проверки', async () => {
  await mount();
  await click('[data-start="1"]');
  const q = choice(
    questions.find((q) => q.level === 1 && q.type === 'multi' && isChoiceQuestion(q) && q.correct.length === 5),
  );
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
  const q = match(qs.find((q) => q.type === 'match'));
  await click(`[data-question-index="${qs.indexOf(q)}"]`);
  const [l1, l2] = q.left,
    [r1, r2] = q.right;
  assert.equal(get<HTMLButtonElement>('[data-action="check-answer"]').disabled, true);
  // Можно начать с правой колонки.
  await click(`[data-right="${r1.id}"]`);
  await click(`[data-left="${l1.id}"]`);
  assert.equal(matchDraft('exam:1', q.id)[l1.id], r1.id);
  await click(`[data-left="${l2.id}"]`);
  await click(`[data-right="${r1.id}"]`);
  let pairs = matchDraft('exam:1', q.id);
  assert.equal(pairs[l1.id], undefined);
  assert.equal(pairs[l2.id], r1.id);
  await click('.disconnect');
  assert.deepEqual(matchDraft('exam:1', q.id), {});
  // Повторное указание уже созданной пары разрывает связь.
  await click(`[data-left="${l1.id}"]`);
  await click(`[data-right="${r2.id}"]`);
  await click(`[data-right="${r2.id}"]`);
  await click(`[data-left="${l1.id}"]`);
  assert.deepEqual(matchDraft('exam:1', q.id), {});
  for (const left of q.left) {
    await click(`[data-left="${left.id}"]`);
    await click(`[data-right="${q.pairs[left.id]}"]`);
  }
  assert.equal(get<HTMLButtonElement>('[data-action="check-answer"]').disabled, false);
  assert.equal(container.querySelectorAll('.match-lines path').length, q.left.length);
  await click('[data-action="check-answer"]');
  assert.ok(get('.feedback.correct'));
  assert.ok([...container.querySelectorAll<HTMLButtonElement>('.match-node')].every((b) => b.disabled));
  assert.equal(container.querySelectorAll('.pair-explanation').length, q.left.length);
});

test('Сопоставление сохраняет единое состояние в мобильных select и блокирует пары после проверки', async () => {
  await mount();
  await click('[data-start="1"]');
  const qs = questions.filter((q) => q.level === 1);
  const q = match(qs.find((q) => q.type === 'match'));
  await click(`[data-question-index="${qs.indexOf(q)}"]`);

  const selects = () => [...container.querySelectorAll<HTMLSelectElement>('.match-mobile-select')];
  assert.equal(selects().length, q.left.length);
  assert.equal(container.querySelectorAll('.match-mobile-row p').length, 0);
  assert.ok(selects().every((select) => !select.classList.contains('paired')));
  const pairProgress = () => query(container, '.match-status [role="progressbar"]');
  assert.equal(pairProgress().getAttribute('aria-valuenow'), '0');
  assert.equal(pairProgress().getAttribute('aria-valuemax'), String(q.left.length));
  assert.ok(selects().every((select) => select.options.length === q.right.length + 1));
  assert.ok(
    selects().every((select, index) => {
      const left = q.left[index];
      assert.ok(left);
      return attr(select, 'aria-label') === `Соответствие для: ${left.text}`;
    }),
  );
  assert.equal(container.querySelectorAll('.match-board-desktop .match-node').length, q.left.length + q.right.length);

  const change = async (index: number, value: string) => {
    await act(() => {
      const select = selects()[index];
      assert.ok(select);
      select.value = value;
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
  };
  await change(0, q.right[0].id);
  await change(1, q.right[1].id);
  assert.deepEqual(matchDraft('exam:1', q.id), {
    [q.left[0].id]: q.right[0].id,
    [q.left[1].id]: q.right[1].id,
  });
  assert.ok(selects()[0].classList.contains('paired'));
  assert.ok(selects()[1].classList.contains('paired'));
  assert.equal(pairProgress().getAttribute('aria-valuenow'), '2');

  // Выбор занятого определения заменяет предыдущую связь.
  await change(1, q.right[0].id);
  assert.deepEqual(matchDraft('exam:1', q.id), { [q.left[1].id]: q.right[0].id });
  assert.ok(!selects()[0].classList.contains('paired'));
  assert.equal(pairProgress().getAttribute('aria-valuenow'), '1');
  assert.ok(selects()[1].classList.contains('paired'));
  // Пустой option удаляет связь и подсветку, а resize не меняет черновик.
  await change(1, '');
  assert.deepEqual(matchDraft('exam:1', q.id), {});
  assert.ok(selects().every((select) => !select.classList.contains('paired')));
  await change(0, q.right[1].id);
  await act(() => {
    window.dispatchEvent(new window.Event('resize'));
  });
  assert.deepEqual(matchDraft('exam:1', q.id), { [q.left[0].id]: q.right[1].id });
  await click('.clear-pairs');
  assert.deepEqual(matchDraft('exam:1', q.id), {});

  // Полный корректный ответ блокирует обе презентации и сохраняет выбранные значения.
  for (const [index, left] of q.left.entries()) await change(index, q.pairs[left.id]);
  assert.equal(get<HTMLButtonElement>('[data-action="check-answer"]').disabled, false);
  await click('[data-action="check-answer"]');
  assert.ok(get('.feedback.correct'));
  assert.ok(selects().every((select) => select.disabled));
  assert.equal(container.querySelectorAll('.match-mobile-row p').length, 0);
  assert.ok(selects().every((select) => select.classList.contains('paired')));
  assert.ok(
    [...container.querySelectorAll<HTMLButtonElement>('.match-board-desktop .match-node')].every(
      (node) => node.disabled,
    ),
  );
});

test('Черновик, ответ, текущая позиция и закладка переживают перезапуск приложения', async () => {
  await mount();
  await click('[data-start="2"]');
  const qs = questions.filter((q): q is ChoiceQuestion => q.level === 2 && isChoiceQuestion(q));
  await click(`input[value="${qs[0].correct[0]}"]`);
  await click('[data-action="check-answer"]');
  await click('[data-action="next-question"]');
  await click(`input[value="${qs[1].correct[0]}"]`);
  await click('.bookmark-button');
  const id = currentState().sessions['exam:2'].id;
  await unmount();
  await mount();
  assert.equal(readText(get('.question-prompt')), qs[1].prompt);
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
  const q = choice(questions.find((q) => q.level === 1));
  await click(`input[value="${q.correct[0]}"]`);
  await click(findButton('Завершить'));
  assert.match(readText(get('[role="dialog"]')), /60 непроверенных/);
  await click(findButton('Завершить и посмотреть балл'));
  assert.ok(get('.results-page'));
  assert.equal(currentState().history.length, 1);
  assert.equal(currentState().sessions['exam:1'], undefined);
  assert.equal(scoreAttempt(currentState().history[0], questions).correct, 0);
  assert.equal(container.querySelectorAll('.review-item').length, 60);
  assert.equal(container.querySelectorAll('.review-item.status-unanswered').length, 60);
  await click('.review-item summary');
  assert.ok(get('.review-item .feedback-sources a'));
  assert.equal(get('.achievement-label [data-icon="seed"]').querySelectorAll('path').length, 3);
  await click(findButton('Повторить ошибки и пропуски (60)'));
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
      assert.equal(readText(get('.question-prompt')), q.prompt, q.id);
      if (q.type === 'match') {
        for (const left of q.left) {
          await click(`[data-left="${left.id}"]`);
          await click(`[data-right="${q.pairs[left.id]}"]`);
        }
      } else {
        for (const id of q.correct) await click(`input[value="${id}"]`);
      }
      assert.equal(get<HTMLButtonElement>('[data-action="check-answer"]').disabled, false, q.id);
      await click('[data-action="check-answer"]');
      assert.ok(container.querySelector('.feedback.correct'), q.id);
      assert.equal(Object.keys(currentState().sessions[`exam:${level}`].answers).length, index + 1);
      await click('[data-action="next-question"]');
    }
    assert.ok(get('.results-page'));
    assert.equal(container.querySelectorAll('.review-item.status-correct').length, 60);
    const result = historyAt(-1);
    assert.equal(result.level, level);
    assert.equal(scoreAttempt(result, questions).percent, 100);
  }
  assert.equal(currentState().history.length, 3);
  await go('#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 3);
  assert.equal(container.querySelectorAll('.stats-value').length, 3);
  assert.ok([...container.querySelectorAll('.stats-value')].every((node) => readText(node).includes('100%')));
  assert.equal(container.querySelectorAll('.mini-chart[role="group"]').length, 3);
  assert.ok(
    [...container.querySelectorAll('.chart-column')].every((node) =>
      attr(node, 'aria-label').includes('Открыть разбор результата'),
    ),
  );
});

test('пустой прогресс скрывает очистку, черновик показывает её только для своего уровня', async () => {
  for (const raw of [null, JSON.stringify(freshState())]) {
    if (raw !== null) storage.setItem(key, raw);
    await mount();
    await go('#/history');
    assert.equal(container.querySelector('.history-filters'), null);
    assert.equal(container.querySelector('[aria-label^="Очистить результаты уровня"]'), null);
    assert.equal(findButton('Очистить все результаты'), undefined);
    await unmount();
  }

  await mount();
  await go('#/');
  await click('[data-start="1"]');
  await click(`input[value="${firstChoice().correct[0]}"]`);
  await go('#/history');
  assert.equal(container.querySelector('.history-filters'), null);
  assert.ok(get('[aria-label="Очистить результаты уровня 1"]'));
  assert.equal(container.querySelectorAll('[aria-label^="Очистить результаты уровня"]').length, 1);
  assert.match(readText(get('.stats-card-footer')), /0 полных попыток/);
  assert.ok(findButton('Очистить все результаты'));
  await click('[aria-label="Очистить результаты уровня 1"]');
  await click(findButton('Очистить результаты'));
  assert.deepEqual(currentState().sessions, {});
  assert.equal(container.querySelector('[aria-label^="Очистить результаты уровня"]'), null);
  assert.equal(findButton('Очистить все результаты'), undefined);
});

test('очистка учитывает завершённые и незавершённые разборы ошибок независимо от фильтра', async () => {
  const initial = freshState();
  initial.history.push(finishAttempt(makeAttempt(1, questions, 'mistakes', [questions[0].id])));
  initial.sessions['mistakes:2'] = makeAttempt(2, questions, 'mistakes', [
    questionById(questions.find((q) => q.level === 2)!.id).id,
  ]);
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go('#/history');
  const mode = get<HTMLSelectElement>('select[aria-label="Режим в истории"]');
  await act(() => {
    mode.value = 'exam';
    mode.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.match(text(), /Нет попыток с такими условиями/);
  assert.ok(get('[aria-label="Очистить результаты уровня 1"]'));
  assert.ok(get('[aria-label="Очистить результаты уровня 2"]'));
  assert.equal(container.querySelector('[aria-label="Очистить результаты уровня 3"]'), null);
  assert.ok(
    [...container.querySelectorAll('.stats-card-footer')].every((node) => /0 полных попыток/.test(readText(node))),
  );
  await click('[aria-label="Очистить результаты уровня 1"]');
  await click(findButton('Очистить результаты'));
  assert.equal(container.querySelector('[aria-label="Очистить результаты уровня 1"]'), null);
  assert.ok(findButton('Очистить все результаты'));
  await click('[aria-label="Очистить результаты уровня 2"]');
  await click(findButton('Очистить результаты'));
  assert.deepEqual(currentState().sessions, {});
  assert.deepEqual(currentState().history, []);
  assert.equal(findButton('Очистить все результаты'), undefined);
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
  assert.equal(container.querySelector('[aria-label="Очистить результаты уровня 1"]'), null);
  assert.ok(get('[aria-label="Очистить результаты уровня 3"]'));
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(currentState().history.length, 0);
  assert.deepEqual(currentState().sessions, {});
  assert.equal(container.querySelector('[aria-label^="Очистить результаты уровня"]'), null);
  assert.equal(findButton('Очистить все результаты'), undefined);
});

test('Темы фильтруют материалы каждого домена, список можно сбросить и искать', async () => {
  await mount();
  await go('#/study/6');
  assert.match(readText(get('.study-domain-heading h2')), /Алиса AI Про/);
  assert.equal(container.querySelectorAll('.study-nav button').length, 6);
  assert.equal(container.querySelectorAll('.official-grid a').length, 7);
  assert.ok(container.querySelectorAll('.study-sources a').length > 0);
  assert.equal(get<HTMLDetailsElement>('.topic-coverage').open, false);
  for (const button of [...container.querySelectorAll('.study-nav button')]) {
    await click(button);
    assert.equal(container.querySelectorAll('.study-guide article').length, 4);
    assert.ok(container.querySelectorAll('.study-sources a').length > 0);
    await click('.topic-coverage > summary');
    assert.equal(get<HTMLDetailsElement>('.topic-coverage').open, true);
    assert.ok(container.querySelectorAll('.topic-tags button').length > 0);
    const topicButton = get('.topic-tags button');
    const topic = readText(topicButton).trim();
    const domainMatch = readText(query(button, 'small')).match(/Домен (\d+)/);
    assert.ok(domainMatch);
    const activeDomain = Number(domainMatch[1]);
    const expectedUrls = questions
      .filter((question) => question.domain === activeDomain && question.topic === topic)
      .flatMap((question) => question.sources.map((source) => source.url));
    const allExpectedUrls = questions
      .filter((question) => question.domain === activeDomain)
      .flatMap((question) => question.sources.map((source) => source.url));
    await click(topicButton);
    assert.equal(get('.topic-tags button').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(
      [...container.querySelectorAll<HTMLAnchorElement>('.study-sources a')].map((link) => link.href).sort(),
      [...new Set(expectedUrls)].sort(),
    );
    await click(findButton('Показать все'));
    assert.deepEqual(
      [...container.querySelectorAll<HTMLAnchorElement>('.study-sources a')].map((link) => link.href).sort(),
      [...new Set(allExpectedUrls)].sort(),
    );
  }
  const input = get<HTMLInputElement>('input[type="search"]');
  await act(() => {
    input.value = 'несуществующий материал';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  assert.equal(container.querySelectorAll('.study-sources a').length, 0);
  assert.match(text(), /Материалов с таким названием нет/);
});

test('все экранные аккордеоны используют общий раскрываемый шаблон', async () => {
  await mount();
  await click('[data-start="1"]');
  const mapToggle = get('.map-toggle');
  const mapPanel = get('.map-body');
  assert.ok(mapToggle.matches('.accordion-trigger'));
  assert.equal(mapToggle.getAttribute('aria-controls'), mapPanel.id);
  assert.ok(mapPanel.matches('.accordion-panel'));
  assert.ok(mapPanel.querySelector(':scope > .accordion-panel-inner'));
  assert.equal(mapToggle.getAttribute('aria-expanded'), 'false');
  await click(mapToggle);
  assert.equal(mapToggle.getAttribute('aria-expanded'), 'true');
  await click(mapToggle);
  assert.equal(mapToggle.getAttribute('aria-expanded'), 'false');

  await go('#/');
  await go('#/study/1');
  const topics = get<HTMLDetailsElement>('.topic-coverage');
  assert.ok(topics.matches('.accordion.accordion--surface'));
  await click(topics.querySelector(':scope > summary'));
  assert.equal(topics.open, true);
  assert.ok(topics.querySelector(':scope > .details-content > .details-content-inner'));
  await click(topics.querySelector(':scope > summary'));
  assert.equal(topics.open, false);

  await unmount();
  const initial = freshState();
  const attempt = finishAttempt(makeAttempt(1, questions));
  initial.history.push(attempt);
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await go(`#/results/${attempt.id}`);

  const scoring = get<HTMLDetailsElement>('.scoring-info');
  assert.ok(scoring.matches('.accordion.accordion--surface.accordion--score'));
  await click(scoring.querySelector(':scope > summary'));
  assert.equal(scoring.open, true);
  assert.ok(scoring.querySelector(':scope > .details-content > .details-content-inner'));

  const review = get<HTMLDetailsElement>('.review-item');
  assert.ok(review.matches('.accordion.accordion--surface.accordion--review'));
  await click(review.querySelector(':scope > summary'));
  assert.equal(review.open, true);
  assert.ok(review.querySelector('.review-feedback.feedback'));
  assert.ok(review.querySelector('.reasoning-details.accordion--surface'));
  await click(review.querySelector(':scope > summary'));
  assert.equal(review.open, false);
});

test('Повреждённое сохранение не стирается автоматически и показывает восстановление', async () => {
  storage.setItem(key, '{broken');
  await mount();
  assert.ok(get('.storage-warning'));
  await go('#/history');
  assert.equal(container.querySelector('[aria-label^="Очистить результаты уровня"]'), null);
  assert.ok(findButton('Очистить все результаты'));
  await go('#/');
  await click('[data-start="1"]');
  await click(`input[value="${firstChoice().correct[0]}"]`);
  assert.equal(storage.getItem(key), '{broken');
  assert.ok(get('.question-prompt'));
});

test('устаревшее сохранение можно скрыть, очистить, затем новый прогресс сохраняется', async () => {
  const oldState = freshState();
  oldState.bankVersion = 'older-question-bank';
  oldState.history.push(finishAttempt(makeAttempt(1, questions)));
  const originalRaw = JSON.stringify(oldState);
  storage.setItem(key, originalRaw);
  await mount();

  assert.match(readText(get('.storage-warning')), /предыдущей версией вопросов/);
  assert.match(readText(get('.storage-warning')), /До очистки новые попытки не сохраняются на устройстве/);
  await click('[data-start="1"]');
  assert.ok(get('.question-prompt'));
  assert.ok(get('.storage-warning'));
  assert.equal(storage.getItem(key), originalRaw);

  await click('[aria-label="Скрыть сообщение"]');
  assert.equal(container.querySelector('.storage-warning'), null);
  const status = get<HTMLButtonElement>('button.local-status');
  assert.match(readText(status), /Проблема с сохранением/);
  assert.equal(status.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, status);
  await click(status);
  await act(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
  const warning = get('.storage-warning');
  assert.equal(status.getAttribute('aria-expanded'), 'true');
  assert.equal(status.getAttribute('aria-controls'), warning.id);
  assert.equal(document.activeElement, warning);
  assert.match(readText(warning), /предыдущей версией вопросов/);
  assert.ok(findButton('Скачать исходную копию'));
  assert.ok(warning.querySelector('a[href="#/history"]'));
  await click(status);
  assert.ok(get('.storage-warning'));
  await click('[aria-label="Скрыть сообщение"]');
  assert.equal(container.querySelector('.storage-warning'), null);
  assert.equal(status.getAttribute('aria-expanded'), 'false');
  assert.equal(storage.getItem(key), originalRaw);

  await unmount();
  await mount();
  assert.ok(get('.storage-warning'));
  await click('.storage-warning .danger-text');
  assert.match(readText(get('[role="dialog"]')), /Будут удалены история всех уровней/);
  await click(findButton('Отмена'));
  assert.equal(storage.getItem(key), originalRaw);
  assert.ok(get('.storage-warning'));
  await click('.storage-warning .danger-text');
  await click(findButton('Очистить результаты'));
  assert.equal(container.querySelector('.storage-warning'), null);
  assert.equal(JSON.parse(storage.getItem(key) ?? '').bankVersion, BANK_VERSION);
  assert.deepEqual(currentState().sessions, {});
  assert.deepEqual(currentState().history, []);
  assert.equal(findButton('Очистить все результаты'), undefined);

  await go('#/');
  await click('[data-start="1"]');
  assert.ok(JSON.parse(storage.getItem(key) ?? '').sessions['exam:1']);
  await unmount();
  await mount();
  assert.equal(container.querySelector('.storage-warning'), null);
  assert.ok(get('.question-prompt'));
});

test('без Web Locks полная очистка снимает блокировку старого банка и предупреждает о памяти только после новой попытки', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    window.localStorage.removeItem(key);
  });
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
  const oldState = freshState();
  oldState.bankVersion = 'older-question-bank';
  window.localStorage.setItem(key, JSON.stringify(oldState));
  await act(() => render(<App questions={questions} storageName={key} tabStorage={null} />, container));
  assert.match(text(), /До очистки новые попытки не сохраняются на устройстве/);
  assert.doesNotMatch(text(), /только в памяти вкладки/);

  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(JSON.parse(window.localStorage.getItem(key) ?? '').bankVersion, BANK_VERSION);
  assert.doesNotMatch(text(), /предыдущей версией вопросов/);
  assert.doesNotMatch(text(), /только в памяти вкладки/);

  await unmount();
  await act(() => render(<App questions={questions} storageName={key} tabStorage={null} />, container));
  assert.equal(container.querySelector('.storage-warning'), null);

  await go('#/');
  await click('[data-start="1"]');
  assert.ok(get('.question-prompt'));
  assert.equal(JSON.parse(window.localStorage.getItem(key) ?? '').sessions['exam:1'], undefined);
  assert.match(text(), /только в памяти вкладки/);
});

test('без Web Locks полная очистка совместимого кэша проверяет источник, отменяется и позволяет начать заново', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const local = new MemoryStorage();
  const tab = new MemoryStorage();
  const durable = { ...freshState(), history: [finishAttempt(makeAttempt(1, questions))] };
  const durableRaw = JSON.stringify(durable);
  local.map.set(key, durableRaw);
  writeTabProgress(tab, key, durableRaw, { ...durable, sessions: { 'exam:2': makeAttempt(2, questions) } });
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
    originalSession.removeItem(`${key}:tab-progress`);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });

  // Пустой кэш над непустым сохранением — ещё не сохранённая очистка.
  writeTabProgress(tab, key, durableRaw, freshState());
  await act(() => render(<App questions={questions} storageName={key} />, container));
  assert.match(readText(get('.storage-warning')), /переживёт обновление только в этой вкладке/);
  await unmount();
  writeTabProgress(tab, key, durableRaw, { ...durable, sessions: { 'exam:2': makeAttempt(2, questions) } });
  await act(() => render(<App questions={questions} storageName={key} />, container));
  assert.match(text(), /переживёт обновление только в этой вкладке/);
  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Отмена'));
  assert.equal(local.getItem(key), durableRaw);
  assert.ok(tab.getItem(`${key}:tab-progress`));
  assert.match(text(), /переживёт обновление только в этой вкладке/);

  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.deepEqual(JSON.parse(local.getItem(key) ?? '').sessions, {});
  assert.deepEqual(JSON.parse(local.getItem(key) ?? '').history, []);
  assert.equal(tab.getItem(`${key}:tab-progress`), null);
  assert.equal(container.querySelector('.storage-warning'), null);
  assert.equal(container.querySelector('.local-status'), null);

  // Предыдущая версия после очистки оставляла пустой вкладочный кэш.
  writeTabProgress(tab, key, local.getItem(key), freshState());
  await unmount();
  await act(() => render(<App questions={questions} storageName={key} />, container));
  assert.equal(container.querySelector('.storage-warning'), null);
  assert.equal(container.querySelector('.local-status'), null);
  await go('#/');
  await click('[data-start="1"]');
  assert.match(text(), /переживёт обновление только в этой вкладке/);
  assert.deepEqual(JSON.parse(local.getItem(key) ?? '').sessions, {});
  assert.ok(tab.getItem(`${key}:tab-progress`));
});

test('без Web Locks полная очистка сохраняет данные при изменении источника или ошибке чтения', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const local = new MemoryStorage();
  const tab = new MemoryStorage();
  const durable = freshState();
  const durableRaw = JSON.stringify(durable);
  const external = { ...freshState(), revision: 1, history: [finishAttempt(makeAttempt(2, questions))] };
  const externalRaw = JSON.stringify(external);
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
    originalSession.removeItem(`${key}:tab-progress`);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });

  for (const failure of ['changed', 'read', 'interleaved']) {
    local.getItem = MemoryStorage.prototype.getItem;
    local.map.set(key, durableRaw);
    writeTabProgress(tab, key, durableRaw, { ...durable, sessions: { 'exam:1': makeAttempt(1, questions) } });
    await act(() => render(<App questions={questions} storageName={key} />, container));
    if (failure === 'changed') local.setItem(key, externalRaw);
    if (failure === 'read')
      local.getItem = () => {
        throw new Error('Storage read blocked');
      };
    if (failure === 'interleaved')
      local.getItem = (name) => {
        const value = local.map.get(name) ?? null;
        local.map.set(key, externalRaw);
        local.getItem = MemoryStorage.prototype.getItem;
        return value;
      };
    await go('#/history');
    await click(findButton('Очистить все результаты'));
    await click(findButton('Очистить результаты'));
    assert.equal(local.map.get(key), failure === 'read' ? durableRaw : externalRaw);
    assert.ok(findButton('Очистить результаты'));
    assert.match(
      text(),
      failure === 'read' ? /Не удалось прочитать сохранения. Очистка отменена/ : /Прогресс изменился в другой вкладке/,
    );
    assert.ok(tab.getItem(`${key}:tab-progress`));
    await unmount();
  }
});

test('ошибка записи при очистке несовместимых данных не показывает успех и сохраняет копию', async () => {
  const oldState = freshState();
  oldState.bankVersion = 'older-question-bank';
  const originalRaw = JSON.stringify(oldState);
  storage.setItem(key, originalRaw);
  await mount();
  storage.setItem = () => {
    throw new Error('Storage full');
  };

  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(storage.getItem(key), originalRaw);
  assert.ok(findButton('Очистить результаты'));
  assert.match(readText(get('.storage-warning')), /Не удалось сохранить прогресс на устройстве/);
  assert.doesNotMatch(text(), /Все результаты удалены/);
});

test('ошибка записи при очистке совместимых данных не закрывает подтверждение', async () => {
  const currentStateWithHistory = freshState();
  currentStateWithHistory.history.push(finishAttempt(makeAttempt(1, questions)));
  const originalRaw = JSON.stringify(currentStateWithHistory);
  storage.setItem(key, originalRaw);
  await mount();
  storage.setItem = () => {
    throw new Error('Storage full');
  };

  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(storage.getItem(key), originalRaw);
  assert.ok(findButton('Очистить результаты'));
  assert.match(readText(get('.storage-warning')), /Не удалось сохранить прогресс на устройстве/);
  assert.doesNotMatch(text(), /Все результаты удалены/);
});

test('Конфликт вкладок не перезаписывает чужой прогресс', async () => {
  await mount();
  await click('[data-start="1"]');
  const external = currentState();
  external.revision += 1;
  external.sessions['exam:2'] = makeAttempt(2, questions);
  storage.setItem(key, JSON.stringify(external));
  await click(`input[value="${firstChoice().correct[0]}"]`);
  assert.ok(get('.storage-warning'));
  assert.match(text(), /Прогресс изменился в другой вкладке/);
  assert.ok(currentState().sessions['exam:2']);
  assert.deepEqual(currentState().sessions['exam:1'].drafts, {});
  await click(findButton('Обновить данные'));
  await click(`input[value="${firstChoice().correct[0]}"]`);
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
  initial.history.push(
    finishAttempt(makeAttempt(2, questions, 'mistakes', [questionById(questions.find((q) => q.level === 2)!.id).id])),
  );
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
  assert.equal(readText(document.getElementById(attr(level, 'aria-activedescendant'))!), 'Все уровни');
  await press(level, 'End');
  assert.equal(readText(document.getElementById(attr(level, 'aria-activedescendant'))!), 'Уровень 3');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 2);
  await press(level, 'Escape');
  assert.equal(level.getAttribute('aria-expanded'), 'false');
  assert.equal(level.hasAttribute('aria-activedescendant'), false);
  assert.match(readText(level), /Все уровни/);

  // Повторение буквы циклически находит следующие подходящие варианты.
  await press(level, 'у');
  await press(level, 'у');
  assert.equal(readText(document.getElementById(attr(level, 'aria-activedescendant'))!), 'Уровень 2');
  await press(level, 'Enter');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  assert.match(readText(get('.history-title small')), /Работа над ошибками/);
  assert.equal(get<HTMLSelectElement>('select[aria-label="Уровень в истории"]').value, '2');

  await click(level);
  await press(level, 'Home');
  await press(level, 'ArrowDown');
  await press(level, 'Tab');
  assert.match(readText(level), /Уровень 1/);
  assert.match(readText(get('.history-title small')), /Полный экзамен/);
  await click(mode);
  await click('[role="option"]:last-child');
  assert.match(text(), /Нет попыток с такими условиями/);
  assert.equal(document.activeElement, mode);

  // Системный мобильный выбор обновляет то же состояние и подпись десктопного поля.
  const native = get<HTMLSelectElement>('select[aria-label="Уровень в истории"]');
  await act(() => {
    native.value = 'all';
    native.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.match(readText(level), /Все уровни/);
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);

  await click(level);
  const firstListId = level.getAttribute('aria-controls');
  await act(() => mode.focus());
  await click(mode);
  assert.notEqual(mode.getAttribute('aria-controls'), firstListId);
  assert.equal(container.querySelectorAll('[role="listbox"]').length, 1);
});

for (const mode of ['exam', 'mistakes'] as const) {
  test(`счётчики фильтров разбора учитывают выбранный домен и всю подборку: ${mode}`, async () => {
    const first = questions
      .filter((q): q is ChoiceQuestion => q.level === 1 && q.domain === 1 && q.type === 'single')
      .slice(0, 3);
    const second = questions
      .filter((q): q is ChoiceQuestion => q.level === 1 && q.domain === 2 && q.type === 'single')
      .slice(0, 2);
    let attempt = makeAttempt(
      1,
      questions,
      mode,
      [...first, ...second].map((q) => q.id),
    );
    attempt = submitAnswer(attempt, first[0], [...first[0].correct]);
    const wrong = first[1]!.options.find((o) => !first[1]!.correct.includes(o.id));
    assert.ok(wrong);
    attempt = submitAnswer(attempt, first[1]!, [wrong.id]);
    attempt = submitAnswer(attempt, second[0], [...second[0].correct]);
    attempt.bookmarks = [first[0].id, first[1].id, second[1].id];
    attempt = finishAttempt(attempt);
    const initial = freshState();
    initial.history.push(attempt);
    storage.setItem(key, JSON.stringify(initial));
    await mount();
    await go(`#/results/${attempt.id}`);

    const labels = ['Все', 'Ошибки', 'Пропущено', 'Верно', 'Закладки'];
    const all = mode === 'exam' ? [60, 1, 57, 2, 3] : [5, 1, 2, 2, 3];
    const cases: Array<[string, number[]]> = [
      ['1', mode === 'exam' ? [10, 1, 8, 1, 2] : [3, 1, 1, 1, 2]],
      ['2', mode === 'exam' ? [10, 0, 9, 1, 1] : [2, 0, 1, 1, 1]],
      ['3', mode === 'exam' ? [10, 0, 10, 0, 0] : [0, 0, 0, 0, 0]],
      ['all', all],
    ];
    const assertCounts = (counts: number[]) =>
      assert.deepEqual(
        [...get('.filter-pills').querySelectorAll('button')].map((button) => readText(button).trim()),
        labels.map((label, index) => `${label} ${counts[index]}`),
      );
    assertCounts(all);
    const wrongReview = get<HTMLDetailsElement>('.review-item.status-incorrect');
    await click(query(wrongReview, ':scope > summary'));
    assert.equal(wrongReview.open, true);
    await click(button('Ошибки 1'));
    assert.equal(get('.review-item.status-incorrect'), wrongReview);
    assert.equal(wrongReview.open, true);
    await click(button(`Все ${all[0]}`));
    assert.equal(get('.review-item.status-incorrect'), wrongReview);
    assert.equal(wrongReview.open, true);
    await click(findButton('Закладки 3'));
    const domain = get('[role="combobox"][aria-label="Фильтр по домену"]');
    for (const [value, counts] of cases) {
      await click(domain);
      await click(`[role="option"]:nth-child(${value === 'all' ? 1 : Number(value) + 1})`);
      assertCounts(counts);
      assert.equal(readText(get('.filter-pills .active')).trim(), `Закладки ${counts[4]}`);
      assert.equal(container.querySelectorAll('.review-item').length, counts[4]);
      for (const [index, label] of labels.entries()) {
        await click(findButton(`${label} ${counts[index]}`));
        assert.equal(container.querySelectorAll('.review-item').length, counts[index]);
        assertCounts(counts);
      }
    }

    const native = get<HTMLSelectElement>('select[aria-label="Фильтр по домену"]');
    await act(() => {
      native.value = '2';
      native.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assertCounts(cases[1][1]);
    assert.equal(container.querySelectorAll('.review-item').length, 1);
  });
}

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
  assert.ok([...container.querySelectorAll('.review-question > strong')].every((node) => expected.has(readText(node))));
  assert.equal(get<HTMLSelectElement>('select[aria-label="Фильтр по домену"]').value, '2');

  // Стрелки исследуют список; потеря фокуса подтверждает активный вариант один раз.
  await click(domain);
  await press(domain, 'Home');
  const outside = button('Верно 0');
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
  assert.match(readText(domain), /Все домены/);
  assert.equal(get<HTMLSelectElement>('select[aria-label="Фильтр по домену"]').value, 'all');
  assert.equal(container.querySelectorAll('.review-item').length, 60);

  // На мобильном CSS скрывает кнопку и вызывает blur раньше resize: кандидат не должен подтвердиться.
  await click(domain);
  await press(domain, 'End');
  const originalMatchMedia = window.matchMedia;
  try {
    window.matchMedia = () => ({ matches: true }) as unknown as MediaQueryList;
    await act(() => domain.blur());
  } finally {
    window.matchMedia = originalMatchMedia;
  }
  assert.equal(domain.getAttribute('aria-expanded'), 'false');
  assert.equal(get<HTMLSelectElement>('select[aria-label="Фильтр по домену"]').value, 'all');
  assert.equal(container.querySelectorAll('.review-item').length, 60);
  assert.equal(document.activeElement, get('select[aria-label="Фильтр по домену"]'));
});

test('счётчик сохранений не выходит из безопасного диапазона после перезапуска', async () => {
  const initial = freshState();
  initial.revision = Number.MAX_SAFE_INTEGER;
  storage.setItem(key, JSON.stringify(initial));
  await mount();
  await click('[data-start="1"]');
  assert.equal(currentState().revision, 0);
  await unmount();
  await mount();
  assert.equal(container.querySelector('.storage-warning'), null);
  assert.ok(get('.question-prompt'));
});

test('подтверждение импорта не перезаписывает новое сохранение другой вкладки', async () => {
  await mount();
  await go('#/history');
  const input = get('input[type="file"]');
  const file = new window.File([JSON.stringify(makeBackup(freshState()))], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(get('[role="dialog"]'));
  const external = { ...freshState(), revision: 1, sessions: { 'exam:2': makeAttempt(2, questions) } };
  const raw = JSON.stringify(external);
  storage.setItem(key, raw);
  await click(findButton('Восстановить'));
  assert.equal(storage.getItem(key), raw);
  assert.match(text(), /Прогресс изменился в другой вкладке/);
});

test('Web Locks сохраняет быстрые изменения из свежего черновика и проверяет revision внутри lock', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  const requests: LockSave[] = [];
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: {
      request(name: string, save: LockSave) {
        assert.equal(name, `trainer-save:${key}`);
        return new Promise((resolve, reject) =>
          requests.push(async () => {
            try {
              resolve(save());
            } catch (error) {
              reject(error);
            }
          }),
        );
      },
    },
  });
  const q = choice(questions.find((question) => question.level === 1 && question.type === 'multi'));
  const session = makeAttempt(1, questions);
  session.cursor = session.questionIds.indexOf(q.id);
  storage.setItem(key, JSON.stringify({ ...freshState(), sessions: { 'exam:1': session } }));
  window.location.hash = '#/exam/1';
  await mount();
  await act(() => {
    get(`input[value="${q.options[0].id}"]`).click();
    get(`input[value="${q.options[1].id}"]`).click();
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(currentState().sessions['exam:1'].drafts, {});
  await act(async () => {
    await takeRequest(requests)();
    await takeRequest(requests)();
  });
  assert.deepEqual(choiceDraft('exam:1', q.id), [q.options[0].id, q.options[1].id]);
  await click('.bookmark-button');
  const external = currentState();
  external.revision++;
  external.sessions['exam:2'] = makeAttempt(2, questions);
  const raw = JSON.stringify(external);
  storage.setItem(key, raw);
  await act(async () => {
    await takeRequest(requests)();
  });
  assert.equal(storage.getItem(key), raw);
  assert.match(text(), /Прогресс изменился в другой вкладке/);
});

test('очистка sessionStorage не блокирует локальный прогресс', async () => {
  await mount();
  await click('[data-start="1"]');
  await act(() => {
    window.dispatchEvent(new window.StorageEvent('storage', { key: null, storageArea: window.sessionStorage }));
  });
  assert.equal(container.querySelector('.storage-warning'), null);
  await click(`input[value="${firstChoice().correct[0]}"]`);
  assert.ok(currentState().sessions['exam:1'].drafts[questions[0].id]);
});

test('запрет Web Locks сохраняет практику в памяти и не перезаписывает данные устройства', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: {
      request() {
        return Promise.reject(new window.DOMException('Blocked by browser', 'SecurityError'));
      },
    },
  });
  const raw = JSON.stringify(freshState());
  storage.setItem(key, raw);
  await mount();
  await click('[data-start="1"]');
  assert.ok(get('.question-prompt'));
  await click(`input[value="${firstChoice().correct[0]}"]`);
  assert.equal(get<HTMLInputElement>(`input[value="${firstChoice().correct[0]}"]`).checked, true);
  await click(findButton('Проверить'));
  assert.ok(get('.feedback.correct'));
  assert.equal(storage.getItem(key), raw);
  assert.match(text(), /только в памяти вкладки/);
});

test('браузер без Web Locks не пишет в localStorage и продолжает попытку в памяти', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    window.localStorage.removeItem(key);
  });
  Object.defineProperty(window.navigator, 'locks', { configurable: true, value: undefined });
  const raw = JSON.stringify(freshState());
  window.localStorage.setItem(key, raw);
  await act(() => render(<App questions={questions} storageName={key} tabStorage={null} />, container));
  assert.equal(container.querySelector('.storage-warning'), null);
  await click('[data-start="1"]');
  assert.match(text(), /только в памяти вкладки/);
  await click(`input[value="${firstChoice().correct[0]}"]`);
  await click(findButton('Проверить'));
  assert.ok(get('.feedback.correct'));
  await act(() => {
    window.dispatchEvent(new window.StorageEvent('storage', { key, storageArea: window.localStorage }));
  });
  assert.doesNotMatch(text(), /Прогресс изменился в другой вкладке/);
  assert.equal(window.localStorage.getItem(key), raw);
});

test('вкладочный кэш сохраняет завершённый результат после перезапуска с защищёнными данными', async (t) => {
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  t.after(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  for (const raw of ['', '{broken', JSON.stringify({ ...freshState(), bankVersion: 'older-question-bank' })]) {
    const local = new MemoryStorage();
    local.map.set(key, raw);
    const tab = new MemoryStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
    window.location.hash = '#/';
    await act(() => render(<App questions={questions} storageName={key} />, container));
    await click('[data-start="1"]');
    await click(`input[value="${firstChoice().correct[0]}"]`);
    await click(findButton('Проверить'));
    await click(findButton('Завершить'));
    await click(findButton('Завершить и посмотреть балл'));
    const resultId = window.location.hash.replace('#/results/', '');
    assert.ok(resultId);
    assert.match(text(), /только в этой вкладке/);
    await unmount();
    await act(() => render(<App questions={questions} storageName={key} />, container));
    assert.equal(window.location.hash, `#/results/${resultId}`);
    assert.ok(get('.results-page'));
    await go('#/history');
    assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
    assert.equal(local.getItem(key), raw);
    await unmount();
  }
});

test('вкладочный кэш переживает отсутствие или запрет Web Locks', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  for (const locks of [
    undefined,
    { request: () => Promise.reject(new window.DOMException('Blocked', 'SecurityError')) },
  ]) {
    const local = new MemoryStorage();
    local.map.set(key, JSON.stringify(freshState()));
    const tab = new MemoryStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
    Object.defineProperty(window.navigator, 'locks', { configurable: true, value: locks });
    window.location.hash = '#/';
    await act(() => render(<App questions={questions} storageName={key} />, container));
    await click('[data-start="1"]');
    await click(`input[value="${firstChoice().correct[0]}"]`);
    await click(findButton('Проверить'));
    await click(findButton('Завершить'));
    await click(findButton('Завершить и посмотреть балл'));
    const resultId = window.location.hash.replace('#/results/', '');
    await unmount();
    await act(() => render(<App questions={questions} storageName={key} />, container));
    assert.equal(window.location.hash, `#/results/${resultId}`);
    assert.match(text(), /только в этой вкладке/);
    assert.equal(local.getItem(key), JSON.stringify(freshState()), `locks=${locks ? 'denied' : 'absent'}`);
    await unmount();
  }
});

test('вкладочный кэш сохраняет прогресс при ошибке локальной записи', async (t) => {
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const local = new MemoryStorage();
  const original = JSON.stringify(freshState());
  local.map.set(key, original);
  const tab = new MemoryStorage();
  local.setItem = () => {
    throw new Error('Storage full');
  };
  t.after(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  await act(() => render(<App questions={questions} storageName={key} />, container));
  await click('[data-start="1"]');
  await click(`input[value="${firstChoice().correct[0]}"]`);
  assert.match(text(), /переживёт обновление/);
  assert.match(text(), /Скачай копию до закрытия вкладки/);
  await unmount();
  await act(() => render(<App questions={questions} storageName={key} />, container));
  assert.ok(get('.question-prompt'));
  assert.equal(local.getItem(key), original);
  assert.ok(tab.getItem(`${key}:tab-progress`));
});

test('вкладочный кэш отбрасывается после внешнего изменения и сохраняет чужую историю', async (t) => {
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const local = new MemoryStorage();
  const tab = new MemoryStorage();
  const base = freshState();
  const cached = { ...base, sessions: { 'exam:1': makeAttempt(1, questions) } };
  const foreign = { ...freshState(), history: [finishAttempt(makeAttempt(2, questions))] };
  local.map.set(key, JSON.stringify(base));
  writeTabProgress(tab, key, local.getItem(key), cached);
  t.after(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  local.setItem(key, JSON.stringify(foreign));
  await act(() => render(<App questions={questions} storageName={key} />, container));
  await go('#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  assert.equal(tab.getItem(`${key}:tab-progress`), null);
  assert.equal(local.getItem(key), JSON.stringify(foreign));
});

test('вкладочный кэш удаляется после успешной очистки и восстановления', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const tab = new MemoryStorage();
  const original = JSON.stringify(freshState());
  const local = new MemoryStorage();
  local.map.set(key, original);
  const cached = { ...freshState(), sessions: { 'exam:1': makeAttempt(1, questions) } };
  writeTabProgress(tab, key, original, cached);
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, save: LockSave) => Promise.resolve(save()) },
  });
  await act(() => render(<App questions={questions} storageName={key} />, container));
  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(tab.getItem(`${key}:tab-progress`), null);
  assert.notEqual(local.getItem(key), original);
});

test('вкладочный кэш удаляется после успешного импорта', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const local = new MemoryStorage();
  const tab = new MemoryStorage();
  const original = JSON.stringify(freshState());
  local.map.set(key, original);
  writeTabProgress(tab, key, original, { ...freshState(), sessions: { 'exam:1': makeAttempt(1, questions) } });
  const imported = freshState();
  imported.history.push(finishAttempt(makeAttempt(3, questions)));
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, save: LockSave) => Promise.resolve(save()) },
  });
  await act(() => render(<App questions={questions} storageName={key} />, container));
  await go('#/history');
  const input = get('input[type="file"]');
  const file = new window.File([JSON.stringify(makeBackup(imported))], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await click(findButton('Восстановить'));
  assert.equal(tab.getItem(`${key}:tab-progress`), null);
  assert.equal(JSON.parse(local.getItem(key) ?? '').history.length, 1);
});

test('вкладочный кэш удаляется после восстановления защищённого локального сохранения', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  const originalLocal = window.localStorage;
  const originalSession = window.sessionStorage;
  const local = new MemoryStorage();
  const tab = new MemoryStorage();
  const old = { ...freshState(), bankVersion: 'older-question-bank' };
  const oldRaw = JSON.stringify(old);
  local.map.set(key, oldRaw);
  writeTabProgress(tab, key, oldRaw, { ...freshState(), sessions: { 'exam:1': makeAttempt(1, questions) } });
  t.after(() => {
    if (descriptor) Object.defineProperty(window.navigator, 'locks', descriptor);
    else clearLocks();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: originalLocal });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalSession });
    originalLocal.removeItem(key);
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, value: tab });
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, save: LockSave) => Promise.resolve(save()) },
  });
  await act(() => render(<App questions={questions} storageName={key} />, container));
  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(tab.getItem(`${key}:tab-progress`), null);
  assert.equal(JSON.parse(local.getItem(key) ?? '').bankVersion, BANK_VERSION);
});

test('обычное локальное сохранение переживает завершение и повторный монтаж', async () => {
  await mount();
  await click('[data-start="1"]');
  await click(`input[value="${firstChoice().correct[0]}"]`);
  await click(findButton('Проверить'));
  await click(findButton('Завершить'));
  await click(findButton('Завершить и посмотреть балл'));
  const resultId = window.location.hash.replace('#/results/', '');
  await go('#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  await unmount();
  await mount();
  assert.equal(window.location.hash, '#/history');
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  await go(`#/results/${resultId}`);
  assert.ok(get('.results-page'));
});

test('неудачная очистка или импорт не заменяют временную копию текущего прогресса', async () => {
  const raw = '{protected-original';
  storage.setItem(key, raw);
  const tab = new MemoryStorage();
  const cached = { ...freshState(), history: [finishAttempt(makeAttempt(1, questions))] };
  writeTabProgress(tab, key, raw, cached);
  const tabRaw = tab.getItem(`${key}:tab-progress`);
  storage.setItem = () => {
    throw new Error('Storage full');
  };
  const renderApp = () =>
    act(() => render(<App questions={questions} storage={storage} storageName={key} tabStorage={tab} />, container));
  await renderApp();
  await go('#/history');
  await click(findButton('Очистить все результаты'));
  await click(findButton('Очистить результаты'));
  assert.equal(tab.getItem(`${key}:tab-progress`), tabRaw);
  assert.ok(findButton('Очистить результаты'));
  await unmount();
  await renderApp();
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  const input = get('input[type="file"]');
  const imported = { ...freshState(), history: [finishAttempt(makeAttempt(3, questions))] };
  Object.defineProperty(input, 'files', {
    value: [new window.File([JSON.stringify(makeBackup(imported))], 'backup.json')],
    configurable: true,
  });
  await act(async () => {
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await click(findButton('Восстановить'));
  assert.equal(storage.getItem(key), raw);
  assert.equal(tab.getItem(`${key}:tab-progress`), tabRaw);
  await unmount();
  await renderApp();
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  assert.match(readText(get('.history-title')), /Базовый/);
});

test('завершение снова показывает предупреждение, если оба сохранения недоступны', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  Object.defineProperty(window.navigator, 'locks', {
    configurable: true,
    value: { request: (_name: string, save: LockSave) => Promise.resolve(save()) },
  });
  await mount();
  await click('[data-start="1"]');
  storage.setItem = () => {
    throw new Error('Storage full');
  };
  await click(`input[value="${firstChoice().correct[0]}"]`);
  await click(findButton('Проверить'));
  assert.ok(get('.storage-warning'));
  await click('[aria-label="Скрыть сообщение"]');
  assert.equal(container.querySelector('.storage-warning'), null);
  await click(findButton('Завершить'));
  await click(findButton('Завершить и посмотреть балл'));
  assert.ok(get('.results-page'));
  assert.match(readText(get('.storage-warning')), /Не удалось сохранить прогресс/);
  assert.match(readText(get('.storage-warning')), /только в памяти вкладки/);
  assert.doesNotMatch(readText(get('.storage-warning')), /переживёт обновление/);
});

test('очистка уровня при отказе обоих хранилищ сохраняет историю и подтверждение', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  const state = { ...freshState(), history: [finishAttempt(makeAttempt(1, questions))] };
  for (const rejectedLocks of [false, true]) {
    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, save: LockSave) =>
          rejectedLocks ? Promise.reject(new window.DOMException('Blocked', 'SecurityError')) : Promise.resolve(save()),
      },
    });
    for (const protectedRaw of [null, '']) {
      const local = new MemoryStorage();
      const tab = new MemoryStorage();
      const raw = protectedRaw ?? JSON.stringify(state);
      local.setItem(key, raw);
      if (protectedRaw !== null) writeTabProgress(tab, key, raw, state);
      const tabRaw = tab.getItem(`${key}:tab-progress`);
      local.setItem = tab.setItem = () => {
        throw new Error('Storage full');
      };
      const renderApp = () =>
        act(() => render(<App questions={questions} storage={local} storageName={key} tabStorage={tab} />, container));
      await renderApp();
      await go('#/history');
      await click('[aria-label="Очистить результаты уровня 1"]');
      await click(findButton('Очистить результаты'));
      assert.ok(findButton('Очистить результаты'));
      assert.doesNotMatch(text(), /Результаты уровня 1 удалены/);
      assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
      assert.equal(local.getItem(key), raw);
      assert.equal(tab.getItem(`${key}:tab-progress`), tabRaw);
      await unmount();
      await renderApp();
      assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
      await unmount();
    }
  }
});

test('очистка уровня сохраняется во вкладочном кэше при защищённом оригинале', async () => {
  const raw = '';
  storage.setItem(key, raw);
  const tab = new MemoryStorage();
  const state = {
    ...freshState(),
    history: [finishAttempt(makeAttempt(1, questions)), finishAttempt(makeAttempt(2, questions))],
  };
  writeTabProgress(tab, key, raw, state);
  const renderApp = () =>
    act(() => render(<App questions={questions} storage={storage} storageName={key} tabStorage={tab} />, container));
  await renderApp();
  await go('#/history');
  await click('[aria-label="Очистить результаты уровня 1"]');
  await click(findButton('Очистить результаты'));
  assert.match(text(), /Результаты уровня 1 удалены/);
  await unmount();
  await renderApp();
  assert.equal(storage.getItem(key), raw);
  assert.equal(container.querySelectorAll('.history-table tbody tr').length, 1);
  assert.match(readText(get('.history-title')), /Продвинутый/);
});
test('таймер включается перед стартом, а продолжение и повторный монтаж не сбрасывают срок', async () => {
  await mount();
  assert.equal(get<HTMLInputElement>('[role="switch"]').checked, false);
  await click('[role="switch"]');
  await click('[data-start="1"]');
  const timed = currentState().sessions['exam:1'];
  const timedTiming = timingOf(timed);
  const deadline = timedTiming.deadlines[timed.questionIds[0]];
  assert.equal(timedTiming.secondsPerQuestion, 72);
  assert.ok(get('[role="timer"]'));
  assert.match(readText(get('[role="timer"]')), /01:1[012]/);
  await go('#/');
  await click('[role="switch"]');
  assert.equal(get<HTMLInputElement>('[role="switch"]').checked, false);
  await click('[data-start="1"]');
  assert.equal(timingOf(currentState().sessions['exam:1']).deadlines[timed.questionIds[0]], deadline);
  await unmount();
  await mount();
  assert.ok(get('[role="timer"]'));
  assert.equal(timingOf(currentState().sessions['exam:1']).deadlines[timed.questionIds[0]], deadline);
});

test('таймер показывает warning в последние 10 секунд и ошибку после истечения времени', async () => {
  const start = new Date(Date.now() - 65000).toISOString();
  const timed = makeAttempt(1, questions, 'exam', null, start, true);
  storage.setItem(key, JSON.stringify({ ...freshState(), sessions: { 'exam:1': timed } }));
  await go('#/exam/1');
  await mount();
  assert.ok(get('[role="timer"].urgent'));
  assert.equal(get('.question-timer.urgent').classList.contains('expired'), false);
  assert.match(text(), /Время истекает/);
  await unmount();
  const past = new Date(Date.now() - 74000).toISOString();
  const expired = makeAttempt(1, questions, 'exam', null, past, true);
  const q = choice(questionById(expired.questionIds[0]));
  const draft = setDraft(expired, q, q.correct, past);
  storage.setItem(key, JSON.stringify({ ...freshState(), sessions: { 'exam:1': draft } }));
  await mount();
  assert.equal(currentState().sessions['exam:1'].cursor, 1);
  assert.ok(currentState().sessions['exam:1'].answers[q.id].timedOut);
  assert.match(text(), /Вопрос засчитан как ошибка/);
  assert.ok(get('.toast.toast-warning'));
  assert.equal(get('.toast').getAttribute('role'), 'alert');
  assert.equal(get('.toast-icon .icon').getAttribute('width'), '22');
  await click('[data-question-index="0"]');
  assert.ok(get('[role="timer"].expired'));
  assert.ok(get<HTMLInputElement>('input[type="radio"]').disabled);
  assert.match(readText(get('.feedback-heading')), /Время вышло/);
  assert.equal(container.querySelector('.check-answer'), null);
  assert.match(readText(get('[role="timer"]')), /00:00/);
  await unmount();
  await mount();
  assert.equal(currentState().sessions['exam:1'].cursor, 0);
  assert.ok(currentState().sessions['exam:1'].answers[q.id].timedOut);
});

test('таймер последнего вопроса завершает тест и оставляет ошибку доступной в разборе', async () => {
  const started = new Date(Date.now() - 80000).toISOString();
  let timed = makeAttempt(1, questions, 'exam', null, started, true);
  const ids = timed.questionIds;
  for (let index = 0; index < ids.length - 1; index++) {
    const now = new Date(Date.parse(started) + index).toISOString();
    timed = moveCursor(timed, index, now);
    const q = questionById(ids[index]);
    timed = submitAnswer(timed, q, q.type === 'match' ? q.pairs : q.correct, now);
  }
  timed = moveCursor(timed, ids.length - 1, new Date(Date.parse(started) + 100).toISOString());
  storage.setItem(key, JSON.stringify({ ...freshState(), sessions: { 'exam:1': timed } }));
  await go('#/exam/1');
  await mount();
  assert.ok(get('.results-page'));
  assert.equal(currentState().sessions['exam:1'], undefined);
  const result = historyAt(0);
  const lastId = ids.at(-1);
  assert.ok(lastId);
  assert.ok(result.answers[lastId].timedOut);
  assert.equal(scoreAttempt(result, questions).wrong, 1);
  assert.equal(scoreAttempt(result, questions).unanswered, 0);
  const review = [...container.querySelectorAll<HTMLElement>('.review-item')].at(-1);
  assert.ok(review);
  await click(query(review, 'summary'));
  assert.match(readText(review), /Время вышло/);
  assert.ok(review.querySelector('.main-explanation'));
  await unmount();
  await mount();
  assert.ok(get('.results-page'));
});
test('без таймера тест по умолчанию сохраняет прежний режим', async () => {
  await mount();
  await click('[data-start="2"]');
  assert.equal(currentState().sessions['exam:2'].timing, undefined);
  assert.equal(container.querySelector('[role="timer"]'), null);
});

test('таймер можно выбрать и для повторной подготовки по ошибкам', async () => {
  const q = firstChoice();
  const original = makeAttempt(1, questions, 'mistakes', [q.id]);
  const wrongOption = q.options.find((option) => !q.correct.includes(option.id));
  assert.ok(wrongOption);
  const wrong = [wrongOption.id];
  const complete = finishAttempt(submitAnswer(original, q, wrong));
  storage.setItem(key, JSON.stringify({ ...freshState(), history: [complete] }));
  await go(`#/results/${complete.id}`);
  await mount();
  await click('[role="switch"]');
  await click(findButton('Повторить ошибки (1)'));
  assert.ok(get('[role="timer"]'));
  assert.equal(timingOf(currentState().sessions['mistakes:1']).secondsPerQuestion, 72);
});
test('таймер с отложенным Web Lock не возвращает пользователя с материалов и не сжигает невидимый следующий вопрос', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  for (const mode of ['exam', 'mistakes']) {
    const requests: LockSave[] = [];
    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, save: LockSave) => new Promise((resolve) => requests.push(() => resolve(save()))),
      },
    });
    const started = new Date(Date.now() - 74000).toISOString();
    const timed = makeAttempt(1, questions, mode, mode === 'mistakes' ? [questions[0].id] : null, started, true);
    const session = `${mode}:1`;
    storage.setItem(key, JSON.stringify({ ...freshState(), sessions: { [session]: timed } }));
    await go(`#/${mode}/1`);
    await mount();
    assert.equal(requests.length, 1);
    await go('#/study');
    await act(async () => {
      await takeRequest(requests)();
    });
    assert.equal(window.location.hash, '#/study');
    assert.equal(currentState().history.length, 0);
    assert.deepEqual(currentState().sessions[session].answers, {});
    assert.equal(currentState().sessions[session].cursor, 0);
    assert.equal(Object.keys(timingOf(currentState().sessions[session]).deadlines).length, 1);
    await go(`#/${mode}/1`);
    await act(async () => {
      await takeRequest(requests)();
    });
    if (mode === 'mistakes') {
      assert.ok(get('.results-page'));
      assert.ok(currentState().history[0].answers[questions[0].id].timedOut);
    } else {
      const next = currentState().sessions[session];
      assert.equal(next.cursor, 1);
      assert.ok(next.answers[questions[0].id].timedOut);
      assert.ok(Date.parse(timingOf(next).deadlines[next.questionIds[1]]) > Date.now() + 70000);
    }
    await unmount();
  }
});

test('таймер отложенного старта отменяется при уходе с экрана, а новая попытка получает полный срок', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  for (const mode of ['exam', 'mistakes']) {
    const requests: LockSave[] = [];
    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, save: LockSave) => new Promise((resolve) => requests.push(() => resolve(save()))),
      },
    });
    const initial = freshState();
    let origin = '#/';
    if (mode === 'mistakes') {
      const q = firstChoice();
      const wrongOption = q.options.find((option) => !q.correct.includes(option.id));
      assert.ok(wrongOption);
      const wrong = [wrongOption.id];
      const result = finishAttempt(submitAnswer(makeAttempt(1, questions, mode, [q.id]), q, wrong));
      initial.history.push(result);
      origin = `#/results/${result.id}`;
    }
    storage.setItem(key, JSON.stringify(initial));
    await go(origin);
    await mount();
    await click('[role="switch"]');
    const start = () => click(mode === 'exam' ? '[data-start="1"]' : findButton('Повторить ошибки (1)'));
    await start();
    assert.equal(requests.length, 1);
    await go('#/study');
    await act(async () => {
      await takeRequest(requests)();
    });
    assert.equal(window.location.hash, '#/study');
    assert.deepEqual(currentState().sessions, {});
    assert.equal(currentState().history.length, initial.history.length);
    await go(origin);
    await start();
    const beforeSave = Date.now();
    await act(async () => {
      await takeRequest(requests)();
    });
    assert.equal(window.location.hash, `#/${mode}/1`);
    const started = currentState().sessions[`${mode}:1`];
    assert.ok(Date.parse(timingOf(started).deadlines[started.questionIds[0]]) >= beforeSave + 72000);
    assert.equal(container.querySelector('[role="dialog"]'), null);
    await unmount();
  }
});

test('таймер отложенного завершения сохраняет результат без возврата на экран теста или результатов', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'locks');
  t.after(() => (descriptor ? Object.defineProperty(window.navigator, 'locks', descriptor) : clearLocks()));
  for (const mode of ['exam', 'mistakes']) {
    const requests: LockSave[] = [];
    Object.defineProperty(window.navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, save: LockSave) => new Promise((resolve) => requests.push(() => resolve(save()))),
      },
    });
    const timed = makeAttempt(1, questions, mode, mode === 'mistakes' ? [questions[0].id] : null, undefined, true);
    const session = `${mode}:1`;
    storage.setItem(key, JSON.stringify({ ...freshState(), sessions: { [session]: timed } }));
    await go(`#/${mode}/1`);
    await mount();
    await click(findButton('Завершить'));
    await click(findButton('Завершить и посмотреть балл'));
    assert.equal(requests.length, 1);
    const destination = mode === 'exam' ? '#/study' : '#/';
    await go(destination);
    await act(async () => {
      await takeRequest(requests)();
    });
    assert.equal(window.location.hash, destination);
    assert.equal(currentState().sessions[session], undefined);
    assert.equal(currentState().history.length, 1);
    const result = currentState().history[0];
    assert.equal(result.id, timed.id);
    assert.deepEqual(result.timing, timed.timing);
    await unmount();
    await mount();
    assert.equal(window.location.hash, destination);
    await go(`#/results/${result.id}`);
    assert.ok(get('.results-page'));
    await unmount();
  }
});
