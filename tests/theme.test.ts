import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

const source = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
const key = 'ai-basics-exam-trainer:theme';

type SetupOptions = { dark?: boolean; saved?: string | null; blocked?: boolean };
type MockMediaQueryList = EventTarget & { matches: boolean };

function setup(t: TestContext, { dark = false, saved = null, blocked = false }: SetupOptions = {}) {
  const window = new Window({ url: 'https://example.test/trainer/' });
  const document = window.document;
  t.after(() => window.close());
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  document.body.innerHTML = '<button data-theme-toggle><svg><path/></svg></button>';
  const system = new window.EventTarget() as unknown as MockMediaQueryList;
  let systemMatches = dark;
  Object.defineProperty(system, 'matches', { get: () => systemMatches });
  window.matchMedia = (() => system) as unknown as typeof window.matchMedia;
  window.localStorage.setItem('exam-progress', 'saved answers');
  if (saved !== null) window.localStorage.setItem(key, saved);
  if (blocked)
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Blocked');
      },
    });
  runInNewContext(source, { window, document });
  const changeSystem = (value: boolean) => {
    systemMatches = value;
    system.dispatchEvent(new window.Event('change') as unknown as Event);
  };
  const button = document.querySelector('button');
  assert.ok(button);
  return { window, document, changeSystem, button };
}

test('тема применяется до рендера: выбор пользователя важнее системной темы', (t) => {
  const cases: ReadonlyArray<readonly [boolean, string | null, 'dark' | 'light']> = [
    [true, null, 'dark'],
    [false, null, 'light'],
    [true, 'light', 'light'],
    [false, 'dark', 'dark'],
    [true, 'unknown', 'dark'],
  ];
  for (const [dark, saved, expected] of cases) {
    const { document, button } = setup(t, { dark, saved });
    assert.equal(document.documentElement.dataset.theme, expected);
    assert.equal(document.documentElement.style.colorScheme, expected);
    assert.equal(button.getAttribute('aria-pressed'), String(expected === 'dark'));
    assert.match(button.getAttribute('aria-label') ?? '', expected === 'dark' ? /светлую/ : /тёмную/);
    const meta = document.querySelector('meta');
    assert.ok(meta);
    assert.equal(meta.content, expected === 'dark' ? '#17151d' : '#ffffff');
  }
});

test('системная тема меняется до явного выбора; клик по SVG сохраняется без изменения прогресса', (t) => {
  const { window, document, button, changeSystem } = setup(t);
  changeSystem(true);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  const path = button.querySelector('path');
  assert.ok(path);
  path.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(window.localStorage.getItem(key), 'light');
  changeSystem(true);
  assert.equal(document.documentElement.dataset.theme, 'light');
  button.click();
  assert.equal(window.localStorage.getItem(key), 'dark');
  assert.equal(window.localStorage.getItem('exam-progress'), 'saved answers');
});

test('тема синхронизируется между вкладками, очистка возвращает системную', (t) => {
  const { window, document, changeSystem } = setup(t, { saved: 'light' });
  window.localStorage.setItem(key, 'dark');
  window.dispatchEvent(new window.StorageEvent('storage', { key }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  window.localStorage.setItem(key, 'light');
  window.dispatchEvent(new window.StorageEvent('storage', { key: 'exam-progress' }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  window.localStorage.removeItem(key);
  window.dispatchEvent(new window.StorageEvent('storage', { key: null as unknown as string }));
  assert.equal(document.documentElement.dataset.theme, 'light');
  changeSystem(true);
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('при запрете localStorage переключение работает и удерживает выбор в открытой вкладке', (t) => {
  const { document, button, changeSystem } = setup(t, { blocked: true });
  assert.equal(document.documentElement.dataset.theme, 'light');
  button.click();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  changeSystem(false);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  button.click();
  assert.equal(document.documentElement.dataset.theme, 'light');
});

test('изменения sessionStorage не сбрасывают выбранную тему', (t) => {
  const { window, document } = setup(t, { saved: 'dark' });
  window.localStorage.setItem(key, 'light');
  window.dispatchEvent(
    new window.StorageEvent('storage', { key: null as unknown as string, storageArea: window.sessionStorage }),
  );
  assert.equal(document.documentElement.dataset.theme, 'dark');
  window.dispatchEvent(new window.StorageEvent('storage', { key, storageArea: window.localStorage }));
  assert.equal(document.documentElement.dataset.theme, 'light');
});
