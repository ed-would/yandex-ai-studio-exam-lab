import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

const source = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
const key = 'ai-basics-exam-trainer:theme';

function setup(t, { dark = false, saved = null, blocked = false } = {}) {
  const window = new Window({ url: 'https://example.test/trainer/' });
  const document = window.document;
  t.after(() => window.close());
  document.head.innerHTML = '<meta name="theme-color" content="#00515a">';
  document.body.innerHTML = '<button data-theme-toggle><svg><path/></svg></button>';
  const system = new window.EventTarget();
  system.matches = dark;
  window.matchMedia = () => system;
  window.localStorage.setItem('exam-progress', 'saved answers');
  if (saved !== null) window.localStorage.setItem(key, saved);
  if (blocked)
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('Blocked');
      },
    });
  runInNewContext(source, { window, document });
  const changeSystem = (value) => {
    system.matches = value;
    system.dispatchEvent(new window.Event('change'));
  };
  return { window, document, changeSystem, button: document.querySelector('button') };
}

test('тема применяется до рендера: выбор пользователя важнее системной темы', (t) => {
  for (const [dark, saved, expected] of [
    [true, null, 'dark'],
    [false, null, 'light'],
    [true, 'light', 'light'],
    [false, 'dark', 'dark'],
    [true, 'unknown', 'dark'],
  ]) {
    const { document, button } = setup(t, { dark, saved });
    assert.equal(document.documentElement.dataset.theme, expected);
    assert.equal(document.documentElement.style.colorScheme, expected);
    assert.equal(button.getAttribute('aria-pressed'), String(expected === 'dark'));
    assert.match(button.getAttribute('aria-label'), expected === 'dark' ? /светлую/ : /тёмную/);
    assert.equal(document.querySelector('meta').content, expected === 'dark' ? '#17151d' : '#00515a');
  }
});

test('системная тема меняется до явного выбора; клик по SVG сохраняется без изменения прогресса', (t) => {
  const { window, document, button, changeSystem } = setup(t);
  changeSystem(true);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  button.querySelector('path').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
  window.dispatchEvent(new window.StorageEvent('storage', { key: null }));
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
  window.dispatchEvent(new window.StorageEvent('storage', { key: null, storageArea: window.sessionStorage }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
  window.dispatchEvent(new window.StorageEvent('storage', { key, storageArea: window.localStorage }));
  assert.equal(document.documentElement.dataset.theme, 'light');
});
