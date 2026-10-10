import { useMemo, useState } from 'preact/hooks';
import { DOMAINS, TRAINING_TARGET, levelById } from '../data/meta.js';
import { evaluate, scoreAttempt } from '../core/exam.js';
import { resultCoaching } from '../core/coaching.js';
import { html, SectionBackdrop, EmptyState, Icon, ProgressBar, formatDate, formatPercent, plural } from './ui.js';
import { ReviewItem } from './questions.js';
import { SelectField } from './select-field.js';
import { CompletionConfetti } from './completion-confetti.js';

export function Results({
  attempt,
  questions,
  state,
  onRestart,
  onMistakes,
  onExportReport,
  celebrate = false,
  onCelebrationConsumed,
}) {
  const [filter, setFilter] = useState('all');
  const [domain, setDomain] = useState('all');
  const bank = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const coaching = useMemo(() => resultCoaching(attempt, questions), [attempt, questions]);
  const { score, outcome, domains, priorities, strong, skipped, isPractice, needed, formatFocus } = coaching;
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
      <${SectionBackdrop} name=${outcome.background} format="webp"/>
      <div class="outcome-copy">
        <div class="outcome-context"><span>${isPractice ? 'Работа над ошибками' : `${level.name} уровень`}</span><span>${formatDate(attempt.completedAt)}</span></div>
        <span class="achievement-label"><${Icon} name=${outcome.icon} size=${21}/>${outcome.achievement}</span>
        <h1 id="outcome-title">${outcome.title}</h1>
        <p class="outcome-description">${outcome.description}</p>
        ${delta !== null && html`<p class=${`outcome-delta ${delta > 0 ? 'improved' : ''}`}><${Icon} name=${delta > 0 ? 'chart' : 'clock'} size=${17}/>${delta > 0 ? '+' : ''}${formatPercent(delta)} п. п. к предыдущей полной попытке</p>`}
        <div class="outcome-actions">${
          primary.href
            ? html`<a class="button primary" href=${primary.href}>${primary.text}<${Icon} name="arrow" size=${18}/></a>`
            : html`<button class="button primary" onClick=${primary.action}>${primary.text}<${Icon} name="arrow" size=${18}/></button>`
        }
          <button class="text-button" onClick=${() => openReview()}>Разобрать ответы<${Icon} name="book" size=${18}/></button>
        </div>
      </div>
      <div class="outcome-score">
        <div class="score-orbit" style=${{ '--score': `${score.percent}%` }}><div><span class="score-number">${formatPercent(score.percent)}<small>%</small></span><span>${score.correct} из ${score.total} баллов</span></div></div>
        <p class="outcome-goal">${isPractice ? 'Результат выбранной подборки' : score.percent >= TRAINING_TARGET ? `Учебная цель ${TRAINING_TARGET}% достигнута` : `Учебная цель — ${TRAINING_TARGET}%`}</p>
      </div>
      <div class="outcome-facts"><div><span>Верно</span><strong>${score.correct}<small> / ${score.total}</small></strong></div><div><span>Ошибки</span><strong>${score.wrong}</strong></div><div><span>Пропущено</span><strong>${score.unanswered}</strong></div><div><span>Тем с результатом от ${TRAINING_TARGET}%</span><strong>${strong.length}<small> / ${domains.length}</small></strong></div></div>
    </section>

    <section class="coaching-section" aria-labelledby="coaching-title">
      <div class="section-heading"><div><h2 id="coaching-title">${priorities.length ? 'Что подтянуть в первую очередь' : !score.answered ? 'Сначала собери свой результат' : score.unanswered ? 'Допроверь пропущенные темы' : 'Что уже получилось'}</h2><p>${priorities.length ? `Рекомендации по ошибкам в этой попытке. Выбраны ${priorities.length > 3 ? 'три приоритетные темы' : 'темы, которым стоит уделить внимание'}.` : !score.answered ? 'Ответь на вопросы — и здесь появятся рекомендации по твоим ответам.' : score.unanswered ? 'Пропуск не говорит о слабом знании. Сначала проверь себя на этих заданиях.' : isPractice ? 'В выбранной подборке ошибок нет. Следующий шаг — проверить весь уровень.' : 'В этой попытке ошибок нет. Можно переходить к более сложным задачам и закреплению.'}</p></div></div>
      ${
        priorities.length
          ? html`<div class="coaching-grid">${priorities.slice(0, 3).map(
              (row) => html`<article class="coaching-card" data-coaching-domain=${row.id}>
        <div class="coaching-card-top"><span class="coaching-domain-icon"><${Icon} name=${row.icon} size=${24}/></span><span>${plural(row.wrong, ['ошибка', 'ошибки', 'ошибок'])} в ${plural(row.answered, ['проверенном задании', 'проверенных заданиях', 'проверенных заданиях'])}</span></div>
        <h3>${row.short}</h3><ul class="coaching-topics">${row.topics.slice(0, 2).map((topic) => html`<li>${topic.title}</li>`)}</ul>
        ${row.topics.length > 2 && html`<p class="coaching-more">Ещё ${plural(row.topics.length - 2, ['тема', 'темы', 'тем'])} в разборе</p>`}
        <p class="coaching-takeaway">${row.topics[0].takeaway}</p>
        <div class="coaching-card-actions"><a class="text-button" href=${`#/study/${row.id}`}><${Icon} name="book" size=${16}/>Повторить тему</a><button class="text-button" onClick=${() => openReview(row.id, 'incorrect')}>Разобрать ошибки<${Icon} name="arrow" size=${16}/></button></div>
      </article>`,
            )}</div>`
          : html`<div class="coaching-clear"><span class="coaching-clear-icon"><${Icon} name=${!score.answered ? 'book' : score.unanswered ? 'clock' : 'shield'} size=${36}/></span><div><h3>${!score.answered ? 'Первая попытка даст точку отсчёта.' : score.unanswered ? `${plural(score.unanswered, ['задание осталось', 'задания остались', 'заданий осталось'])} без проверки.` : 'Проверенные ответы — без ошибок.'}</h3><p>${!score.answered ? 'Начни с любого уровня и проверяй каждый ответ. Можно продолжать в своём темпе.' : score.unanswered ? 'Выполни их в точечной тренировке: так станет понятно, что уже усвоено, а что стоит повторить.' : 'Объясни себе логику решения своими словами и попробуй применить её к другой задаче.'}</p></div></div>`
      }
      ${score.unanswered > 0 && score.answered > 0 && html`<div class="skipped-note"><${Icon} name="clock" size=${22}/><div><strong>${plural(score.unanswered, ['пропущенное задание', 'пропущенных задания', 'пропущенных заданий'])}</strong><p>${skipped.map((row) => row.short).join(' · ')}. По этим заданиям знания ещё не проверены.</p></div><button class="text-button" onClick=${() => openReview('all', 'unanswered')}>Посмотреть пропуски<${Icon} name="arrow" size=${17}/></button></div>`}
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
      <aside class="preparation-plan" aria-labelledby="preparation-title"><div class="preparation-heading"><span class="plan-icon"><${Icon} name="nodes" size=${28}/></span><h2 id="preparation-title">Твой следующий шаг</h2></div><p class="plan-intro">${!score.answered ? 'Начни с практики, чтобы рекомендации стали персональными.' : isPractice ? 'Закрепи подборку, затем проверь весь уровень.' : needed ? `Для учебной цели в следующей попытке нужно минимум ${Math.ceil((score.total * TRAINING_TARGET) / 100)} верных ответов. Сейчас не хватает ещё ${plural(needed, ['ответа', 'ответов', 'ответов'])}.` : score.unanswered ? 'Учебная цель по баллам достигнута. Сначала проверь пропущенные задания, чтобы оценить подготовку по всему уровню.' : 'Цель достигнута. Сохрани качество и попробуй новую сложность.'}</p>
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
          <li><h3>${score.incorrect ? 'Закрепи в точечной тренировке' : 'Проверь понимание'}</h3><p>${score.incorrect ? `В подборке будет ${plural(score.incorrect)}: ${score.wrong} с ошибкой и ${score.unanswered} без проверки. Обрати внимание на объяснения каждого варианта.` : 'Попробуй обосновать не только верный вариант, но и то, почему остальные не подходят.'}</p></li>
          <li><h3>${isPractice ? 'Вернись к полному тесту' : 'Проверь устойчивость результата'}</h3><p>${isPractice ? 'Результат подборки не заменяет оценку всех 60 вопросов.' : 'Пройди уровень ещё раз после повторения. Сравни результат в истории и посмотри, какие темы стали увереннее.'}</p></li>
        </ol>
        ${formatFocus && html`<div class="format-coaching"><span>Особое внимание: ${formatFocus.title.toLowerCase()}</span><p>${plural(formatFocus.wrong, ['ошибка', 'ошибки', 'ошибок'])} в ${plural(formatFocus.answered, ['проверенном задании', 'проверенных заданиях', 'проверенных заданиях'])}. ${formatFocus.tip}</p></div>`}
        <a class="text-button" href=${priorities.length ? `#/study/${priorities[0].id}` : '#/study'}>Открыть карту подготовки<${Icon} name="arrow" size=${17}/></a>
      </aside>
    </section>

    <div class="result-actions"><button class="button secondary" onClick=${() => onRestart(attempt.level)}>Повторить уровень<${Icon} name="refresh" size=${18}/></button>${score.incorrect > 0 && html`<button class="button secondary" onClick=${() => onMistakes(attempt)}>${score.unanswered ? 'Повторить ошибки и пропуски' : 'Повторить ошибки'} (${score.incorrect})<${Icon} name="arrow" size=${17}/></button>`}${canAdvance && html`<button class="button secondary" onClick=${() => onRestart(attempt.level + 1, true)}>К уровню ${attempt.level + 1}<${Icon} name="arrow" size=${17}/></button>`}<button class="text-button export-report" onClick=${() => onExportReport(attempt)}><${Icon} name="download" size=${17}/>Скачать разбор</button></div>
    <details class="accordion accordion--surface accordion--score scoring-info"><summary><${Icon} name="info" size=${17}/>Как считается результат<${Icon} name="chevron" size=${16}/></summary><div class="details-content"><div class="details-content-inner"><div class="scoring-copy"><p>Каждое задание даёт 1 балл только за полностью правильный ответ. Для мультивыбора должен совпасть весь набор, для сопоставления — все пары. Частичных баллов нет. Процент = правильные ответы ÷ ${score.total} × 100. Пропущенные задания дают 0 баллов.</p>${score.weighted !== null && html`<p>Дополнительный ориентир по весам доменов программы: <strong>${formatPercent(score.weighted)}%</strong>. Формула: сумма долей правильных ответов в домене, умноженных на его вес (14, 18, 12, 16, 12, 28%). Основной балл выше сохраняет равный вес всех 60 заданий. Это не прогноз официального экзамена и не его шкала оценки.</p>`}<p>Цель ${TRAINING_TARGET}% выбрана для самостоятельной тренировки и не является официальным проходным баллом.</p></div></div></div></details>

    <section class="review-section"><div class="section-heading"><div><span class="eyebrow">Закрепить знания</span><h2 id="results-review-title" tabindex="-1">Разбор каждого ответа</h2></div><a class="text-button" href="#/study"><${Icon} name="book" size=${17}/>Перейти к материалам</a></div><div class="review-controls"><div class="filter-pills" aria-label="Фильтр результатов">${[
      ['all', `Все ${reviewScore.total}`],
      ['incorrect', `Ошибки ${reviewScore.answered - reviewScore.correct}`],
      ['unanswered', `Пропущено ${reviewScore.total - reviewScore.answered}`],
      ['correct', `Верно ${reviewScore.correct}`],
      ['bookmarks', `Закладки ${entries.filter(({ question }) => attempt.bookmarks.includes(question.id)).length}`],
    ].map(
      ([value, label]) =>
        html`<button class=${filter === value ? 'active' : ''} onClick=${() => setFilter(value)} aria-pressed=${filter === value}>${label}</button>`,
    )}</div><${SelectField} label="Фильтр по домену" value=${domain} onChange=${setDomain} options=${[{ value: 'all', label: 'Все домены' }, ...DOMAINS.map((d) => ({ value: String(d.id), label: `${d.id}. ${d.short}` }))]}/></div><div class="review-list">${
      filtered.length
        ? filtered.map(
            (entry) =>
              html`<${ReviewItem} key=${entry.question.id} ...${entry} bookmarked=${attempt.bookmarks.includes(entry.question.id)}/>`,
          )
        : html`<${EmptyState} title="В этой подборке нет вопросов" icon="check"><p>Выбери другой фильтр, чтобы посмотреть ответы.</p><button class="text-button" onClick=${() => {
            setFilter('all');
            setDomain('all');
          }}>Показать все ответы</button></${EmptyState}>`
    }</div></section>
  </div>`;
}
