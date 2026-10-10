/* Выполняется до отрисовки: предпочтение темы независимо от сохранений тестов. */
(() => {
  const key = 'ai-basics-exam-trainer:theme';
  const root = document.documentElement;
  const system = window.matchMedia?.('(prefers-color-scheme: dark)');
  const valid = (value) => value === 'light' || value === 'dark';
  const read = () => {
    try {
      const value = window.localStorage.getItem(key);
      return valid(value) ? value : null;
    } catch {
      return null;
    }
  };
  let preference = read();
  const apply = () => {
    const theme = preference || (system?.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#17151d' : '#00515a');
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
      button.setAttribute('aria-pressed', String(theme === 'dark'));
      button.title = button.getAttribute('aria-label');
    });
    window.dispatchEvent(new window.Event('trainer-theme-change'));
  };
  window.examTrainerTheme = {
    toggle() {
      preference = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(key, preference);
      } catch {
        // Тема всё равно работает в открытой вкладке, когда сохранение запрещено.
      }
      apply();
    },
  };
  system?.addEventListener?.('change', () => {
    if (!preference) apply();
  });
  window.addEventListener('storage', (event) => {
    if (event.storageArea) {
      try {
        if (event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
    }
    if (event.key === key || event.key === null) {
      preference = read();
      apply();
    }
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-theme-toggle]')) window.examTrainerTheme.toggle();
  });
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  apply();
})();
