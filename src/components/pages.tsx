import { useState } from 'preact/hooks';
import { DOMAINS, LEVELS, OFFICIAL_RESOURCES, PROGRAM_URL, RESEARCH_DATE, levelById } from '../data/meta.ts';
import { levelStats, scoreAttempt, sessionKey } from '../core/exam.ts';
import { resultOutcome } from '../core/coaching.ts';
import {
  h,
  Fragment,
  Art,
  SectionBackdrop,
  PlatformMark,
  EmptyState,
  Icon,
  ExternalLinkLabel,
  SourceLinks,
  formatDate,
  formatPercent,
  plural,
  TimerOption,
} from './ui.tsx';
export { Results } from './results-page.tsx';
import { SelectField } from './select-field.tsx';
import { ProgressBar } from './progress-bar.tsx';
import type { AppState, Question, Source } from '../types.ts';

void Fragment;

type HomeProps = {
  state: AppState;
  questions: Question[];
  onStart: (level: number) => void;
  onRestart: (level: number) => void;
  timed: boolean;
  onTimedChange: (enabled: boolean) => void;
};
type HistoryProps = {
  state: AppState;
  questions: Question[];
  hasProtectedData?: boolean;
  onClearLevel: (level: number) => void;
  onClearAll: () => void;
  onBackup: () => void;
  onImport: (event: Event & { currentTarget: HTMLInputElement }) => void;
};
type StudyProps = { questions: Question[]; initialDomain?: number };

export function Home({ state, questions, onStart, onRestart, timed, onTimedChange }: HomeProps) {
  const finished = state.history.filter((a) => a.mode === 'exam');
  const practiced = new Set(state.history.flatMap((a) => Object.keys(a.answers)));
  for (const a of Object.values(state.sessions)) Object.keys(a.answers).forEach((id) => practiced.add(id));
  return (
    <>
      <div class="page home-page">
        <section class="hero">
          <div class="hero-copy">
            <div class="exam-brand">
              <span>Подготовка к экзамену на платформе</span>
              <PlatformMark />
            </div>
            <h1>
              Основы
              <br />
              работы с ИИ
            </h1>
            <p class="hero-description">
              От первого промпта до сложных решений.
              <br class="desktop-only" /> Три тренировочных теста, подробные разборы
              <br class="desktop-only" /> и понятная карта подготовки.
            </p>
            <div class="hero-actions">
              <a
                class="button primary"
                href="#levels"
                onClick={(event) => {
                  event.preventDefault();
                  if (window.location.hash !== '#levels') window.location.hash = '#levels';
                  requestAnimationFrame(() => document.getElementById('levels')?.scrollIntoView?.({ block: 'start' }));
                }}
              >
                Выбрать тест
                <Icon name="arrow" size={19} />
              </a>
              <a class="text-button" href="#/study">
                <Icon name="map" size={18} />
                Карта подготовки
              </a>
            </div>
            <div class="hero-caption">
              <strong>180 авторских вопросов</strong>
              <span>без регистрации</span>
            </div>
          </div>
          <div class="hero-visual">
            <Art hero={true} />
            <span class="hero-art-caption">Понимать. Применять. Связывать.</span>
          </div>
        </section>
        <section class="overview-strip" aria-label="Тренажёр и твоя подготовка">
          <dl class="overview-facts">
            <div>
              <dt>Уровни сложности</dt>
              <dd class="overview-number">3</dd>
            </div>
            <div>
              <dt>Домены в тесте</dt>
              <dd class="overview-number">6</dd>
            </div>
            <div>
              <dt>Вопросы в тесте</dt>
              <dd class="overview-number">60</dd>
            </div>
          </dl>
          <div class={`overview-personal ${practiced.size === questions.length ? 'is-complete' : ''}`}>
            <span class="overview-label">Твоя подготовка</span>
            <div class="overview-progress-value">
              <span class="overview-number">{practiced.size}</span>
              <span class="overview-total">из {questions.length} вопросов</span>
            </div>
            <div class="overview-progress-caption">
              <span>Разобрано</span>
              <span>
                {practiced.size === questions.length ? (
                  <>
                    <Icon name="check" size={14} />
                    Всё разобрано
                  </>
                ) : (
                  `Осталось ${questions.length - practiced.size}`
                )}
              </span>
            </div>
            <ProgressBar value={practiced.size} max={questions.length} label="Разобрано вопросов" />
          </div>
        </section>
        <section class="levels-section" id="levels">
          <SectionBackdrop name="studio-01-three-trajectories" format="webp" />
          <div class="section-heading">
            <div>
              <span class="eyebrow">Твоя траектория</span>
              <h2>Выбери свою точку старта</h2>
              <p>Начни с любого уровня. Результаты сохраняются отдельно.</p>
            </div>
          </div>
          <TimerOption enabled={timed} onChange={onTimedChange} />
          <div class="level-grid">
            {LEVELS.map((level) => {
              const stats = levelStats(state, level.id, questions);
              const active = state.sessions[sessionKey(level.id)];
              const reviewed = active ? Object.keys(active.answers).length : 0;
              return (
                <>
                  <article class={`level-card theme-${level.id}`} key={level.id}>
                    <div class="level-card-top">
                      <span class="level-number">Уровень {level.id}</span>
                      <span class="badge">{level.tag}</span>
                    </div>
                    <div class="level-art">
                      <Art variant={level.id} />
                    </div>
                    <div class="level-card-copy">
                      <span class="level-kicker">{level.kicker}</span>
                      <h3>{level.name}</h3>
                      <p>{level.description}</p>
                    </div>
                    <div class="level-metrics">
                      <span>60 вопросов</span>
                      <span>
                        {stats.best !== null ? (
                          <>
                            Лучший: <strong>{formatPercent(stats.best)}%</strong>
                          </>
                        ) : (
                          'Первый шаг впереди'
                        )}
                      </span>
                    </div>
                    {active ? (
                      <>
                        <div class="card-progress">
                          <ProgressBar value={reviewed} max={60} label={`Прогресс уровня ${level.id}`} />
                          <span>{reviewed} из 60 проверено</span>
                        </div>
                      </>
                    ) : stats.latest ? (
                      <>
                        <div class="card-progress completed-caption">
                          <Icon name="check" size={15} />
                          Последний результат: {formatPercent(stats.latestScore?.percent ?? 0)}%
                        </div>
                      </>
                    ) : (
                      <>
                        <div class="card-progress quiet">Один ответ · мультивыбор · пары</div>
                      </>
                    )}
                    <button class="button level-button" data-start={level.id} onClick={() => onStart(level.id)}>
                      {active ? 'Продолжить' : stats.exams.length ? 'Пройти ещё раз' : 'Начать тест'}
                      <Icon name="arrow" size={18} />
                    </button>
                    {active && (
                      <>
                        <button class="text-button restart-link" onClick={() => onRestart(level.id)}>
                          Начать заново
                        </button>
                      </>
                    )}
                  </article>
                </>
              );
            })}
          </div>
        </section>
        {Object.values(state.sessions).some((a) => a.mode === 'mistakes') && (
          <>
            <section class="resume-practice">
              <Icon name="refresh" />
              <div>
                <strong>Есть незавершённый разбор ошибок</strong>
                <p>Эти тренировки сохраняются отдельно от полных экзаменов.</p>
              </div>
              <div class="resume-links">
                {Object.values(state.sessions)
                  .filter((a) => a.mode === 'mistakes')
                  .map((a) => (
                    <>
                      <a class="button secondary small" href={`#/mistakes/${a.level}`}>
                        Уровень {a.level}
                        <Icon name="arrow" size={16} />
                      </a>
                    </>
                  ))}
              </div>
            </section>
          </>
        )}
        <section class="home-lower" aria-label="Программа и практика">
          <article class="curriculum-panel lower-panel">
            <div class="lower-panel-heading">
              <span class="eyebrow">Программа экзамена</span>
              <h2>
                Шесть областей
                <br />
                знаний
              </h2>
            </div>
            <div class="domain-list">
              {DOMAINS.map((domain) => (
                <>
                  <a class="domain-row" href={`#/study/${domain.id}`}>
                    <span class="domain-icon">
                      <Icon name={domain.icon} />
                    </span>
                    <span>
                      <strong>{domain.short}</strong>
                      <small>{domain.description}</small>
                    </span>
                    <span class="domain-index">0{domain.id}</span>
                  </a>
                </>
              ))}
            </div>
            <div class="lower-panel-footer">
              <p class="lower-panel-caption">По 10 вопросов в каждой области на каждом уровне.</p>
              <a class="button secondary" href="#/study">
                Карта подготовки
                <Icon name="arrow" size={18} />
              </a>
            </div>
          </article>
          <article class="how-panel lower-panel">
            <SectionBackdrop name="practice-meander-light" format="png" />
            <div class="lower-panel-heading">
              <span class="eyebrow">Учёба через практику</span>
              <h2>
                Каждый ответ
                <br />
                становится уроком.
              </h2>
            </div>
            <div class="how-steps">
              <div class="how-step">
                <span>01</span>
                <div>
                  <h3>Выбирай и проверяй</h3>
                  <p>До проверки можно изменить выбор или разорвать связь в сопоставлении.</p>
                </div>
              </div>
              <div class="how-step">
                <span>02</span>
                <div>
                  <h3>Разбирай причину</h3>
                  <p>Сразу увидишь результат, объяснение и короткую памятку. Проверенный ответ зафиксирован.</p>
                </div>
              </div>
              <div class="how-step">
                <span>03</span>
                <div>
                  <h3>Возвращайся сильнее</h3>
                  <p>Изучи материалы, повтори ошибки или пересдай уровень. История покажет прогресс.</p>
                </div>
              </div>
            </div>
            <div class="guidance-card practice-note">
              <div class="guidance-heading">
                <span class="guidance-icon">
                  <Icon name="clock" size={22} />
                </span>
                <strong>Выбирай свой темп</strong>
              </div>
              <p class="guidance-description">
                Тренируйся без ограничения времени или включи таймер: 72 секунды на вопрос.
              </p>
            </div>
            <div class="lower-panel-footer">
              <a class="button secondary" href="#/history">
                {finished.length ? 'Посмотреть прогресс' : 'Как устроен прогресс'}
                <Icon name="chart" size={18} />
              </a>
            </div>
          </article>
        </section>
      </div>
    </>
  );
}

export function History({
  state,
  questions,
  hasProtectedData = false,
  onClearLevel,
  onClearAll,
  onBackup,
  onImport,
}: HistoryProps) {
  const [levelFilter, setLevelFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const savedAttempts = [...state.history, ...Object.values(state.sessions)];
  const history = state.history
    .filter(
      (a) =>
        (levelFilter === 'all' || a.level === Number(levelFilter)) && (modeFilter === 'all' || a.mode === modeFilter),
    )
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  return (
    <>
      <div class="page history-page">
        <div class="page-heading has-art progress-heading">
          <SectionBackdrop name="progress-light-facet-weave-v2" format="png" />
          <div class="heading-copy">
            <span class="eyebrow">Накапливай понимание</span>
            <h1>Твой прогресс.</h1>
            <p>Каждая попытка добавляет точку на график. Возвращайся к разборам и наблюдай, как меняются результаты.</p>
          </div>
        </div>
        <div class="stats-grid">
          {LEVELS.map((level) => {
            const stats = levelStats(state, level.id, questions);
            const hasAnswered = stats.exams.some((exam) => Object.keys(exam.answers).length > 0);
            return (
              <>
                <article class={`stats-card theme-${level.id}`}>
                  <SectionBackdrop
                    name={`stats-level-${level.id}-ribbon-wave-light`}
                    format="png"
                    sizes="(max-width: 570px) calc(100vw - 32px), (max-width: 680px) calc(100vw - 44px), (max-width: 820px) calc((100vw - 70px) / 3), (max-width: 1296px) calc((100vw - 104px) / 3), 397.34px"
                  />
                  <div class="stats-card-heading">
                    <span class="badge">Уровень {level.id}</span>
                    <div class="stats-card-art">
                      <Art variant={level.id} progress={true} />
                    </div>
                  </div>
                  <h2>{level.name}</h2>
                  <div class={`stats-value ${hasAnswered ? '' : 'stats-value-empty'}`}>
                    {hasAnswered ? `${formatPercent(stats.best ?? 0)}%` : '–'}
                    <span>{hasAnswered ? 'лучший результат' : 'пока нет результата'}</span>
                  </div>
                  <div
                    class={`mini-chart ${hasAnswered ? '' : 'mini-chart-empty'}`}
                    role="group"
                    aria-label={
                      hasAnswered
                        ? `Последние попытки: ${stats.exams
                            .slice(-8)
                            .map((a) => `${formatPercent(scoreAttempt(a, questions).percent)} процентов`)
                            .join(', ')}`
                        : 'Нет данных о результатах попыток'
                    }
                  >
                    {hasAnswered ? (
                      stats.exams.slice(-8).map((a) => {
                        const score = scoreAttempt(a, questions);
                        return (
                          <>
                            <a
                              href={`#/results/${a.id}`}
                              class="chart-column"
                              aria-label={`Открыть разбор результата: ${formatDate(a.completedAt || '')}, ${formatPercent(score.percent)}%`}
                              title={`${formatDate(a.completedAt || '')}: ${formatPercent(score.percent)}%`}
                            >
                              <span>{formatPercent(score.percent)}</span>
                              <i aria-hidden="true" style={{ height: `${Math.max(score.percent, 3)}%` }} />
                            </a>
                          </>
                        );
                      })
                    ) : (
                      <>
                        <span aria-hidden="true">–</span>
                      </>
                    )}
                  </div>
                  <div class="stats-card-footer">
                    <span>{plural(stats.exams.length, ['полная попытка', 'полные попытки', 'полных попыток'])}</span>
                    {savedAttempts.some((a) => a.level === level.id) && (
                      <>
                        <button
                          class="button secondary danger small"
                          aria-label={`Очистить результаты уровня ${level.id}`}
                          onClick={() => onClearLevel(level.id)}
                        >
                          <Icon name="trash" size={15} />
                          Очистить
                        </button>
                      </>
                    )}
                  </div>
                </article>
              </>
            );
          })}
        </div>
        <section class="history-list-section">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Все сохранённые результаты</span>
              <h2>История попыток</h2>
            </div>
            {state.history.length ? (
              <>
                <div class="history-filters">
                  <SelectField
                    label="Уровень в истории"
                    value={levelFilter}
                    onChange={setLevelFilter}
                    options={[
                      { value: 'all', label: 'Все уровни' },
                      ...LEVELS.map((l) => ({ value: String(l.id), label: `Уровень ${l.id}` })),
                    ]}
                  />
                  <SelectField
                    label="Режим в истории"
                    value={modeFilter}
                    onChange={setModeFilter}
                    options={[
                      { value: 'all', label: 'Все попытки' },
                      { value: 'exam', label: 'Полные экзамены' },
                      { value: 'mistakes', label: 'Работа над ошибками' },
                    ]}
                  />
                </div>
              </>
            ) : null}
          </div>
          {history.length ? (
            <>
              <div class="history-table-wrap">
                <table class="history-table" role="table">
                  <thead role="rowgroup">
                    <tr role="row">
                      <th scope="col" role="columnheader">
                        Тест
                      </th>
                      <th scope="col" role="columnheader">
                        Дата
                      </th>
                      <th scope="col" role="columnheader">
                        Результат
                      </th>
                      <th scope="col" role="columnheader">
                        <span class="sr-only">Действие</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {history.map((a) => {
                      const score = scoreAttempt(a, questions);
                      const outcome = resultOutcome(score.percent);
                      return (
                        <>
                          <tr role="row">
                            <td role="cell">
                              <span class={`history-level theme-${a.level}`}>0{a.level}</span>
                              <span class={`history-title theme-${a.level}`}>
                                <strong>{levelById(a.level)?.name ?? ''}</strong>
                                <small>
                                  {a.mode === 'exam' ? 'Полный экзамен' : 'Работа над ошибками'} · {plural(score.total)}
                                </small>
                              </span>
                            </td>
                            <td role="cell">
                              <span class="history-field-label" aria-hidden="true">
                                Дата
                              </span>
                              {formatDate(a.completedAt || '')}
                            </td>
                            <td role="cell">
                              <span class="history-field-label" aria-hidden="true">
                                Результат
                              </span>
                              <strong
                                class={`history-score theme-${a.level} outcome-${outcome.id}`}
                                title={outcome.achievement}
                              >
                                <Icon name={outcome.icon} size={17} />
                                <span class="sr-only">{outcome.achievement}: </span>
                                {formatPercent(score.percent)}%
                              </strong>
                              <span class="history-fraction">
                                <span class={`history-fraction-earned outcome-${outcome.id}`}>{score.correct}</span> /{' '}
                                {score.total}
                              </span>
                            </td>
                            <td role="cell">
                              <a class={`text-button theme-${a.level}`} href={`#/results/${a.id}`}>
                                Разбор
                                <Icon name="arrow" size={17} />
                              </a>
                            </td>
                          </tr>
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <EmptyState
                icon="chart"
                title={state.history.length ? 'Нет попыток с такими условиями' : 'Здесь появится твоя история'}
                backdrop={
                  !state.history.length && (
                    <>
                      <SectionBackdrop
                        name="history-lens-light"
                        format="png"
                        sizes="(max-width: 570px) calc(100vw - 32px), (max-width: 820px) calc(100vw - 44px), (max-width: 1296px) calc(100vw - 64px), 1232px"
                      />
                    </>
                  )
                }
              >
                <p>
                  {state.history.length
                    ? 'Попробуй другой фильтр.'
                    : 'Пройди первый тест. Мы сохраним результат и разбор всех ответов.'}
                </p>
                <a class="button primary" href="#/">
                  Выбрать тест
                  <Icon name="arrow" size={17} />
                </a>
              </EmptyState>
            </>
          )}
        </section>
        <section class="data-panel" aria-labelledby="storage-title">
          <div>
            <span class="eyebrow">Твои данные под контролем</span>
            <h2 id="storage-title">Сохранения на этом устройстве</h2>
            <p>
              Прогресс хранится в этом браузере. Скачай копию перед очисткой данных браузера или переносом на другое
              устройство. Полные экзамены и работа над ошибками учитываются отдельно.
            </p>
          </div>
          <div class="data-actions" role="group" aria-label="Действия с сохранениями">
            <div class="data-backup-actions" role="group" aria-label="Резервная копия">
              <button class="button primary" onClick={onBackup}>
                <Icon name="download" size={17} />
                Скачать копию
              </button>
              <label class="button secondary import-button">
                <Icon name="upload" size={17} />
                Восстановить из копии
                <input class="file-input" type="file" accept="application/json,.json" onChange={onImport} />
              </label>
            </div>
            {(savedAttempts.length > 0 || hasProtectedData) && (
              <>
                <div class="data-clear-actions">
                  <button type="button" class="text-button danger-text data-clear-link" onClick={onClearAll}>
                    <Icon name="trash" size={16} />
                    Очистить все результаты
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function Study({ questions, initialDomain = 1 }: StudyProps) {
  const [domainId, setDomainId] = useState(Number(initialDomain) || 1);
  const [query, setQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const domain = DOMAINS.find((d) => d.id === domainId) || DOMAINS[0];
  const relevant = questions.filter((q) => q.domain === domain.id);
  const sourcesByTopic = new Map<string, Map<string, Source>>();
  for (const question of relevant) {
    const topicSources = sourcesByTopic.get(question.topic) || new Map();
    for (const source of question.sources) topicSources.set(source.url, source);
    sourcesByTopic.set(question.topic, topicSources);
  }
  const topics = [...sourcesByTopic.keys()];
  const allSources = [...new Map(relevant.flatMap((q) => q.sources).map((s) => [s.url, s])).values()];
  const topicSources = selectedTopic ? [...(sourcesByTopic.get(selectedTopic)?.values() || [])] : allSources;
  const sources = topicSources.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()));
  const selectTopic = (topic: string) => {
    setSelectedTopic(selectedTopic === topic ? '' : topic);
    setQuery('');
    const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ? 'auto'
      : 'smooth';
    document.getElementById(`study-sources-${domain.id}`)?.scrollIntoView?.({ behavior, block: 'start' });
  };
  return (
    <>
      <div class="page study-page">
        <div class="page-heading has-art knowledge-heading">
          <SectionBackdrop name="study-phase-rosettes" />
          <div class="heading-copy">
            <span class="eyebrow">От ошибки к пониманию</span>
            <h1>Карта подготовки.</h1>
            <p>Краткие памятки по шести доменам и открытые источники, на которых построены задания.</p>
          </div>
        </div>
        <div class="study-layout">
          <aside class="study-nav" aria-label="Домены программы">
            {DOMAINS.map((d) => (
              <>
                <button
                  class={domain.id === d.id ? 'active' : ''}
                  aria-pressed={domain.id === d.id}
                  onClick={() => {
                    setDomainId(d.id);
                    setQuery('');
                    setSelectedTopic('');
                  }}
                >
                  <span class="study-nav-icon">
                    <Icon name={d.icon} size={20} />
                  </span>
                  <span>
                    <strong>{d.short}</strong>
                    <small>
                      Домен {d.id} · около {d.weight}% экзамена
                    </small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </>
            ))}
          </aside>
          <section class="study-content" key={domain.id}>
            <div class="study-domain-heading">
              <span class="eyebrow">Домен 0{domain.id}</span>
              <span class="badge">30 вопросов в трёх уровнях</span>
              <h2>{domain.title}</h2>
              <p>{domain.description}</p>
            </div>
            <div class="study-guide">
              {domain.guide.map(([title, body], index) => (
                <>
                  <article>
                    <span class="guide-index">0{index + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{body}</p>
                    </div>
                  </article>
                </>
              ))}
            </div>
            <details class="accordion accordion--surface topic-coverage">
              <summary>
                Какие темы проверяют задания
                <Icon name="chevron" size={16} />
              </summary>
              <div class="details-content">
                <div class="details-content-inner">
                  <div class="topic-copy">
                    <div class="topic-tags">
                      {topics.map((topic) => (
                        <>
                          <button
                            type="button"
                            aria-pressed={selectedTopic === topic}
                            aria-label={`Показать материалы по теме: ${topic}`}
                            onClick={() => selectTopic(topic)}
                          >
                            {topic}
                          </button>
                        </>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
            <section class="study-sources" id={`study-sources-${domain.id}`}>
              <div class="section-heading compact">
                <h3>Читать по теме</h3>
                <span>{plural(sources.length, ['источник', 'источника', 'источников'])}</span>
              </div>
              {selectedTopic && (
                <>
                  <div class="topic-filter-status" aria-live="polite">
                    <span>
                      Материалы по теме: <strong>{selectedTopic}</strong>
                    </span>
                    <button class="text-button" type="button" onClick={() => setSelectedTopic('')}>
                      Показать все
                    </button>
                  </div>
                </>
              )}
              <label class="source-search">
                <Icon name="search" size={18} />
                <input
                  type="search"
                  aria-label="Найти материал по названию"
                  placeholder="Найти материал по названию"
                  value={query}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
              </label>
              {sources.length ? (
                <>
                  <SourceLinks sources={sources} />
                </>
              ) : (
                <>
                  <p class="quiet">
                    Материалов с таким названием нет.{' '}
                    {selectedTopic ? 'Выбери другую тему или покажи все материалы.' : 'Измени запрос.'}
                  </p>
                </>
              )}
            </section>
          </section>
        </div>
        <section class="official-reading">
          <div class="section-heading">
            <div>
              <h2>Рекомендованные материалы</h2>
              <div class="official-platform">
                <PlatformMark />
                <p>Курсы и документация из перечня организатора экзамена.</p>
              </div>
            </div>
            <a class="text-button" href={PROGRAM_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLinkLabel text="Программа экзамена" size={15} />
            </a>
          </div>
          <div class="official-grid">
            {OFFICIAL_RESOURCES.map((r) => (
              <>
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  <span class="official-resource-icon">
                    <Icon name="book" size={19} />
                  </span>
                  <span>
                    <strong>{r.title}</strong>
                    <small>{r.note}</small>
                  </span>
                  <Icon name="external" size={16} />
                </a>
              </>
            ))}
          </div>
          <p class="study-source-note">
            Источники проверены {RESEARCH_DATE.toLowerCase()}. Для части курсов требуется регистрация; некоторые
            страницы ограничивают автоматическое чтение. Их закрытые уроки не включены в проект: темы раскрыты по
            открытой документации и первичным материалам. Полный журнал источников и ограничений смотри в папке docs
            проекта. Возможности и условия продуктов могут меняться.
          </p>
        </section>
      </div>
    </>
  );
}
