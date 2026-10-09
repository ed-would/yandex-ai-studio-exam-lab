import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { connectPair, evaluate } from '../core/exam.js';
import { domainById } from '../data/meta.js';
import { html, Icon, SourceLinks } from './ui.js';

export const typeNames = { single: 'Один ответ', multi: 'Мультивыбор', match: 'Сопоставление' };
const LETTERS = 'АБВГД';

export function ChoiceQuestion({ question, response, locked, onChange }) {
  const multi = question.type === 'multi';
  return html`<fieldset class="answer-fieldset"><legend class="answer-instruction">${multi ? 'Выбери все верные варианты. Правильных может быть от одного до пяти.' : 'Выбери один верный вариант.'}</legend>
    <div class="choice-list">${question.options.map((option, index) => {
      const selected = response.includes(option.id);
      const correct = question.correct.includes(option.id);
      const wrong = locked && selected && !correct;
      const classes = ['choice', selected ? 'selected' : '', locked && correct ? 'is-correct' : '', wrong ? 'is-wrong' : '', locked ? 'locked' : ''].join(' ');
      const label = locked && correct ? (selected ? 'Верно' : multi ? 'Нужно выбрать' : 'Правильный ответ') : wrong ? 'Лишний вариант' : '';
      return html`<label class=${classes} key=${option.id}>
        <input type=${multi ? 'checkbox' : 'radio'} name=${question.id} value=${option.id} checked=${selected} disabled=${locked} onChange=${() => onChange(multi ? selected ? response.filter((id) => id !== option.id) : [...response, option.id] : [option.id])} />
        <span class=${`choice-indicator ${multi ? 'square' : ''}`}>${selected && (multi ? html`<${Icon} name="check" size=${14}/>` : html`<span/>`)}</span>
        <span class="choice-letter">${LETTERS[index]}</span><span class="choice-text">${option.text}</span>
        ${label && html`<span class=${`choice-status ${wrong ? 'wrong' : 'correct'}`}><${Icon} name=${wrong ? 'close' : 'check'} size=${14}/>${label}</span>`}
      </label>`;
    })}</div>
  </fieldset>`;
}

export function MatchQuestion({ question, response, locked, onChange }) {
  const [armed, setArmed] = useState(null);
  const [lines, setLines] = useState([]);
  const [message, setMessage] = useState('');
  const board = useRef(null);
  useEffect(() => { setArmed(null); setMessage(''); }, [question.id, locked]);
  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () => {
      const bounds = el.getBoundingClientRect();
      setLines(Object.entries(response).map(([left, right]) => {
        const a = el.querySelector(`[data-left="${left}"]`)?.getBoundingClientRect();
        const b = el.querySelector(`[data-right="${right}"]`)?.getBoundingClientRect();
        if (!a || !b) return null;
        return { left, x1: a.right - bounds.left + 4, y1: a.top - bounds.top + a.height / 2, x2: b.left - bounds.left - 4, y2: b.top - bounds.top + b.height / 2, correct: question.pairs[left] === right };
      }).filter(Boolean));
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [question.id, JSON.stringify(response), locked]);

  function select(side, id) {
    if (locked) return;
    if (armed?.side === side && armed.id === id) { setArmed(null); setMessage('Выбор элемента отменён. Выбери новую пару.'); return; }
    if (armed && armed.side !== side) {
      const left = side === 'left' ? id : armed.id;
      const right = side === 'right' ? id : armed.id;
      const next = connectPair(question, response, left, right);
      onChange(next); setArmed(null);
      const leftText = question.left.find((item) => item.id === left)?.text;
      const rightText = question.right.find((item) => item.id === right)?.text;
      setMessage(next[left] ? `Связь создана: ${leftText} — ${rightText}. Установлено ${Object.keys(next).length} из ${question.left.length} связей.` : `Связь удалена: ${leftText} — ${rightText}.`);
    } else {
      setArmed({ side, id });
      const item = (side === 'left' ? question.left : question.right).find((value) => value.id === id);
      setMessage(`Выбран элемент: ${item.text}. Теперь выбери соответствие в ${side === 'left' ? 'правой' : 'левой'} колонке.`);
    }
  }
  function disconnect(left) {
    if (locked) return;
    const next = { ...response }; delete next[left]; onChange(next); setArmed(null); setMessage(`Удалена связь для элемента: ${question.left.find((item) => item.id === left)?.text}. Осталось ${Object.keys(next).length} связей.`);
  }

  return html`<div class="match-question"><p class="answer-instruction">Нажми на элемент в одной колонке, затем на пару в другой. Каждому элементу нужна одна связь.</p><div class="match-hint"><${Icon} name="link" size=${16}/><span>${locked ? 'Сохранены твои пары. Правильные соответствия — в разборе ниже.' : armed ? 'Теперь выбери соответствие в другой колонке.' : 'Связь можно удалить крестиком или заменить новой парой.'}</span><span class="match-count">${Object.keys(response).length} / ${question.left.length}</span></div>
    <div class="match-board" ref=${board}>
      <svg class="match-lines" aria-hidden="true">${lines.map((line) => html`<path class=${locked ? line.correct ? 'line-correct' : 'line-wrong' : ''} d=${`M${line.x1} ${line.y1} C${line.x1 + 22} ${line.y1},${line.x2 - 22} ${line.y2},${line.x2} ${line.y2}`} fill="none" stroke-width="2"/>`)}</svg>
      <div class="match-column"><div class="column-heading">Элементы</div>${question.left.map((item, index) => {
        const rightId = response[item.id];
        const rightIndex = question.right.findIndex((r) => r.id === rightId);
        const status = locked && rightId ? question.pairs[item.id] === rightId ? 'is-correct' : 'is-wrong' : '';
        return html`<div class="match-row" key=${item.id}><button type="button" class=${`match-node ${rightId ? 'paired' : ''} ${armed?.side === 'left' && armed.id === item.id ? 'armed' : ''} ${status}`} data-left=${item.id} aria-pressed=${armed?.side === 'left' && armed.id === item.id} disabled=${locked} onClick=${() => select('left', item.id)}><span class="node-number">${index + 1}</span><span>${item.text}</span>${rightId && html`<span class="pair-label">${LETTERS[rightIndex]}</span>`}</button>${rightId && !locked && html`<button class="disconnect" type="button" aria-label=${`Удалить связь: ${item.text}`} onClick=${() => disconnect(item.id)}><${Icon} name="close" size=${12}/></button>`}</div>`;
      })}</div>
      <div class="match-column"><div class="column-heading">Соответствия</div>${question.right.map((item, index) => {
        const leftId = Object.keys(response).find((id) => response[id] === item.id);
        const leftIndex = question.left.findIndex((l) => l.id === leftId);
        const status = locked && leftId ? question.pairs[leftId] === item.id ? 'is-correct' : 'is-wrong' : '';
        return html`<div class="match-row" key=${item.id}><button type="button" class=${`match-node ${leftId ? 'paired' : ''} ${armed?.side === 'right' && armed.id === item.id ? 'armed' : ''} ${status}`} data-right=${item.id} aria-pressed=${armed?.side === 'right' && armed.id === item.id} disabled=${locked} onClick=${() => select('right', item.id)}><span class="node-number">${LETTERS[index]}</span><span>${item.text}</span>${leftId && html`<span class="pair-label">${leftIndex + 1}</span>`}</button></div>`;
      })}</div>
    </div><div class="sr-only" role="status" aria-live="polite" aria-atomic="true">${message}</div>
    ${!locked && Object.keys(response).length > 0 && html`<button class="text-button clear-pairs" type="button" onClick=${() => { onChange({}); setArmed(null); setMessage('Все связи удалены.'); }}><${Icon} name="refresh" size=${15}/>Сбросить связи</button>`}
  </div>`;
}

export function ExplanationDetails({ question, response }) {
  if (question.type === 'match') return html`<div class="pair-explanations">${question.left.map((item, index) => {
    const correct = question.right.find((r) => r.id === question.pairs[item.id]);
    const selected = question.right.find((r) => r.id === response?.[item.id]);
    const right = selected?.id === correct.id;
    return html`<div class="pair-explanation"><span class=${`rationale-symbol ${right ? 'correct' : 'wrong'}`}><${Icon} name=${right ? 'check' : 'close'} size=${15}/><span class="sr-only">${right ? 'Верно' : selected ? 'Ошибка' : 'Пропущено'}</span></span><div><span class="rationale-meta">Правильная пара</span><div class="pair-title"><strong>${index + 1}. ${item.text}</strong><span class="pair-arrow" aria-hidden="true">→</span><span class="sr-only">соответствует</span><strong>${correct.text}</strong></div>${!right && html`<p class="your-answer">Твой ответ: ${selected?.text || 'нет ответа'}.</p>`}<p>${question.pairExplanations[item.id]}</p></div></div>`;
  })}</div>`;
  return html`<div class="option-explanations">${question.options.map((option, index) => {
    const correct = question.correct.includes(option.id);
    const selected = response?.includes(option.id);
    return html`<div class=${`option-explanation ${selected && !correct ? 'extra-answer' : ''}`}><span class=${`rationale-symbol ${correct ? 'correct' : 'neutral'}`}>${LETTERS[index]}</span><div><strong>${option.text}</strong><span class="rationale-meta">${correct ? 'Верный вариант' : 'Неверный вариант'}${selected ? ' · твой выбор' : correct ? ' · не выбран' : ''}</span><p>${option.explanation}</p></div></div>`;
  })}</div>`;
}

export function Feedback({ question, answer, review = false }) {
  const ref = useRef(null);
  const correct = Boolean(answer) && evaluate(question, answer.response);
  const missing = !answer;
  useEffect(() => {
    if (review) return;
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }, [question.id, review]);
  return html`<section class=${`feedback ${correct ? 'correct' : 'incorrect'} ${review ? 'review-feedback' : ''}`} ref=${ref} tabindex="-1" aria-label="Разбор ответа">
    <div class="feedback-heading" role=${review ? undefined : 'status'}><span class="feedback-icon"><${Icon} name=${correct ? 'check' : missing ? 'info' : 'close'} size=${23}/></span><div><h3>${correct ? 'Верно. Хорошая работа.' : missing ? 'Ответ не был проверен' : 'Есть что разобрать'}</h3><p>${correct ? '1 балл за задание.' : missing ? '0 баллов. Непроверенное задание считается пропущенным.' : '0 баллов. Первый ответ сохранён и уже не изменится.'}</p></div><span class="feedback-points">${correct ? '+1' : '0'}</span></div>
    <p class="main-explanation">${question.explanation}</p>
    <div class="takeaway"><${Icon} name="spark" size=${19}/><div><span>Запомнить</span><p>${question.takeaway}</p></div></div>
    <details class="reasoning-details" open=${!correct || review}><summary>Почему варианты верны или неверны<${Icon} name="chevron" size=${16}/></summary><${ExplanationDetails} question=${question} response=${answer?.response}/></details>
    <div class="feedback-sources"><span class="eyebrow">Разобраться глубже</span><${SourceLinks} sources=${question.sources}/></div>
  </section>`;
}

export function ReviewItem({ question, answer, number, bookmarked = false }) {
  const status = answer ? evaluate(question, answer.response) ? 'correct' : 'incorrect' : 'unanswered';
  return html`<details class=${`review-item status-${status}`}><summary><span class="review-number">${String(number).padStart(2, '0')}</span><span class="review-question"><span class="review-topic">${domainById(question.domain).short} · ${typeNames[question.type]}</span><strong>${question.prompt}</strong></span><span class=${`review-status ${status}`}><${Icon} name=${status === 'correct' ? 'check' : status === 'incorrect' ? 'close' : 'clock'} size=${16}/><span>${status === 'correct' ? 'Верно' : status === 'incorrect' ? 'Ошибка' : 'Пропущено'}</span></span>${bookmarked && html`<${Icon} name="bookmark" size=${16}/>`}<${Icon} name="chevron" size=${17}/></summary><${Feedback} question=${question} answer=${answer} review=${true}/></details>`;
}
