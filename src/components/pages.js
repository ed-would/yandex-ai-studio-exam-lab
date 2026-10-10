import { useState } from 'preact/hooks';
import {
  DOMAINS,
  LEVELS,
  OFFICIAL_RESOURCES,
  PROGRAM_URL,
  RESEARCH_DATE,
  TRAINING_TARGET,
  levelById,
} from '../data/meta.js';
import { levelStats, scoreAttempt, sessionKey } from '../core/exam.js';
import {
  html,
  Art,
  SectionBackdrop,
  PlatformMark,
  EmptyState,
  Icon,
  ProgressBar,
  SourceLinks,
  formatDate,
  formatPercent,
  plural,
} from './ui.js';
export { Results } from './results-page.js';
import { SelectField } from './select-field.js';

export function Home({ state, questions, onStart, onRestart }) {
  const finished = state.history.filter((a) => a.mode === 'exam');
  const practiced = new Set(state.history.flatMap((a) => Object.keys(a.answers)));
  for (const a of Object.values(state.sessions)) Object.keys(a.answers).forEach((id) => practiced.add(id));
  return html`<div class="page home-page">
    <section class="hero"><div class="hero-copy"><div class="exam-brand"><span>Подготовка к экзамену на платформе</span><${PlatformMark}/></div><h1>Основы<br/>работы с ИИ</h1><p class="hero-description">От первого промпта до сложных решений.<br class="desktop-only"/> Три тренировочных теста, подробные разборы<br class="desktop-only"/> и понятная карта подготовки.</p><div class="hero-actions"><a class="button primary" href="#levels">Выбрать тест<${Icon} name="arrow" size=${19}/></a><a class="text-button" href="#/study"><${Icon} name="map" size=${18}/>Карта подготовки</a></div><div class="hero-caption"><span class="live-dot"/>180 авторских вопросов · без регистрации</div></div><div class="hero-visual"><${Art} hero=${true}/><span class="hero-art-caption">Понимать. Применять. Связывать.</span></div></section>
    <div class="overview-strip"><div><span class="overview-number">3</span><span>уровня сложности</span></div><div><span class="overview-number">6</span><span>доменов в каждом</span></div><div><span class="overview-number">60</span><span>вопросов в тесте</span></div><div class="overview-personal"><span class="overview-number">${practiced.size}<small>/180</small></span><span>вопросов уже разобрано</span></div></div>
    <section class="levels-section" id="levels"><${SectionBackdrop} name="studio-01-three-trajectories" format="webp"/><div class="section-heading"><div><span class="eyebrow">Твоя траектория</span><h2>Выбери свою точку старта</h2></div><p>Начни с любого уровня.<br/>Результаты сохраняются отдельно.</p></div><div class="level-grid">${LEVELS.map(
      (level) => {
        const stats = levelStats(state, level.id, questions);
        const active = state.sessions[sessionKey(level.id)];
        const reviewed = active ? Object.keys(active.answers).length : 0;
        return html`<article class=${`level-card theme-${level.id}`} key=${level.id}><div class="level-card-top"><span class="level-number">Уровень ${level.id}</span><span class="badge">${level.tag}</span></div><div class="level-art"><${Art} variant=${level.id}/></div><div class="level-card-copy"><span class="level-kicker">${level.kicker}</span><h3>${level.name}</h3><p>${level.description}</p></div><div class="level-metrics"><span>60 вопросов</span><span>${stats.best !== null ? html`Лучший: <strong>${formatPercent(stats.best)}%</strong>` : 'Первый шаг впереди'}</span></div>${active ? html`<div class="card-progress"><${ProgressBar} value=${reviewed} max=${60} label=${`Прогресс уровня ${level.id}`}/><span>${reviewed} из 60 проверено</span></div>` : stats.latest ? html`<div class="card-progress completed-caption"><${Icon} name="check" size=${15}/>Последний результат: ${formatPercent(stats.latestScore.percent)}%</div>` : html`<div class="card-progress quiet">Один ответ · мультивыбор · пары</div>`}<button class="button level-button" data-start=${level.id} onClick=${() => onStart(level.id)}>${active ? 'Продолжить' : stats.exams.length ? 'Пройти ещё раз' : 'Начать тест'}<${Icon} name="arrow" size=${18}/></button>${active && html`<button class="text-button restart-link" onClick=${() => onRestart(level.id)}>Начать заново</button>`}</article>`;
      },
    )}</div></section>
    ${
      Object.values(state.sessions).some((a) => a.mode === 'mistakes') &&
      html`<section class="resume-practice"><${Icon} name="refresh"/><div><strong>Есть незавершённый разбор ошибок</strong><p>Эти тренировки сохраняются отдельно от полных экзаменов.</p></div><div class="resume-links">${Object.values(
        state.sessions,
      )
        .filter((a) => a.mode === 'mistakes')
        .map(
          (a) =>
            html`<a class="button secondary small" href=${`#/mistakes/${a.level}`}>Уровень ${a.level}<${Icon} name="arrow" size=${16}/></a>`,
        )}</div></section>`
    }
    <section class="home-lower" aria-label="Программа и практика">
      <article class="curriculum-panel lower-panel">
        <div class="lower-panel-heading"><span class="eyebrow">Программа экзамена</span><h2>Шесть областей<br/>знаний</h2></div>
        <div class="domain-list">${DOMAINS.map((domain) => html`<a class="domain-row" href=${`#/study/${domain.id}`}><span class="domain-icon"><${Icon} name=${domain.icon}/></span><span><strong>${domain.short}</strong><small>${domain.description}</small></span><span class="domain-index">0${domain.id}</span></a>`)}</div>
        <div class="lower-panel-footer"><p class="lower-panel-caption">По 10 вопросов в каждой области на каждом уровне.</p><a class="button secondary" href="#/study">Карта подготовки<${Icon} name="arrow" size=${18}/></a></div>
      </article>
      <article class="how-panel lower-panel"><${SectionBackdrop} name="practice-folded-paths" format="webp"/>
        <div class="lower-panel-heading"><span class="eyebrow">Учёба через практику</span><h2>Каждый ответ<br/>становится уроком.</h2></div>
        <div class="how-steps">
          <div class="how-step"><span>01</span><div><h3>Выбирай и проверяй</h3><p>До проверки можно изменить выбор или разорвать связь в сопоставлении.</p></div></div>
          <div class="how-step"><span>02</span><div><h3>Разбирай причину</h3><p>Сразу увидишь результат, объяснение и короткую памятку. Проверенный ответ зафиксирован.</p></div></div>
          <div class="how-step"><span>03</span><div><h3>Возвращайся сильнее</h3><p>Изучи материалы, повтори ошибки или пересдай уровень. История покажет прогресс.</p></div></div>
        </div>
        <div class="practice-note"><${Icon} name="clock" size=${20}/><div><strong>В своём темпе</strong><p>Тренируйся без таймера. Можно прервать попытку и вернуться к ней позже.</p></div></div>
        <div class="lower-panel-footer"><a class="button secondary" href="#/history">${finished.length ? 'Посмотреть прогресс' : 'Как устроен прогресс'}<${Icon} name="chart" size=${18}/></a></div>
      </article>
    </section>
  </div>`;
}

export function History({ state, questions, onClearLevel, onClearAll, onBackup, onImport }) {
  const [levelFilter, setLevelFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const history = state.history
    .filter(
      (a) =>
        (levelFilter === 'all' || a.level === Number(levelFilter)) && (modeFilter === 'all' || a.mode === modeFilter),
    )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return html`<div class="page history-page"><div class="page-heading has-art progress-heading"><${SectionBackdrop} name="progress-prismatic-weave" format="webp"/><div class="heading-copy"><span class="eyebrow">Накапливай понимание</span><h1>Твой прогресс.</h1><p>Каждая попытка — отдельная точка. Возвращайся к разборам и наблюдай, как меняются результаты.</p></div></div><div class="stats-grid">${LEVELS.map(
    (level) => {
      const stats = levelStats(state, level.id, questions);
      const hasAnswered = stats.exams.some((exam) => Object.keys(exam.answers).length > 0);
      return html`<article class=${`stats-card theme-${level.id}`}><div class="stats-card-heading"><span class="badge">Уровень ${level.id}</span><div class="stats-card-art"><${Art} variant=${level.id} progress=${true}/></div></div><h2>${level.name}</h2>${
        hasAnswered &&
        html`<div class="stats-value">${formatPercent(stats.best)}%<span>лучший результат</span></div><div class="mini-chart" role="group" aria-label=${`Последние попытки: ${stats.exams
          .slice(-8)
          .map((a) => `${formatPercent(scoreAttempt(a, questions).percent)} процентов`)
          .join(', ')}`}>${stats.exams.slice(-8).map((a) => {
          const score = scoreAttempt(a, questions);
          return html`<a href=${`#/results/${a.id}`} class="chart-column" aria-label=${`Открыть разбор результата: ${formatDate(a.completedAt)}, ${formatPercent(score.percent)}%`} title=${`${formatDate(a.completedAt)}: ${formatPercent(score.percent)}%`}><span>${Math.round(score.percent)}</span><i aria-hidden="true" style=${{ height: `${Math.max(score.percent, 3)}%` }}/></a>`;
        })}</div>`
      }<div class="stats-card-footer"><span>${stats.exams.length} ${stats.exams.length === 1 ? 'полная попытка' : stats.exams.length > 1 && stats.exams.length < 5 ? 'полные попытки' : 'полных попыток'}</span><button class="text-button" aria-label=${`Очистить результаты уровня ${level.id}`} onClick=${() => onClearLevel(level.id)}><${Icon} name="trash" size=${15}/>Очистить</button></div></article>`;
    },
  )}</div><section class="history-list-section"><div class="section-heading"><div><span class="eyebrow">Все сохранённые результаты</span><h2>История попыток</h2></div><div class="history-filters"><${SelectField} label="Уровень в истории" value=${levelFilter} onChange=${setLevelFilter} options=${[{ value: 'all', label: 'Все уровни' }, ...LEVELS.map((l) => ({ value: String(l.id), label: `Уровень ${l.id}` }))]}/><${SelectField} label="Режим в истории" value=${modeFilter} onChange=${setModeFilter} options=${[
    { value: 'all', label: 'Все попытки' },
    { value: 'exam', label: 'Полные экзамены' },
    { value: 'mistakes', label: 'Работа над ошибками' },
  ]}/></div></div>${
    history.length
      ? html`<div class="history-table-wrap"><table class="history-table"><thead><tr><th>Тест</th><th>Дата</th><th>Результат</th><th><span class="sr-only">Действие</span></th></tr></thead><tbody>${history.map(
          (a) => {
            const score = scoreAttempt(a, questions);
            return html`<tr><td><span class=${`history-level theme-${a.level}`}>0${a.level}</span><span class="history-title"><strong>${levelById(a.level).name}</strong><small>${a.mode === 'exam' ? 'Полный экзамен' : 'Работа над ошибками'} · ${plural(score.total)}</small></span></td><td>${formatDate(a.completedAt)}</td><td><strong class=${score.percent >= TRAINING_TARGET ? 'positive-text' : ''}>${formatPercent(score.percent)}%</strong><span class="history-fraction">${score.correct} / ${score.total}</span></td><td><a class="text-button" href=${`#/results/${a.id}`}>Разбор<${Icon} name="arrow" size=${17}/></a></td></tr>`;
          },
        )}</tbody></table></div>`
      : html`<${EmptyState} icon="chart" title=${state.history.length ? 'Нет попыток с такими условиями' : 'Здесь появится твоя история'}><p>${state.history.length ? 'Попробуй другой фильтр.' : 'Пройди первый тест. Мы сохраним результат и разбор всех ответов.'}</p><a class="button primary" href="#/">Выбрать тест<${Icon} name="arrow" size=${17}/></a></${EmptyState}>`
  }</section><section class="data-panel"><div><span class="eyebrow">Твои данные под контролем</span><h2>Сохранения на этом устройстве</h2><p>Прогресс хранится в этом браузере. Скачай копию перед очисткой данных браузера или переносом на другое устройство. Полные экзамены и работа над ошибками учитываются отдельно.</p></div><div class="data-actions"><button class="button secondary" onClick=${onBackup}><${Icon} name="download" size=${17}/>Скачать копию</button><label class="button secondary import-button"><${Icon} name="upload" size=${17}/>Восстановить из копии<input class="file-input" type="file" accept="application/json,.json" onChange=${onImport}/></label><button class="text-button danger-text" onClick=${onClearAll}><${Icon} name="trash" size=${16}/>Очистить все результаты</button></div></section></div>`;
}

export function Study({ questions, initialDomain = 1 }) {
  const [domainId, setDomainId] = useState(Number(initialDomain) || 1);
  const [query, setQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const domain = DOMAINS.find((d) => d.id === domainId) || DOMAINS[0];
  const relevant = questions.filter((q) => q.domain === domain.id);
  const sourcesByTopic = new Map();
  for (const question of relevant) {
    const topicSources = sourcesByTopic.get(question.topic) || new Map();
    for (const source of question.sources) topicSources.set(source.url, source);
    sourcesByTopic.set(question.topic, topicSources);
  }
  const topics = [...sourcesByTopic.keys()];
  const allSources = [...new Map(relevant.flatMap((q) => q.sources).map((s) => [s.url, s])).values()];
  const topicSources = selectedTopic ? [...(sourcesByTopic.get(selectedTopic)?.values() || [])] : allSources;
  const sources = topicSources.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()));
  const selectTopic = (topic) => {
    setSelectedTopic(selectedTopic === topic ? '' : topic);
    setQuery('');
    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
    document.getElementById(`study-sources-${domain.id}`)?.scrollIntoView?.({ behavior, block: 'start' });
  };
  return html`<div class="page study-page"><div class="page-heading has-art knowledge-heading"><${SectionBackdrop} name="study-phase-rosettes"/><div class="heading-copy"><span class="eyebrow">От ошибки к пониманию</span><h1>Карта подготовки.</h1><p>Короткие опоры по шести доменам и открытые источники, на которых построены задания.</p></div></div><div class="study-layout"><aside class="study-nav" aria-label="Домены программы">${DOMAINS.map(
    (d) =>
      html`<button class=${domain.id === d.id ? 'active' : ''} aria-pressed=${domain.id === d.id} onClick=${() => {
        setDomainId(d.id);
        setQuery('');
        setSelectedTopic('');
      }}><span class="study-nav-icon"><${Icon} name=${d.icon} size=${20}/></span><span><strong>${d.short}</strong><small>Домен ${d.id} · около ${d.weight}% экзамена</small></span><${Icon} name="arrow" size=${16}/></button>`,
  )}</aside><section class="study-content" key=${domain.id}><div class="study-domain-heading"><span class="eyebrow">Домен 0${domain.id}</span><span class="badge">30 вопросов в трёх уровнях</span><h2>${domain.title}</h2><p>${domain.description}</p></div><div class="study-guide">${domain.guide.map(([title, body], index) => html`<article><span class="guide-index">0${index + 1}</span><div><h3>${title}</h3><p>${body}</p></div></article>`)}</div><details class="accordion accordion--inline topic-coverage"><summary>Какие темы проверяют задания<${Icon} name="chevron" size=${16}/></summary><div class="details-content"><div class="details-content-inner"><div class="topic-copy"><div class="topic-tags">${topics.map((topic) => html`<button type="button" aria-pressed=${selectedTopic === topic} aria-label=${`Показать материалы по теме: ${topic}`} onClick=${() => selectTopic(topic)}>${topic}</button>`)}</div></div></div></div></details><section class="study-sources" id=${`study-sources-${domain.id}`}><div class="section-heading compact"><h3>Читать по теме</h3><span>${plural(sources.length, ['источник', 'источника', 'источников'])}</span></div>${selectedTopic && html`<div class="topic-filter-status" aria-live="polite"><span>Материалы по теме: <strong>${selectedTopic}</strong></span><button class="text-button" type="button" onClick=${() => setSelectedTopic('')}>Показать все</button></div>`}<label class="source-search"><${Icon} name="search" size=${18}/><input type="search" aria-label="Найти материал по названию" placeholder="Найти материал по названию" value=${query} onInput=${(e) => setQuery(e.currentTarget.value)}/></label>${sources.length ? html`<${SourceLinks} sources=${sources}/>` : html`<p class="quiet">Материалов с таким названием нет. ${selectedTopic ? 'Выбери другую тему или покажи все материалы.' : 'Измени запрос.'}</p>`}</section></section></div><section class="official-reading"><div class="official-platform"><${PlatformMark}/><span>Материалы платформы для подготовки</span></div><div class="section-heading"><div><span class="eyebrow">Из перечня организатора</span><h2>Рекомендованные материалы</h2></div><a class="text-button" href=${PROGRAM_URL} target="_blank" rel="noopener noreferrer">Программа экзамена<${Icon} name="external" size=${15}/></a></div><div class="official-grid">${OFFICIAL_RESOURCES.map((r) => html`<a href=${r.url} target="_blank" rel="noopener noreferrer"><span class="official-resource-icon"><${Icon} name="book" size=${19}/></span><span><strong>${r.title}</strong><small>${r.note}</small></span><${Icon} name="external" size=${16}/></a>`)}</div><p class="study-source-note">Источники проверены ${RESEARCH_DATE.toLowerCase()}. Для части курсов требуется регистрация; некоторые страницы ограничивают автоматическое чтение. Их закрытые уроки не включены в проект: темы раскрыты по открытой документации и первичным материалам. Полный журнал источников и ограничений — в папке docs проекта. Возможности и условия продуктов могут меняться.</p></section></div>`;
}
