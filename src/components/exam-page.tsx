import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DOMAINS, levelById } from '../data/meta.ts';
import { emptyResponse, evaluate, isValidResponse, questionSecondsLeft, scoreAttempt } from '../core/exam.ts';
import { ChoiceQuestion, Feedback, MatchQuestion, typeNames } from './questions.tsx';
import { h, Fragment, Art, SectionBackdrop, Icon, plural } from './ui.tsx';
import { ProgressBar } from './progress-bar.tsx';
import type { Attempt, LevelId, Question, Response } from '../types.ts';

void Fragment;

type DraftUpdater = Response | ((current: Response) => Response);
type ExamPageProps = {
  attempt: Attempt;
  questions: Question[];
  onDraft: (question: Question, response: DraftUpdater) => void;
  onAnswer: (question: Question, response: Response) => void;
  onMove: (index: number) => void;
  onBookmark: (id: string) => void;
  onFinish: () => void;
  blocked?: boolean;
};

export function ExamPage({
  attempt,
  questions,
  onDraft,
  onAnswer,
  onMove,
  onBookmark,
  onFinish,
  blocked = false,
}: ExamPageProps) {
  const [mapOpen, setMapOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const bank = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const question = bank.get(attempt.questionIds[attempt.cursor])!;
  const answer = attempt.answers[question.id];
  const response = (answer?.response || attempt.drafts[question.id] || emptyResponse(question)) as Response;
  const secondsLeft = questionSecondsLeft(attempt, question.id, now);
  const seconds = secondsLeft ?? 0;
  const expired = secondsLeft === 0 && !answer;
  const locked = Boolean(answer) || expired;
  const level = levelById(attempt.level)!;
  const banner = {
    1: 'banner-level-1-folded-planes-light',
    2: 'banner-level-2-wave-fins-light',
    3: 'banner-level-3-faceted-prisms-light',
  }[attempt.level as LevelId];
  const score = scoreAttempt(attempt, questions);
  const starred = attempt.bookmarks.includes(question.id);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!attempt.timing) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [attempt.id, Boolean(attempt.timing)]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (attempt.cursor > 0) {
      const target = attempt.timing ? heading.current?.closest('.question-card') : heading.current;
      target?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    }
  }, [question.id]);
  const navigateTo = (index: number) => {
    onMove(index);
    setMapOpen(false);
  };

  return (
    <>
      <div class={`page exam-page theme-${attempt.level}`}>
        <div class="exam-topline">
          <SectionBackdrop name={banner} format="webp" />
          <a href="#/" class="text-button exam-back-link">
            <Icon name="back" size={17} />
            <span>К тестам</span>
          </a>
          <div class="exam-identity">
            <span class="badge">Уровень {attempt.level}</span>
            <strong>{level.name}</strong>
            <span class="exam-level-art">
              <Art variant={attempt.level} compact={true} />
            </span>
            {attempt.mode === 'mistakes' && (
              <>
                <span class="mode-label">Работа над ошибками</span>
              </>
            )}
          </div>
          <button class="button primary small" onClick={onFinish}>
            <span>Завершить</span>
            <Icon name="flag" size={16} />
          </button>
        </div>
        <div class="exam-progress">
          <ProgressBar value={score.answered} max={score.total} label="Проверено вопросов" />
          <span>
            <strong>{score.answered}</strong> / {score.total} проверено
          </span>
        </div>
        {!attempt.timing && (
          <>
            <p class="exam-timing-note">
              <Icon name="clock" size={16} />
              <span>
                Без таймера. <a href="#/">Настроить перед новым тестом</a>
              </span>
            </p>
          </>
        )}
        <div class="exam-layout">
          <aside class="question-map">
            <button
              class="accordion-trigger map-toggle"
              aria-expanded={mapOpen}
              aria-controls="question-map-content"
              onClick={() => setMapOpen(!mapOpen)}
            >
              <Icon name="menu" size={19} />
              <span>Карта вопросов</span>
              <span>
                {attempt.cursor + 1} / {score.total}
              </span>
              <Icon name="chevron" size={16} />
            </button>
            <div id="question-map-content" class="map-body accordion-panel">
              <div class="accordion-panel-inner">
                <div class="map-content">
                  <div class="map-title">
                    <span class="eyebrow">Карта вопросов</span>
                    <span class="mini-label">
                      {plural(new Set(attempt.questionIds.map((id) => bank.get(id)!.domain)).size, [
                        'домен',
                        'домена',
                        'доменов',
                      ])}
                    </span>
                  </div>
                  {DOMAINS.map((domain) => {
                    const entries = attempt.questionIds
                      .map((id, i) => ({ q: bank.get(id)!, index: i }))
                      .filter(({ q }) => q.domain === domain.id);
                    if (!entries.length) return null;
                    const done = entries.filter(({ q }) => attempt.answers[q.id]).length;
                    return (
                      <>
                        <section class={`map-domain ${question.domain === domain.id ? 'current' : ''}`}>
                          <div class="map-domain-title">
                            <span>0{domain.id}</span>
                            <strong>{domain.short}</strong>
                            <small>
                              {done}/{entries.length}
                            </small>
                          </div>
                          <div class="question-dots">
                            {entries.map(({ q, index }) => {
                              const a = attempt.answers[q.id];
                              const status = a
                                ? evaluate(q, a.response)
                                  ? 'correct'
                                  : 'incorrect'
                                : attempt.drafts[q.id] &&
                                    (q.type === 'match'
                                      ? Object.keys(attempt.drafts[q.id]).length
                                      : attempt.drafts[q.id].length)
                                  ? 'draft'
                                  : 'unanswered';
                              const label = a?.timedOut
                                ? 'время вышло, ошибка'
                                : {
                                    correct: 'верно',
                                    incorrect: 'ошибка',
                                    draft: 'есть черновик',
                                    unanswered: 'не проверен',
                                  }[status];
                              return (
                                <>
                                  <button
                                    class={`question-dot ${status} ${index === attempt.cursor ? 'current' : ''} ${attempt.bookmarks.includes(q.id) ? 'bookmarked' : ''}`}
                                    aria-label={`Вопрос ${index + 1}: ${label}${index === attempt.cursor ? ', текущий вопрос' : ''}${attempt.bookmarks.includes(q.id) ? ', в закладках' : ''}`}
                                    aria-current={index === attempt.cursor ? 'step' : undefined}
                                    data-question-index={index}
                                    onClick={() => navigateTo(index)}
                                  >
                                    {String(index + 1).padStart(2, '0')}
                                  </button>
                                </>
                              );
                            })}
                          </div>
                        </section>
                      </>
                    );
                  })}
                  <div class="map-legend">
                    <span>
                      <i class="status-dot current" />
                      Текущий вопрос
                    </span>
                    <span>
                      <i class="status-dot correct" />
                      Верно
                    </span>
                    <span>
                      <i class="status-dot incorrect" />
                      Ошибка
                    </span>
                  </div>
                  <p class="map-legend-note">
                    <i class="status-dot draft" />
                    <span>
                      <strong>Черновик:</strong> ответ выбран, но его ещё не проверили.
                    </span>
                  </p>
                  <div class="map-note">
                    <Icon name="device" size={18} />
                    <p>
                      {attempt.timing
                        ? '72 секунды на вопрос. У посещённых вопросов время идёт даже после перехода или выхода из теста.'
                        : 'Прогресс сохраняется после каждого действия. Можно продолжить позже.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
          <div class="question-area">
            <section class="question-card" key={question.id}>
              <div class="question-meta">
                <span class="question-counter">
                  Вопрос {String(attempt.cursor + 1).padStart(2, '0')}
                  <small> / {score.total}</small>
                </span>
                <span class={`type-badge type-${question.type}`}>{typeNames[question.type]}</span>
                <div class="question-controls">
                  {attempt.timing && (
                    <>
                      <div
                        class={`question-timer ${answer?.timedOut ? 'expired' : !answer && seconds <= 10 ? 'urgent' : ''}`}
                        role="timer"
                        aria-live="off"
                        aria-label={
                          answer
                            ? answer.timedOut
                              ? 'Время вышло'
                              : 'Ответ зафиксирован'
                            : `Осталось ${seconds} секунд`
                        }
                      >
                        <Icon name={answer && !answer.timedOut ? 'check' : 'clock'} size={19} />
                        <strong>
                          {answer
                            ? answer.timedOut
                              ? '00:00'
                              : 'Готово'
                            : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`}
                        </strong>
                      </div>
                    </>
                  )}
                  <button
                    class={`bookmark-button ${starred ? 'active' : ''}`}
                    aria-label={starred ? 'Убрать вопрос из закладок' : 'Добавить вопрос в закладки'}
                    title={
                      starred
                        ? 'Убрать вопрос из закладок'
                        : 'Добавить в закладки, чтобы найти вопрос в разборе после теста'
                    }
                    aria-pressed={starred}
                    onClick={() => onBookmark(question.id)}
                  >
                    <Icon name="bookmark" size={19} />
                  </button>
                </div>
              </div>
              <span
                class={attempt.timing && !answer && seconds <= 10 ? 'question-timer-alert' : 'sr-only'}
                role="status"
              >
                {attempt.timing && !answer && seconds <= 10
                  ? 'Время истекает. Осталось не больше 10 секунд на ответ.'
                  : ''}
              </span>
              <div class="question-topic">
                <span>Домен {question.domain}</span>
                <span>{question.topic}</span>
              </div>
              <h1
                class={`question-prompt ${question.prompt.length > 180 ? 'question-prompt-long' : ''}`}
                ref={heading}
                tabIndex={-1}
              >
                {question.prompt}
              </h1>
              {question.type === 'match' ? (
                <>
                  <MatchQuestion
                    question={question}
                    response={response as import('../types.ts').MatchResponse}
                    locked={locked}
                    onChange={(value) => !blocked && onDraft(question, value as DraftUpdater)}
                  />
                </>
              ) : (
                <>
                  <ChoiceQuestion
                    question={question}
                    response={response as import('../types.ts').ChoiceResponse}
                    locked={locked}
                    onChange={(value) => !blocked && onDraft(question, value as DraftUpdater)}
                  />
                </>
              )}
              <div class="question-actions">
                <button
                  class="button secondary previous-button"
                  aria-label="Предыдущий вопрос"
                  disabled={attempt.cursor === 0}
                  onClick={() => navigateTo(attempt.cursor - 1)}
                >
                  <Icon name="back" size={17} />
                  <span>Назад</span>
                </button>
                {!locked && (
                  <>
                    <button
                      class="button primary check-answer"
                      data-action="check-answer"
                      disabled={blocked || expired || !isValidResponse(question, response, true)}
                      onClick={() => onAnswer(question, response)}
                    >
                      Проверить
                      <Icon name="check" size={18} />
                    </button>
                  </>
                )}
                {locked ? (
                  <>
                    <button
                      class="button primary next-answer"
                      data-action="next-question"
                      onClick={() => (attempt.cursor + 1 < score.total ? navigateTo(attempt.cursor + 1) : onFinish())}
                    >
                      {attempt.cursor + 1 < score.total ? 'Следующий вопрос' : 'К результатам'}
                      <Icon name="arrow" size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      class="text-button skip-button"
                      data-action="skip"
                      onClick={() => (attempt.cursor + 1 < score.total ? navigateTo(attempt.cursor + 1) : onFinish())}
                    >
                      {attempt.cursor + 1 < score.total ? 'Пропустить' : 'К результатам'}
                      <Icon name="arrow" size={16} />
                    </button>
                  </>
                )}
              </div>
              {!locked && (
                <>
                  <p class="answer-commit-note">
                    Ответ засчитывается после проверки.{' '}
                    {question.type === 'match'
                      ? 'Для полного балла правильно сопоставь все пары.'
                      : question.type === 'multi'
                        ? 'Для полного балла выбери все правильные варианты и не выбирай неверные.'
                        : 'Для полного балла выбери правильный вариант.'}
                  </p>
                </>
              )}
            </section>
            {answer && (
              <>
                <Feedback key={`feedback-${question.id}`} question={question} answer={answer} />
              </>
            )}
            {answer && (
              <>
                <div class="after-feedback">
                  <span>
                    <Icon name="check" size={15} />
                    Ответ зафиксирован
                  </span>
                  <button
                    class="text-button"
                    onClick={() => (attempt.cursor + 1 < score.total ? navigateTo(attempt.cursor + 1) : onFinish())}
                  >
                    {attempt.cursor + 1 < score.total ? 'Продолжить' : 'Смотреть результат'}
                    <Icon name="arrow" size={17} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
