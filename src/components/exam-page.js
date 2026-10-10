import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DOMAINS, levelById } from '../data/meta.js';
import { emptyResponse, evaluate, isValidResponse, scoreAttempt } from '../core/exam.js';
import { ChoiceQuestion, Feedback, MatchQuestion, typeNames } from './questions.js';
import { html, Art, SectionBackdrop, Icon, ProgressBar, plural } from './ui.js';

export function ExamPage({ attempt, questions, onDraft, onAnswer, onMove, onBookmark, onFinish, blocked = false }) {
  const [mapOpen, setMapOpen] = useState(false);
  const bank = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const question = bank.get(attempt.questionIds[attempt.cursor]);
  const answer = attempt.answers[question.id];
  const response = answer?.response || attempt.drafts[question.id] || emptyResponse(question);
  const locked = Boolean(answer);
  const level = levelById(attempt.level);
  const score = scoreAttempt(attempt, questions);
  const starred = attempt.bookmarks.includes(question.id);
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (attempt.cursor > 0) heading.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, [question.id]);
  const navigateTo = (index) => {
    onMove(index);
    setMapOpen(false);
  };

  return html`<div class=${`page exam-page theme-${attempt.level}`}><div class="exam-topline"><${SectionBackdrop} level=${attempt.level}/><a href="#/" class="text-button"><${Icon} name="back" size=${17}/>К тестам</a><div><span class="badge">Уровень ${attempt.level}</span><strong>${level.name}</strong><span class="exam-level-art"><${Art} variant=${attempt.level}/></span>${attempt.mode === 'mistakes' && html`<span class="mode-label">Работа над ошибками</span>`}</div><button class="text-button" onClick=${onFinish}>Завершить<${Icon} name="flag" size=${16}/></button></div><div class="exam-progress"><${ProgressBar} value=${score.answered} max=${score.total} label="Проверено вопросов"/><span><strong>${score.answered}</strong> / ${score.total} проверено</span></div>
    <div class="exam-layout"><aside class=${`question-map ${mapOpen ? 'map-open' : ''}`}><button class="map-toggle" aria-expanded=${mapOpen} onClick=${() => setMapOpen(!mapOpen)}><${Icon} name="menu" size=${19}/><span>Карта вопросов</span><span>${attempt.cursor + 1} / ${score.total}</span><${Icon} name="chevron" size=${16}/></button><div class="map-body"><div class="map-title"><span class="eyebrow">Карта вопросов</span><span class="mini-label">${plural(new Set(attempt.questionIds.map((id) => bank.get(id).domain)).size, ['домен', 'домена', 'доменов'])}</span></div>${DOMAINS.map(
      (domain) => {
        const entries = attempt.questionIds
          .map((id, i) => ({ q: bank.get(id), index: i }))
          .filter(({ q }) => q.domain === domain.id);
        if (!entries.length) return null;
        const done = entries.filter(({ q }) => attempt.answers[q.id]).length;
        return html`<section class=${`map-domain ${question.domain === domain.id ? 'current' : ''}`}><div class="map-domain-title"><span>0${domain.id}</span><strong>${domain.short}</strong><small>${done}/${entries.length}</small></div><div class="question-dots">${entries.map(
          ({ q, index }) => {
            const a = attempt.answers[q.id];
            const status = a
              ? evaluate(q, a.response)
                ? 'correct'
                : 'incorrect'
              : attempt.drafts[q.id] &&
                  (q.type === 'match' ? Object.keys(attempt.drafts[q.id]).length : attempt.drafts[q.id].length)
                ? 'draft'
                : 'unanswered';
            const label = { correct: 'верно', incorrect: 'ошибка', draft: 'есть черновик', unanswered: 'не проверен' }[
              status
            ];
            return html`<button class=${`question-dot ${status} ${index === attempt.cursor ? 'current' : ''} ${attempt.bookmarks.includes(q.id) ? 'bookmarked' : ''}`} aria-label=${`Вопрос ${index + 1}: ${label}${attempt.bookmarks.includes(q.id) ? ', в закладках' : ''}`} aria-current=${index === attempt.cursor ? 'step' : undefined} data-question-index=${index} onClick=${() => navigateTo(index)}>${String(index + 1).padStart(2, '0')}</button>`;
          },
        )}</div></section>`;
      },
    )}<div class="map-legend"><span><i class="status-dot correct"/>Верно</span><span><i class="status-dot incorrect"/>Ошибка</span><span><i class="status-dot draft"/>Черновик</span></div><div class="map-note"><${Icon} name="device" size=${18}/><p>Прогресс сохраняется после каждого действия. Можно продолжить позже.</p></div></div></aside>
    <div class="question-area"><section class="question-card" key=${question.id}><div class="question-meta"><span class="question-counter">Вопрос ${String(attempt.cursor + 1).padStart(2, '0')}<small> / ${score.total}</small></span><span class=${`type-badge type-${question.type}`}>${typeNames[question.type]}</span><button class=${`bookmark-button ${starred ? 'active' : ''}`} aria-label=${starred ? 'Убрать вопрос из закладок' : 'Добавить вопрос в закладки'} aria-pressed=${starred} onClick=${() => onBookmark(question.id)}><${Icon} name="bookmark" size=${19}/></button></div><div class="question-topic"><span>Домен ${question.domain}</span><span>${question.topic}</span></div><h1 class="question-prompt" ref=${heading} tabindex="-1">${question.prompt}</h1>${question.type === 'match' ? html`<${MatchQuestion} question=${question} response=${response} locked=${locked} onChange=${(value) => !blocked && onDraft(question, value)}/>` : html`<${ChoiceQuestion} question=${question} response=${response} locked=${locked} onChange=${(value) => !blocked && onDraft(question, value)}/>`}<div class="question-actions"><button class="button secondary previous-button" disabled=${attempt.cursor === 0} onClick=${() => navigateTo(attempt.cursor - 1)}><${Icon} name="back" size=${17}/><span>Назад</span></button>${!locked && html`<button class="button primary check-answer" data-action="check-answer" disabled=${blocked || !isValidResponse(question, response, true)} onClick=${() => onAnswer(question, response)}>Проверить<${Icon} name="check" size=${18}/></button>`}${locked ? html`<button class="button primary next-answer" data-action="next-question" onClick=${() => (attempt.cursor + 1 < score.total ? navigateTo(attempt.cursor + 1) : onFinish())}>${attempt.cursor + 1 < score.total ? 'Следующий вопрос' : 'К результатам'}<${Icon} name="arrow" size=${18}/></button>` : html`<button class="text-button skip-button" data-action="skip" onClick=${() => (attempt.cursor + 1 < score.total ? navigateTo(attempt.cursor + 1) : onFinish())}>${attempt.cursor + 1 < score.total ? 'Пропустить' : 'К результатам'}<${Icon} name="arrow" size=${16}/></button>`}</div>${!locked && html`<p class="answer-commit-note">Ответ засчитывается после проверки. Для полного балла должны быть верны ${question.type === 'match' ? 'все пары' : question.type === 'multi' ? 'все выбранные и все пропущенные варианты' : 'выбранный вариант'}.</p>`}</section>${locked && html`<${Feedback} key=${`feedback-${question.id}`} question=${question} answer=${answer}/>`}${locked && html`<div class="after-feedback"><span><${Icon} name="check" size=${15}/>Ответ зафиксирован</span><button class="text-button" onClick=${() => (attempt.cursor + 1 < score.total ? navigateTo(attempt.cursor + 1) : onFinish())}>${attempt.cursor + 1 < score.total ? 'Продолжить' : 'Смотреть результат'}<${Icon} name="arrow" size=${17}/></button></div>`}</div></div></div>`;
}
