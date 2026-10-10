import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { APP_NAME, DOMAINS, PROGRAM_URL, TRAINING_TARGET } from './data/meta.js';
import {
  completeSession,
  clearLevel,
  freshState,
  makeBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  readState,
  storageKey,
  writeState,
} from './core/storage.js';
import {
  errorIds,
  emptyResponse,
  finishAttempt,
  makeAttempt,
  moveCursor,
  sessionKey,
  setDraft,
  submitAnswer,
  toggleBookmark,
} from './core/exam.js';
import { createHtmlReport } from './core/report.js';
import {
  html,
  downloadFile,
  EmptyState,
  Icon,
  Modal,
  Wordmark,
  PlatformMark,
  SectionBackdrop,
  ThemeToggle,
} from './components/ui.js';
import { Home, History, Results, Study } from './components/pages.js';
import { ExamPage } from './components/exam-page.js';

const MEMORY_WARNING =
  'Браузер не поддерживает безопасное сохранение между вкладками. Прогресс этой попытки хранится только в памяти вкладки. Скачай копию до её закрытия или обновления.';

function routeFromHash() {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  if (['exam', 'mistakes', 'results', 'study', 'history'].includes(parts[0]))
    return { page: parts[0], id: parts[1] || '' };
  return { page: 'home', id: '' };
}
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App({ questions, storage: suppliedStorage, storageName }) {
  const store = useRef(suppliedStorage === undefined ? browserStorage() : suppliedStorage);
  const key = useRef(storageName || storageKey(window.location.pathname));
  const initial = useRef(null);
  if (!initial.current) initial.current = readState(store.current, key.current, questions);
  const memoryOnly = useRef(Boolean(store.current && suppliedStorage === undefined && !window.navigator?.locks));
  const memoryWarning = [initial.current.warning, MEMORY_WARNING].filter(Boolean).join(' ');
  const [state, setState] = useState(initial.current.state);
  const liveState = useRef(state);
  const driver = useRef({
    revision: initial.current.state.revision,
    protected: initial.current.protected,
    raw: initial.current.raw,
    conflict: false,
  });
  const [warning, setWarning] = useState(memoryOnly.current ? memoryWarning : initial.current.warning);
  const [dismissedWarning, setDismissedWarning] = useState('');
  const [route, setRoute] = useState(routeFromHash);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const celebration = useRef(null);
  const consumeCelebration = useCallback(() => {
    celebration.current = null;
  }, []);

  const notify = (message) => setToast(message);
  function navigate(path) {
    if (path !== `#/results/${celebration.current}`) celebration.current = null;
    window.location.hash = path;
    setRoute(routeFromHash());
    window.scrollTo?.(0, 0);
  }
  function commit(transform, recover = false) {
    const save = () => {
      if (driver.current.conflict) {
        notify('Сначала обнови данные из другой вкладки.');
        return false;
      }
      let next = transform(liveState.current);
      if (next === liveState.current) return false;
      const revision = driver.current.revision;
      next = { ...next, revision: revision < Number.MAX_SAFE_INTEGER ? revision + 1 : 0 };
      const force = recover && driver.current.protected;
      if (memoryOnly.current) {
        driver.current.revision = next.revision;
        if (force) {
          const saved = writeState(store.current, key.current, next);
          if (!saved.ok) {
            setWarning([saved.warning, memoryWarning].filter(Boolean).join(' '));
            return false;
          }
          driver.current = { revision: next.revision, protected: false, raw: null, conflict: false };
          setWarning(MEMORY_WARNING);
        } else setWarning(driver.current.protected ? memoryWarning : MEMORY_WARNING);
      } else if (!driver.current.protected || force) {
        const saved = writeState(store.current, key.current, next, force ? null : revision);
        if (saved.conflict) {
          driver.current.conflict = true;
          setWarning(saved.warning);
          return false;
        }
        setWarning(saved.warning);
        if (recover && !saved.ok) return false;
        if (saved.ok) {
          driver.current = { revision: next.revision, protected: false, raw: null, conflict: false };
        }
      }
      liveState.current = next;
      setState(next);
      return true;
    };
    // Один короткий lock защищает сравнение revision и запись от одновременных вкладок.
    const locks = !memoryOnly.current && window.navigator?.locks;
    return locks && store.current
      ? locks.request(`trainer-save:${key.current}`, save).catch((error) => {
          if (['SecurityError', 'NotSupportedError'].includes(error?.name)) {
            memoryOnly.current = true;
            return save();
          }
          setWarning('Не удалось получить доступ к сохранению. Скачай копию и обнови страницу.');
          return false;
        })
      : Promise.resolve(save());
  }
  function reloadFromStorage() {
    const result = readState(store.current, key.current, questions);
    driver.current = { revision: result.state.revision, protected: result.protected, raw: result.raw, conflict: false };
    liveState.current = result.state;
    setState(result.state);
    setWarning(memoryOnly.current ? [result.warning, MEMORY_WARNING].filter(Boolean).join(' ') : result.warning);
    notify('Сохранения обновлены.');
  }
  useEffect(() => {
    const onHash = () => {
      const nextRoute = routeFromHash();
      if (nextRoute.page !== 'results' || nextRoute.id !== celebration.current) celebration.current = null;
      setRoute(nextRoute);
      if (window.location.hash !== '#levels') window.scrollTo?.(0, 0);
    };
    const onStorage = (event) => {
      if (memoryOnly.current) return;
      if (event.storageArea && event.storageArea !== store.current) return;
      if (event.key !== key.current && event.key !== null) return;
      driver.current.conflict = true;
      setWarning(
        'Прогресс изменился в другой вкладке. Обнови данные перед продолжением, чтобы не перезаписать результат.',
      );
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!warning) setDismissedWarning('');
  }, [warning]);
  useEffect(() => {
    document.title = `${{ home: 'Тесты', exam: 'Экзамен', mistakes: 'Работа над ошибками', results: 'Результат', history: 'Прогресс', study: 'Материалы' }[route.page]} · ${APP_NAME}`;
  }, [route.page]);

  function begin(level, mode = 'exam', ids = null, resume = false) {
    if (![1, 2, 3].includes(Number(level))) return;
    const skey = sessionKey(level, mode);
    const existing = liveState.current.sessions[skey];
    if (resume && existing) {
      navigate(`#/${mode}/${level}`);
      return;
    }
    const launch = async () => {
      const attempt = makeAttempt(Number(level), questions, mode, ids);
      if (
        await commit((current) =>
          current.sessions[skey]?.id !== existing?.id
            ? current
            : { ...current, sessions: { ...current.sessions, [skey]: attempt } },
        )
      )
        navigate(`#/${mode}/${level}`);
      setModal(null);
    };
    if (existing)
      setModal({
        title: 'Начать новую попытку?',
        body: `Незавершённая попытка уровня ${level} будет заменена. Уже проверено ${Object.keys(existing.answers).length} из ${existing.questionIds.length} вопросов. История завершённых попыток сохранится.`,
        confirmText: 'Начать заново',
        onConfirm: launch,
      });
    else launch();
  }
  const currentLevel = Number(route.id);
  const currentKey = sessionKey(currentLevel, route.page === 'mistakes' ? 'mistakes' : 'exam');
  const attempt = state.sessions[currentKey];
  function updateAttempt(transform) {
    const id = liveState.current.sessions[currentKey]?.id;
    return commit((state) => {
      const current = state.sessions[currentKey];
      if (!current || current.id !== id) return state;
      const next = transform(current);
      return next === current ? state : { ...state, sessions: { ...state.sessions, [currentKey]: next } };
    });
  }
  function finish() {
    const current = liveState.current.sessions[currentKey];
    if (!current) return;
    const remaining = current.questionIds.length - Object.keys(current.answers).length;
    const finishNow = async () => {
      let completed;
      const saved = await commit((state) => {
        const latest = state.sessions[currentKey];
        if (!latest || latest.id !== current.id) return state;
        completed = finishAttempt(latest);
        return completeSession(state, currentKey, completed);
      });
      if (saved) {
        celebration.current = completed.id;
        navigate(`#/results/${completed.id}`);
      }
      setModal(null);
    };
    if (remaining)
      setModal({
        title: 'Завершить тест досрочно?',
        body: `Осталось ${remaining} непроверенных заданий. За них будет 0 баллов, даже если вариант уже выбран, но кнопка «Проверить» не нажата. Разбор будет доступен для всех вопросов.`,
        confirmText: 'Завершить и посмотреть балл',
        onConfirm: finishNow,
      });
    else finishNow();
  }
  function clearScores(level = null) {
    setModal({
      title: level ? `Очистить уровень ${level}?` : 'Очистить все результаты?',
      body: level
        ? 'Будут удалены все завершённые и незавершённые попытки этого уровня, включая работу над ошибками. Другие уровни сохранятся.'
        : 'Будут удалены история всех уровней, текущие попытки, черновики и закладки. Скачай резервную копию, если хочешь сохранить результаты.',
      dangerous: true,
      confirmText: 'Очистить результаты',
      onConfirm: async () => {
        if (await commit((current) => (level ? clearLevel(current, level) : freshState()), !level)) {
          setModal(null);
          notify(level ? `Результаты уровня ${level} удалены.` : 'Все результаты удалены.');
        }
      },
    });
  }
  async function importBackup(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      notify(`Файл больше 10 МБ. Выбери резервную копию приложения ${APP_NAME}.`);
      return;
    }
    try {
      const imported = parseBackup(await file.text(), questions);
      setModal({
        title: 'Восстановить результаты из копии?',
        body: `В копии ${imported.history.length} завершённых и ${Object.keys(imported.sessions).length} незавершённых попыток. Она заменит текущие сохранения всех уровней.`,
        confirmText: 'Восстановить',
        onConfirm: async () => {
          if (await commit(() => imported, true)) {
            setModal(null);
            navigate('#/history');
            notify('Результаты восстановлены.');
          }
        },
      });
    } catch (error) {
      notify(error.message || 'Не удалось прочитать резервную копию.');
    }
  }
  const backup = () =>
    downloadFile('ai-basics-exam-trainer-backup.json', JSON.stringify(makeBackup(liveState.current), null, 2));
  const result = route.page === 'results' ? state.history.find((a) => a.id === route.id) : null;
  const navActive = ['exam', 'mistakes', 'results', 'home'].includes(route.page) ? 'home' : route.page;

  return html`<div class="app-shell"><a class="skip-link" href="#main-content" onClick=${(event) => {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
    document.getElementById('main-content')?.scrollIntoView?.({ block: 'start' });
  }}>Перейти к содержимому</a><header class="site-header"><div class="header-inner"><a class="brand-link" href="#/" aria-label=${`${APP_NAME} — главная`}><${Wordmark}/></a><nav class="primary-nav" aria-label="Основная навигация"><a class=${navActive === 'home' ? 'active' : ''} href="#/" aria-current=${navActive === 'home' ? 'page' : undefined}><span class="nav-label">Тесты</span></a><a class=${navActive === 'history' ? 'active' : ''} href="#/history" aria-current=${navActive === 'history' ? 'page' : undefined}><span class="nav-label">Прогресс</span></a><a class=${navActive === 'study' ? 'active' : ''} href="#/study" aria-current=${navActive === 'study' ? 'page' : undefined}><span class="nav-label">Материалы</span></a></nav><span class="local-status"><i class=${warning ? 'status-warning' : ''}/>${warning ? 'Проверь сохранение' : 'Прогресс на устройстве'}</span><${ThemeToggle}/></div></header>
    ${warning && warning !== dismissedWarning && html`<div class="storage-warning" role="alert"><span class="storage-warning-icon"><${Icon} name="info" size=${22}/></span><div class="storage-warning-body"><p>${warning}</p><div class="storage-warning-actions" role="group" aria-label="Действия с сохранениями">${driver.current.conflict && html`<button class="button primary small" onClick=${reloadFromStorage}><${Icon} name="refresh" size=${16}/>Обновить данные</button>`}<button class=${`button ${driver.current.conflict ? 'secondary' : 'primary'} small`} onClick=${driver.current.raw ? () => downloadFile('ai-basics-exam-trainer-original-data.json', driver.current.raw) : backup}><${Icon} name="download" size=${16}/>${driver.current.raw ? 'Скачать исходную копию' : 'Скачать копию'}</button><a class="button secondary small" href="#/history"><${Icon} name="sliders" size=${16}/>Управление данными</a>${driver.current.raw && html`<button class="text-button" onClick=${backup}>Скачать текущий прогресс<${Icon} name="download" size=${15}/></button>`}</div></div><button class="button secondary icon-button storage-warning-close" type="button" aria-label="Скрыть сообщение" title="Скрыть сообщение" onClick=${() => setDismissedWarning(warning)}><${Icon} name="close" size=${20}/></button></div>`}
    <main id="main-content" tabindex="-1">
      ${route.page === 'home' && html`<${Home} state=${state} questions=${questions} onStart=${(level) => begin(level, 'exam', null, true)} onRestart=${(level) => begin(level)}/>`}
      ${['exam', 'mistakes'].includes(route.page) && (attempt ? html`<${ExamPage} key=${attempt.id} attempt=${attempt} questions=${questions} blocked=${driver.current.conflict} onDraft=${(q, response) => updateAttempt((a) => setDraft(a, q, typeof response === 'function' ? response(a.drafts[q.id] || emptyResponse(q)) : response))} onAnswer=${(q, response) => updateAttempt((a) => submitAnswer(a, q, response))} onMove=${(index) => updateAttempt((a) => moveCursor(a, index))} onBookmark=${(id) => updateAttempt((a) => toggleBookmark(a, id))} onFinish=${finish}/>` : html`<div class="page"><${EmptyState} title="Нет незавершённой попытки" icon="book"><p>Выбери уровень на главной, чтобы начать тест.</p><a class="button primary" href="#/">К тестам<${Icon} name="arrow" size=${17}/></a></${EmptyState}></div>`)}
      ${route.page === 'results' && (result ? html`<${Results} key=${result.id} celebrate=${celebration.current === result.id} onCelebrationConsumed=${consumeCelebration} attempt=${result} questions=${questions} state=${state} onRestart=${(level, resume = false) => begin(level, 'exam', null, resume)} onMistakes=${(a) => begin(a.level, 'mistakes', errorIds(a, questions))} onExportReport=${(a) => downloadFile(`ai-basics-exam-trainer-level-${a.level}-report.html`, createHtmlReport(a, questions, document.documentElement.dataset.theme), 'text/html;charset=utf-8')}/>` : html`<div class="page"><${EmptyState} title="Этот результат не найден" icon="search"><p>Возможно, он был удалён или получен в другом браузере. Восстанови резервную копию или открой историю.</p><a class="button primary" href="#/history">К истории</a></${EmptyState}></div>`)}
      ${route.page === 'history' && html`<${History} state=${state} questions=${questions} onClearLevel=${clearScores} onClearAll=${() => clearScores()} onBackup=${backup} onImport=${importBackup}/>`}
      ${route.page === 'study' && html`<${Study} key=${route.id} questions=${questions} initialDomain=${Number(route.id) || 1}/>`}
    </main>
    <footer class="site-footer"><${SectionBackdrop} name="footer-orbital-sectors" format="webp"/><div class="footer-inner"><div class="footer-card"><div class="footer-intro"><span class="footer-title">${APP_NAME}</span><p>Независимый учебный проект для подготовки к экзамену «Основы работы с ИИ» на платформе Yandex AI Studio. Вопросы авторские; три уровня и учебная цель ${TRAINING_TARGET}% относятся к тренажёру.</p></div><div class="footer-exam-weights"><span class="footer-note-label">Веса доменов настоящего экзамена</span><div class="footer-weight-grid">${DOMAINS.map((domain) => html`<div><span>${domain.short}</span><strong>${domain.weight}%</strong></div>`)}</div></div><div class="footer-meta"><div class="footer-platform"><${PlatformMark}/><span class="footer-count">3 теста · 180 вопросов</span></div><a class="button secondary" href=${PROGRAM_URL} target="_blank" rel="noopener noreferrer">Программа экзамена<${Icon} name="external" size=${15}/></a></div></div></div></footer>
    ${modal && html`<${Modal} title=${modal.title} confirmText=${modal.confirmText} dangerous=${modal.dangerous} onConfirm=${modal.onConfirm} onClose=${() => setModal(null)}><p>${modal.body}</p></${Modal}>`}
    ${toast && html`<div class="toast" role="status"><${Icon} name="info" size=${18}/>${toast}<button aria-label="Закрыть уведомление" onClick=${() => setToast('')}><${Icon} name="close" size=${16}/></button></div>`}
  </div>`;
}
