import { useEffect, useRef, useState } from 'preact/hooks';
import { BANK_VERSION, LEVELS, PROGRAM_URL } from './data/meta.js';
import { completeSession, clearLevel, freshState, makeBackup, MAX_BACKUP_BYTES, parseBackup, readState, storageKey, writeState } from './core/storage.js';
import { errorIds, finishAttempt, makeAttempt, moveCursor, sessionKey, setDraft, submitAnswer, toggleBookmark } from './core/exam.js';
import { createHtmlReport } from './core/report.js';
import { html, downloadFile, EmptyState, Icon, Modal, Wordmark } from './components/ui.js';
import { Home, History, Results, Study } from './components/pages.js';
import { ExamPage } from './components/exam-page.js';

function routeFromHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  if (['exam', 'mistakes', 'results', 'study', 'history'].includes(parts[0])) return { page: parts[0], id: parts[1] || '' };
  return { page: 'home', id: '' };
}
function browserStorage() { try { return window.localStorage; } catch { return null; } }

export function App({ questions, storage: suppliedStorage, storageName }) {
  const store = useRef(suppliedStorage === undefined ? browserStorage() : suppliedStorage);
  const key = useRef(storageName || storageKey(window.location.pathname));
  const initial = useRef(null);
  if (!initial.current) initial.current = readState(store.current, key.current, questions);
  const [state, setState] = useState(initial.current.state);
  const liveState = useRef(state);
  const driver = useRef({ revision: initial.current.state.revision, protected: initial.current.protected, raw: initial.current.raw, conflict: false });
  const [warning, setWarning] = useState(initial.current.warning);
  const [route, setRoute] = useState(routeFromHash);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');

  const notify = (message) => setToast(message);
  function navigate(path) { window.location.hash = path; setRoute(routeFromHash()); window.scrollTo?.(0, 0); }
  function commit(next, force = false) {
    if (driver.current.conflict && !force) { notify('Сначала обнови данные из другой вкладки.'); return false; }
    next = { ...next, revision: Math.max(next.revision, driver.current.revision) + 1 };
    if (!driver.current.protected || force) {
      const saved = writeState(store.current, key.current, next, force ? null : driver.current.revision);
      if (saved.conflict) { driver.current.conflict = true; setWarning(saved.warning); return false; }
      setWarning(saved.warning);
      if (saved.ok) { driver.current = { revision: next.revision, protected: false, raw: null, conflict: false }; }
    }
    liveState.current = next; setState(next); return true;
  }
  function reloadFromStorage() {
    const result = readState(store.current, key.current, questions);
    driver.current = { revision: result.state.revision, protected: result.protected, raw: result.raw, conflict: false };
    liveState.current = result.state; setState(result.state); setWarning(result.warning); notify('Сохранения обновлены.');
  }
  useEffect(() => {
    const onHash = () => { setRoute(routeFromHash()); if (window.location.hash !== '#levels') window.scrollTo?.(0, 0); };
    const onStorage = (event) => {
      if (event.key !== key.current && event.key !== null) return;
      driver.current.conflict = true;
      setWarning('Прогресс изменился в другой вкладке. Обнови данные перед продолжением, чтобы не перезаписать результат.');
    };
    window.addEventListener('hashchange', onHash); window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('storage', onStorage); };
  }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { document.title = `${{ home: 'Тесты', exam: 'Экзамен', mistakes: 'Работа над ошибками', results: 'Результат', history: 'Прогресс', study: 'Материалы' }[route.page]} · Практикум ИИ`; }, [route.page]);

  function begin(level, mode = 'exam', ids = null, resume = false) {
    if (![1, 2, 3].includes(Number(level))) return;
    const skey = sessionKey(level, mode);
    const existing = liveState.current.sessions[skey];
    if (resume && existing) { navigate(`#/${mode}/${level}`); return; }
    const launch = () => {
      const attempt = makeAttempt(Number(level), questions, mode, ids);
      if (commit({ ...liveState.current, sessions: { ...liveState.current.sessions, [skey]: attempt } })) navigate(`#/${mode}/${level}`);
      setModal(null);
    };
    if (existing) setModal({ title: 'Начать новую попытку?', body: `Незавершённая попытка уровня ${level} будет заменена. Уже проверено ${Object.keys(existing.answers).length} из ${existing.questionIds.length} вопросов. История завершённых попыток сохранится.`, confirmText: 'Начать заново', onConfirm: launch });
    else launch();
  }
  const currentLevel = Number(route.id);
  const currentKey = sessionKey(currentLevel, route.page === 'mistakes' ? 'mistakes' : 'exam');
  const attempt = state.sessions[currentKey];
  function updateAttempt(transform) {
    const current = liveState.current.sessions[currentKey];
    if (!current) return;
    const next = transform(current);
    if (next !== current) commit({ ...liveState.current, sessions: { ...liveState.current.sessions, [currentKey]: next } });
  }
  function finish() {
    const current = liveState.current.sessions[currentKey];
    if (!current) return;
    const remaining = current.questionIds.length - Object.keys(current.answers).length;
    const finishNow = () => {
      const latest = liveState.current.sessions[currentKey];
      if (!latest) { setModal(null); return; }
      const completed = finishAttempt(latest);
      if (commit(completeSession(liveState.current, currentKey, completed))) navigate(`#/results/${completed.id}`);
      setModal(null);
    };
    if (remaining) setModal({ title: 'Завершить тест досрочно?', body: `Осталось ${remaining} непроверенных заданий. За них будет 0 баллов, даже если вариант уже выбран, но кнопка «Проверить» не нажата. Разбор будет доступен для всех вопросов.`, confirmText: 'Завершить и посмотреть балл', onConfirm: finishNow });
    else finishNow();
  }
  function clearScores(level = null) {
    setModal({ title: level ? `Очистить уровень ${level}?` : 'Очистить все результаты?', body: level ? 'Будут удалены все завершённые и незавершённые попытки этого уровня, включая работу над ошибками. Другие уровни сохранятся.' : 'Будут удалены история всех уровней, текущие попытки, черновики и закладки. Скачай резервную копию, если хочешь сохранить результаты.', dangerous: true, confirmText: 'Очистить результаты', onConfirm: () => {
      const next = level ? clearLevel(liveState.current, level) : freshState();
      if (commit(next, !level)) { setModal(null); notify(level ? `Результаты уровня ${level} удалены.` : 'Все результаты удалены.'); }
    } });
  }
  async function importBackup(event) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) { notify('Файл больше 10 МБ. Выбери резервную копию Практикума ИИ.'); return; }
    try {
      const imported = parseBackup(await file.text(), questions);
      setModal({ title: 'Восстановить результаты из копии?', body: `В копии ${imported.history.length} завершённых и ${Object.keys(imported.sessions).length} незавершённых попыток. Она заменит текущие сохранения всех уровней.`, confirmText: 'Восстановить', onConfirm: () => {
        if (commit(imported, true)) { setModal(null); navigate('#/history'); notify('Результаты восстановлены.'); }
      } });
    } catch (error) { notify(error.message || 'Не удалось прочитать резервную копию.'); }
  }
  const backup = () => downloadFile('ai-practicum-backup.json', JSON.stringify(makeBackup(liveState.current), null, 2));
  const result = route.page === 'results' ? state.history.find((a) => a.id === route.id) : null;
  const navActive = ['exam', 'mistakes', 'results', 'home'].includes(route.page) ? 'home' : route.page;

  return html`<div class="app-shell"><a class="skip-link" href="#main-content" onClick=${(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); document.getElementById('main-content')?.scrollIntoView?.({ block: 'start' }); }}>Перейти к содержимому</a><header class="site-header"><div class="header-inner"><a class="brand-link" href="#/" aria-label="Практикум ИИ — главная"><${Wordmark}/></a><nav aria-label="Основная навигация"><a class=${navActive === 'home' ? 'active' : ''} href="#/" aria-current=${navActive === 'home' ? 'page' : undefined}>Тесты</a><a class=${navActive === 'history' ? 'active' : ''} href="#/history" aria-current=${navActive === 'history' ? 'page' : undefined}>Прогресс</a><a class=${navActive === 'study' ? 'active' : ''} href="#/study" aria-current=${navActive === 'study' ? 'page' : undefined}>Материалы</a></nav><span class="local-status"><i class=${warning ? 'status-warning' : ''}/>${warning ? 'Проверь сохранение' : 'Прогресс на устройстве'}</span></div></header>
    ${warning && html`<div class="storage-warning" role="alert"><${Icon} name="info" size=${20}/><p>${warning}</p><div>${driver.current.conflict && html`<button class="button secondary small" onClick=${reloadFromStorage}>Обновить данные</button>`}<button class="button secondary small" onClick=${backup}>Скачать копию</button>${driver.current.raw && html`<button class="text-button" onClick=${() => downloadFile('ai-practicum-original-data.json', driver.current.raw)}>Исходные данные</button>`}<a class="text-button" href="#/history">Управление данными</a></div></div>`}
    <main id="main-content" tabindex="-1">
      ${route.page === 'home' && html`<${Home} state=${state} questions=${questions} onStart=${(level) => begin(level, 'exam', null, true)} onRestart=${(level) => begin(level)}/>`}
      ${['exam', 'mistakes'].includes(route.page) && (attempt ? html`<${ExamPage} key=${attempt.id} attempt=${attempt} questions=${questions} blocked=${driver.current.conflict} onDraft=${(q, response) => updateAttempt((a) => setDraft(a, q, response))} onAnswer=${(q, response) => updateAttempt((a) => submitAnswer(a, q, response))} onMove=${(index) => updateAttempt((a) => moveCursor(a, index))} onBookmark=${(id) => updateAttempt((a) => toggleBookmark(a, id))} onFinish=${finish}/>` : html`<div class="page"><${EmptyState} title="Нет незавершённой попытки" icon="book"><p>Выбери уровень на главной, чтобы начать тест.</p><a class="button primary" href="#/">К тестам<${Icon} name="arrow" size=${17}/></a></${EmptyState}></div>`)}
      ${route.page === 'results' && (result ? html`<${Results} key=${result.id} attempt=${result} questions=${questions} state=${state} onRestart=${(level, resume = false) => begin(level, 'exam', null, resume)} onMistakes=${(a) => begin(a.level, 'mistakes', errorIds(a, questions))} onExportReport=${(a) => downloadFile(`ai-practicum-level-${a.level}-report.html`, createHtmlReport(a, questions), 'text/html;charset=utf-8')}/>` : html`<div class="page"><${EmptyState} title="Этот результат не найден" icon="search"><p>Возможно, он был удалён или получен в другом браузере. Восстанови резервную копию или открой историю.</p><a class="button primary" href="#/history">К истории</a></${EmptyState}></div>`)}
      ${route.page === 'history' && html`<${History} state=${state} questions=${questions} onClearLevel=${clearScores} onClearAll=${() => clearScores()} onBackup=${backup} onImport=${importBackup}/>`}
      ${route.page === 'study' && html`<${Study} key=${route.id} questions=${questions} initialDomain=${Number(route.id) || 1}/>`}
    </main>
    <footer class="site-footer"><div><span>Практикум ИИ</span><p>Независимая подготовка к экзамену «Основы работы с ИИ» на платформе Yandex AI Studio.</p></div><a href=${PROGRAM_URL} target="_blank" rel="noopener noreferrer">Программа экзамена<${Icon} name="external" size=${13}/></a><span class="footer-version">3 теста · 180 вопросов · версия ${BANK_VERSION}</span></footer>
    ${modal && html`<${Modal} title=${modal.title} confirmText=${modal.confirmText} dangerous=${modal.dangerous} onConfirm=${modal.onConfirm} onClose=${() => setModal(null)}><p>${modal.body}</p></${Modal}>`}
    ${toast && html`<div class="toast" role="status"><${Icon} name="info" size=${18}/>${toast}<button aria-label="Закрыть уведомление" onClick=${() => setToast('')}><${Icon} name="close" size=${16}/></button></div>`}
  </div>`;
}
