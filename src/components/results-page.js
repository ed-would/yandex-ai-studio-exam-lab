import { useMemo, useState } from 'preact/hooks';
import { DOMAINS, TRAINING_TARGET, levelById } from '../data/meta.js';
import { evaluate, scoreAttempt } from '../core/exam.js';
import { resultCoaching } from '../core/coaching.js';
import { html, SectionBackdrop, EmptyState, Icon, formatDate, formatPercent, plural, TimerOption } from './ui.js';
import { ReviewItem } from './questions.js';
import { SelectField } from './select-field.js';
import { CompletionConfetti } from './completion-confetti.js';
import { ProgressBar } from './progress-bar.js';

export function Results({
  attempt,
  questions,
  state,
  onRestart,
  onMistakes,
  onExportReport,
  celebrate = false,
  onCelebrationConsumed,
  timed,
  onTimedChange,
}) {
  const [filter, setFilter] = useState('all');
  const [domain, setDomain] = useState('all');
  const bank = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const coaching = useMemo(() => resultCoaching(attempt, questions), [attempt, questions]);
  const { score, outcome, domains, priorities, strong, skipped, isPractice, needed, formatFocus } = coaching;
  const percent = formatPercent(score.percent);
  const scoreTargetMissed = !isPractice && score.percent < TRAINING_TARGET;
  const scoreTarget = isPractice
    ? null
    : score.percent >= TRAINING_TARGET
      ? 'Цель достигнута'
      : `До цели осталось ${formatPercent(TRAINING_TARGET - score.percent)} %`;
  const level = levelById(attempt.level);
  const reviewScore = domain === 'all' ? score : score.byDomain.find((row) => row.domain === Number(domain));
  const entries = attempt.questionIds
    .map((id, i) => ({
      question: bank.get(id),
      answer: attempt.answers[id],
      number: i + 1,
    }))
    .filter(({ question }) => domain === 'all' || question.domain === Number(domain));
  const filtered = entries.filter(({ question, answer }) => {
    if (filter === 'correct') return Boolean(answer) && evaluate(question, answer.response);
    if (filter === 'incorrect') return Boolean(answer) && !evaluate(question, answer.response);
    if (filter === 'unanswered') return !answer;
    if (filter === 'bookmarks') return attempt.bookmarks.includes(question.id);
    return true;
  });
  const previous = state.history
    .filter((a) => a.mode === 'exam' && a.level === attempt.level && a.completedAt < attempt.completedAt)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const delta =
    previous && !isPractice ? Math.round((score.percent - scoreAttempt(previous, questions).percent) * 10) / 10 : null;
  const canAdvance = !isPractice && !score.unanswered && score.percent >= TRAINING_TARGET && attempt.level < 3;
  let primary;
  if (!score.answered) primary = { text: 'Начать новую попытку', action: () => onRestart(attempt.level) };
  else if (isPractice && !score.incorrect)
    primary = { text: 'Проверить себя полным тестом', action: () => onRestart(attempt.level) };
  else if (priorities.length && score.percent < TRAINING_TARGET)
    primary = { text: 'Повторить ключевую тему', href: `#/study/${priorities[0].id}` };
  else if (canAdvance)
    primary = { text: `Попробовать уровень ${attempt.level + 1}`, action: () => onRestart(attempt.level + 1, true) };
  else if (score.incorrect)
    primary = { text: `Точечная тренировка (${score.incorrect})`, action: () => onMistakes(attempt) };
  else primary = { text: 'Закрепить знания в материалах', href: '#/study' };

  const primaryIcon = primary.href ? 'book' : canAdvance ? 'arrow' : 'refresh';

  function openReview(domainId = 'all', status = 'all') {
    setDomain(String(domainId));
    setFilter(status);
    const heading = document.getElementById('results-review-title');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  }

  return html`<div class=${`page results-page theme-${attempt.level} outcome-${outcome.id}`}>
    <${CompletionConfetti} enabled=${celebrate && score.answered > 0} onConsumed=${onCelebrationConsumed} vivid=${score.percent >= TRAINING_TARGET && !score.unanswered}/>
    <div class="breadcrumb"><a href="#/">Тесты</a><span>/</span><span>Уровень ${attempt.level} · ${level.name}</span></div>
    <section class="outcome-hero" aria-labelledby="outcome-title">
      <${SectionBackdrop} name=${outcome.background} format="png"/>
      <div class="outcome-copy">
        <div class="outcome-context"><span class="badge">${isPractice ? 'Работа над ошибками' : `${level.name} уровень`}</span><time class="outcome-date" datetime=${attempt.completedAt}><${Icon} name="calendar" size=${16}/><span class="sr-only">Завершено </span><span>${formatDate(attempt.completedAt)}</span></time></div>
        <span class="achievement-label"><${Icon} name=${outcome.icon} size=${21}/>${outcome.achievement}</span>
        <h1 id="outcome-title">${outcome.title}</h1>
        <p class="outcome-description">${outcome.description}</p>
        ${delta !== null && html`<p class=${`outcome-delta ${delta > 0 ? 'improved' : ''}`}><${Icon} name=${delta > 0 ? 'chart' : 'clock'} size=${17}/>${delta > 0 ? '+' : ''}${formatPercent(delta)}% к предыдущей полной попытке</p>`}
        ${primary.action && html`<${TimerOption} enabled=${timed} onChange=${onTimedChange}/>`}
        <div class="outcome-actions">${
          primary.href
            ? html`<a class="button primary" href=${primary.href}><${Icon} name=${primaryIcon} size=${18}/>${primary.text}</a>`
            : html`<button class="button primary" onClick=${primary.action}><${Icon} name=${primaryIcon} size=${18}/>${primary.text}</button>`
        }
          <button class="text-button" onClick=${() => openReview()}><${Icon} name="search" size=${18}/>Разобрать ответы</button>
        </div>
      </div>
      <div class="outcome-score">
        <div class="score-orbit" style=${{ '--score': `${score.percent}%` }}><div><span class=${`score-number ${percent.length > 2 ? 'score-number-wide' : ''}`}>${percent}<small>%</small></span>${scoreTarget && html`<span class=${`score-target score-target-status${scoreTargetMissed ? ' score-target-remaining' : ''}`}>${scoreTarget}</span>`}</div></div>
      </div>
      <dl class="outcome-facts"><div><dt>Верно</dt><dd class=${score.correct > 0 ? 'correct' : ''}>${score.correct}<small> / ${score.total}</small></dd></div><div><dt>Ошибки</dt><dd class=${score.wrong > 0 ? 'incorrect' : ''}>${score.wrong}</dd></div><div><dt>Пропущено</dt><dd>${score.unanswered}</dd></div><div><dt>Тем с результатом от ${TRAINING_TARGET}%</dt><dd class=${strong.length > 0 ? 'correct' : ''}>${strong.length}<small> / ${domains.length}</small></dd></div></dl>
    </section>

    <section class="coaching-section" aria-labelledby="coaching-title">
      <div class="section-heading"><div><h2 id="coaching-title">${priorities.length ? 'Что подтянуть в первую очередь' : score.unanswered ? 'Что проверить дальше' : !score.answered ? 'Сначала ответь на вопросы' : 'Что уже получилось'}</h2><p>${priorities.length ? `Рекомендации по ошибкам в этой попытке. Выбраны ${priorities.length > 3 ? 'три приоритетные темы' : 'темы, которым стоит уделить внимание'}.` : score.unanswered ? 'Непроверенные ответы не показывают уровень знаний. Сначала оцени себя по этим темам.' : !score.answered ? 'Ответь на вопросы, и здесь появятся рекомендации.' : isPractice ? 'В выбранной подборке ошибок нет. Теперь проверь весь уровень.' : 'В этой попытке ошибок нет. Можно закрепить знания и перейти к более сложным задачам.'}</p></div></div>
      ${
        priorities.length
          ? html`<div class="coaching-grid">${priorities.slice(0, 3).map(
              (row) => html`<article class="coaching-card" data-coaching-domain=${row.id}>
        <header class="coaching-card-heading">
          <div class="coaching-card-identity"><span class="competency-icon"><${Icon} name=${row.icon} size=${22}/></span><h3>${row.short}</h3></div>
          <p class="coaching-card-top">${plural(row.wrong, ['ошибка', 'ошибки', 'ошибок'])} в ${plural(row.answered, ['проверенном задании', 'проверенных заданиях', 'проверенных заданиях'])}</p>
        </header>
        <ul class="coaching-topics">${row.topics.slice(0, 2).map((topic) => html`<li>${topic.title}</li>`)}</ul>
        ${row.topics.length > 2 && html`<p class="coaching-more">Ещё ${plural(row.topics.length - 2, ['тема', 'темы', 'тем'])} в разборе</p>`}
        <p class="coaching-takeaway">${row.topics[0].takeaway}</p>
        <div class="coaching-card-actions"><a class="button secondary" href=${`#/study/${row.id}`}><${Icon} name="book" size=${18}/>Повторить тему</a><button class="text-button" onClick=${() => openReview(row.id, 'incorrect')}><${Icon} name="search" size=${18}/>Разобрать ошибки</button></div>
      </article>`,
            )}</div>`
          : score.unanswered === 0 &&
            html`<div class="coaching-clear"><span class="coaching-clear-icon"><${Icon} name=${!score.answered ? 'book' : 'shield'} size=${36}/></span><div><h3>${!score.answered ? 'Первая попытка даст точку отсчёта.' : 'Все проверенные ответы верны.'}</h3><p>${!score.answered ? 'Начни с любого уровня и проверяй каждый ответ. Можно продолжать в своём темпе.' : 'Объясни себе логику решения своими словами и попробуй применить её к другой задаче.'}</p></div></div>`
      }
      ${
        score.unanswered > 0 &&
        html`<aside class="guidance-card unanswered-summary" aria-labelledby="unanswered-summary-title">
        <div class="guidance-heading"><span class="guidance-icon"><${Icon} name="layers" size=${22}/></span><h3 id="unanswered-summary-title">${plural(score.unanswered, ['задание ждёт проверки', 'задания ждут проверки', 'заданий ждут проверки'])}</h3></div>
        <div class="unanswered-summary-details"><p class="unanswered-summary-label">По темам</p><ul class="unanswered-summary-domains" aria-label="Непроверенные задания по темам">${skipped.map((row) => html`<li aria-label=${`${row.short}: ${plural(row.skipped, ['вопрос без проверки', 'вопроса без проверки', 'вопросов без проверки'])}`}><span>${row.short}</span><span class="unanswered-summary-count" aria-hidden="true">${row.skipped}</span></li>`)}</ul></div>
        <button class="button secondary unanswered-summary-action" onClick=${() => openReview('all', 'unanswered')}><${Icon} name="search" size=${18}/>Посмотреть пропуски</button>
      </aside>`
      }
    </section>

    <section class="results-insights" aria-label="Карта знаний и план подготовки">
      <div class="competency-map"><div class="section-heading compact"><h2>Карта знаний</h2><span class="mini-label">верно / всего</span></div><p class="competency-map-caption">${isPractice ? 'Только темы этой подборки.' : 'Все шесть тем твоего уровня.'} Пропуски учитываются отдельно от ошибок.</p>
        <div class="competency-rows">${domains.map((row) => {
          const status = !row.answered
            ? 'untested'
            : row.skipped
              ? 'partial'
              : row.percent >= TRAINING_TARGET
                ? 'strong'
                : 'weak';
          const label = !row.answered
            ? 'Не проверено'
            : row.skipped
              ? 'Есть пропуски'
              : row.percent >= TRAINING_TARGET
                ? 'Хорошая опора'
                : 'Стоит повторить';
          return html`<div class=${`competency-row competency-${status}`}><span class="competency-icon"><${Icon} name=${row.icon} size=${22}/></span><div><div class="competency-caption"><a href=${`#/study/${row.id}`}>${row.short}</a><strong>${row.correct}<small> / ${row.total}</small></strong></div><${ProgressBar} value=${row.correct} max=${row.total} label=${`${row.short}: ${row.correct} верно из ${row.total}, ошибок ${row.wrong}, пропущено ${row.skipped}`}/><div class="competency-meta"><span>${label}</span><span>${row.wrong ? plural(row.wrong, ['ошибка', 'ошибки', 'ошибок']) : 'Ошибок нет'}${row.skipped ? ` · ${row.skipped} пропущено` : ''}</span></div></div></div>`;
        })}</div>
      </div>
      <aside class="preparation-plan" aria-labelledby="preparation-title"><div class="preparation-heading"><span class="plan-icon"><${Icon} name="nodes" size=${28}/></span><h2 id="preparation-title">Твой следующий шаг</h2></div><p class="plan-intro">${!score.answered ? 'Начни с практики, чтобы рекомендации стали персональными.' : isPractice ? 'Закрепи подборку, затем проверь весь уровень.' : needed ? `Для учебной цели в следующей попытке нужно минимум ${Math.ceil((score.total * TRAINING_TARGET) / 100)} верных ответов. Сейчас не хватает ещё ${plural(needed, ['ответа', 'ответов', 'ответов'])}.` : score.unanswered ? 'Учебная цель по баллам достигнута. Сначала проверь пропущенные задания, чтобы оценить подготовку по всему уровню.' : 'Цель достигнута. Закрепи результат и попробуй более сложные задачи.'}</p>
        <ol class="preparation-steps">
          <li><h3>${!score.answered ? 'Пройди первый раунд' : priorities.length ? 'Вернись к основам слабых тем' : score.unanswered ? 'Проверь пропущенные задания' : 'Усложни задачу'}</h3><p>${
            !score.answered
              ? 'Выбирай ответ и нажимай «Проверить». Объяснения помогут разобраться прямо во время теста.'
              : priorities.length
                ? `Начни с ${priorities
                    .slice(0, 2)
                    .map((row) => `«${row.short}»`)
                    .join(' и ')}. После памятки объясни принцип своими словами.`
                : score.unanswered
                  ? 'Точечная тренировка включит все пропуски этой попытки.'
                  : isPractice
                    ? 'Полный тест покажет, как закреплённые темы сочетаются с остальными.'
                    : canAdvance
                      ? 'На следующем уровне будет больше условий и рабочих ситуаций.'
                      : 'Перенеси приёмы из теста в свою рабочую задачу и проверь качество результата.'
          }</p></li>
          <li><h3>${score.incorrect ? 'Закрепи в точечной тренировке' : 'Проверь понимание'}</h3><p>${score.incorrect ? `В подборке будет ${plural(score.incorrect)}: ${score.wrong} с ошибкой и ${score.unanswered} без проверки. Обрати внимание на объяснения каждого варианта.` : 'Объясни, почему верный ответ подходит, а остальные нет.'}</p></li>
          <li><h3>${isPractice ? 'Вернись к полному тесту' : 'Проверь устойчивость результата'}</h3><p>${isPractice ? 'Результат подборки не заменяет оценку всех 60 вопросов.' : 'Пройди уровень ещё раз после повторения. Сравни результат в истории и посмотри, какие темы стали увереннее.'}</p></li>
        </ol>
        ${formatFocus && html`<div class="format-coaching"><span>Особое внимание: ${formatFocus.title.toLowerCase()}</span><p>${plural(formatFocus.wrong, ['ошибка', 'ошибки', 'ошибок'])} в ${plural(formatFocus.answered, ['проверенном задании', 'проверенных заданиях', 'проверенных заданиях'])}. ${formatFocus.tip}</p></div>`}
        <a class="text-button" href=${priorities.length ? `#/study/${priorities[0].id}` : '#/study'}><${Icon} name="book" size=${18}/>Открыть карту подготовки</a>
      </aside>
    </section>

    ${!primary.action && html`<${TimerOption} enabled=${timed} onChange=${onTimedChange}/>`}<div class="result-actions"><button class="button secondary" onClick=${() => onRestart(attempt.level)}><${Icon} name="refresh" size=${18}/>Повторить уровень</button>${score.incorrect > 0 && html`<button class="button secondary" onClick=${() => onMistakes(attempt)}><${Icon} name="refresh" size=${18}/>${score.unanswered ? 'Повторить ошибки и пропуски' : 'Повторить ошибки'} (${score.incorrect})</button>`}${canAdvance && html`<button class="button secondary" onClick=${() => onRestart(attempt.level + 1, true)}><${Icon} name="arrow" size=${18}/>К уровню ${attempt.level + 1}</button>`}<button class="text-button export-report" onClick=${() => onExportReport(attempt)}><${Icon} name="download" size=${18}/>Скачать разбор</button></div>
    <details class="accordion accordion--surface accordion--score scoring-info">
      <summary><span class="scoring-info-icon"><${Icon} name="info" size=${20}/></span>Как считается результат<${Icon} name="chevron" size=${16}/></summary>
      <div class="details-content"><div class="details-content-inner"><div class=${`scoring-copy ${score.weighted !== null ? 'scoring-copy--weighted' : ''}`}>
        <section class="scoring-rules" aria-labelledby="scoring-rules-title">
          <h3 id="scoring-rules-title">Баллы за задания</h3>
          <p>Каждое задание даёт <strong>1 балл</strong> только за <strong>полностью правильный ответ</strong>. За ошибку или пропуск дают <strong>0 баллов</strong>.</p>
          <ul><li><strong>Мультивыбор:</strong> должен совпасть весь набор.</li><li><strong>Сопоставление:</strong> должны совпасть все пары.</li></ul>
          <p class="scoring-note">Частичных баллов нет.</p>
          <p class="scoring-formula"><span>Процент результата</span><strong>Правильные ответы ÷ ${score.total} × 100</strong></p>
        </section>
        ${
          score.weighted !== null &&
          html`<section class="scoring-weighted" aria-labelledby="scoring-weighted-title">
          <h3 id="scoring-weighted-title">Ориентир по весам доменов <span class="scoring-weighted-value">${formatPercent(score.weighted)}%</span></h3>
          <p>Дополнительный расчёт: сумма долей правильных ответов в каждом домене, умноженных на его вес.</p>
          <p class="scoring-note">Веса доменов: <strong>14, 18, 12, 16, 12, 28%</strong>.</p>
          <p>Основной балл выше сохраняет <strong>равный вес всех 60 заданий</strong>.</p>
          <p class="scoring-note">Это не прогноз официального экзамена и не его шкала оценки.</p>
        </section>`
        }
        <p class="scoring-disclaimer"><strong>Учебная цель: ${TRAINING_TARGET}%.</strong> Это ориентир для самостоятельной тренировки, а не официальный проходной балл.</p>
      </div></div></div>
    </details>

    <section class="review-section"><div class="section-heading"><div><span class="eyebrow">Закрепить знания</span><h2 id="results-review-title" tabindex="-1">Разбор каждого ответа</h2></div><a class="text-button" href="#/study"><${Icon} name="book" size=${18}/>Перейти к материалам</a></div><div class="review-controls"><div class="filter-pills" role="group" aria-label="Фильтр результатов">${[
      ['all', 'Все', reviewScore.total],
      ['incorrect', 'Ошибки', reviewScore.answered - reviewScore.correct],
      ['unanswered', 'Пропущено', reviewScore.total - reviewScore.answered],
      ['correct', 'Верно', reviewScore.correct],
      ['bookmarks', 'Закладки', entries.filter(({ question }) => attempt.bookmarks.includes(question.id)).length],
    ].map(
      ([value, label, count]) =>
        html`<button class=${filter === value ? 'active' : ''} onClick=${() => setFilter(value)} aria-pressed=${filter === value}><span class="filter-label">${label}</span>${' '}<span class="filter-count">${count}</span></button>`,
    )}</div><${SelectField} label="Фильтр по домену" value=${domain} onChange=${setDomain} options=${[{ value: 'all', label: 'Все домены' }, ...DOMAINS.map((d) => ({ value: String(d.id), label: `${d.id}. ${d.short}` }))]}/></div><div class="review-list">${
      filtered.length
        ? filtered.map(
            (entry) =>
              html`<${ReviewItem} key=${entry.question.id} ...${entry} bookmarked=${attempt.bookmarks.includes(entry.question.id)}/>`,
          )
        : html`<${EmptyState} title="В этой подборке нет вопросов" icon="check"><p>Выбери другой фильтр, чтобы посмотреть ответы.</p><button class="text-button" onClick=${() => {
            setFilter('all');
            setDomain('all');
          }}><${Icon} name="search" size=${18}/>Показать все ответы</button></${EmptyState}>`
    }</div></section>
  </div>`;
}
