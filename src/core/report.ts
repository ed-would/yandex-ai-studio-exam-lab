import { APP_NAME, domainById, levelById, PROGRAM_URL, BANK_VERSION } from '../data/meta.ts';
import { evaluate, scoreAttempt } from './exam.ts';
import { typograph } from './typography.ts';
import type { Attempt, Question } from '../types.ts';

const esc = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

export function createHtmlReport(attempt: Attempt, questions: Question[], theme: 'light' | 'dark' = 'light'): string {
  // Standalone export mirrors level primitives and the test fill opacity rules.
  const palettes = {
    1: ['#465c16', '#e6efa9', '#f5f7e5', '#d3e38c', '#343c27', '#292e24'],
    2: ['#005b64', '#d6efeb', '#edf8f6', '#93d7d0', '#273f40', '#242f33'],
    3: ['#6841ab', '#e9dcfb', '#f5effc', '#c5a8f2', '#3b304d', '#2e273d'],
  };
  const palette = palettes[attempt.level];
  const score = scoreAttempt(attempt, questions);
  const bank = new Map(questions.map((q) => [q.id, q]));
  const blocks = attempt.questionIds
    .map((id, index) => {
      const q = bank.get(id);
      if (!q) return '';
      const answer = attempt.answers[id];
      const correct = answer && evaluate(q, answer.response);
      const status = correct ? 'Верно' : answer?.timedOut ? 'Ошибка · время вышло' : answer ? 'Ошибка' : 'Пропущено';
      let answers;
      if (q.type === 'match') {
        const response = answer && !Array.isArray(answer.response) ? answer.response : undefined;
        answers = q.left
          .map((left) => {
            const right = q.right.find((r) => r.id === q.pairs[left.id]);
            const chosen = q.right.find((r) => r.id === response?.[left.id]);
            const rightText = right?.text ?? 'неизвестно';
            const rightId = right?.id;
            return `<li><strong>${esc(left.text)} → ${esc(rightText)}</strong><p class="${chosen?.id === rightId ? 'ok' : 'bad'}">Твой ответ: ${esc(chosen?.text || 'не дан')}.</p><p>${esc(q.pairExplanations[left.id])}</p></li>`;
          })
          .join('');
      } else {
        const response = answer && Array.isArray(answer.response) ? answer.response : [];
        answers = q.options
          .map(
            (option) =>
              `<li><strong>${esc(option.text)}</strong><p class="${q.correct.includes(option.id) ? 'ok' : 'bad'}">${q.correct.includes(option.id) ? 'Верный вариант' : 'Неверный вариант'}${response.includes(option.id) ? ' · твой выбор' : ''}.</p><p>${esc(option.explanation)}</p></li>`,
          )
          .join('');
      }
      return `<article><div class="meta">${index + 1}. ${esc(domainById(q.domain)?.short ?? '')} · <b class="${correct ? 'ok' : 'bad'}">${status}</b></div><h2>${esc(q.prompt)}</h2><p>${esc(q.explanation)}</p><aside><b>Запомнить:</b> ${esc(q.takeaway)}</aside><ul>${answers}</ul><div class="sources">${q.sources
        .filter((s) => /^https:\/\//.test(s.url))
        .map((s) => `<a href="${esc(s.url)}" rel="noopener noreferrer" target="_blank">${esc(s.title)}</a>`)
        .join(' · ')}</div></article>`;
    })
    .join('');
  return typograph(`<!doctype html><html lang="ru" data-theme="${theme === 'dark' ? 'dark' : 'light'}"><head><meta name="color-scheme" content="${theme === 'dark' ? 'dark' : 'light'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Разбор · ${esc(APP_NAME)}</title><style>
:root{--accent:${palette[0]};--fill-soft:${palette[1]};--fill-pale:${palette[2]};--surface-opacity:25%;--raised-opacity:18%;--inset-opacity:8%;--soft:color-mix(in srgb,var(--fill-soft) var(--raised-opacity),transparent);--pale:color-mix(in srgb,var(--fill-pale) var(--surface-opacity),transparent);--inset-fill:color-mix(in srgb,var(--fill-soft) var(--inset-opacity),transparent);--inset:linear-gradient(var(--inset-fill),var(--inset-fill)),var(--canvas);--ink:#25212b;--muted:#68636f;--success:#267045;--error:#d32f2f;--canvas:#fff;--line:color-mix(in srgb,var(--accent) 22%,var(--pale))}
html[data-theme=dark]{--accent:${palette[3]};--fill-soft:${palette[4]};--fill-pale:${palette[5]};--inset-opacity:60%;--ink:#f2edf8;--muted:#b9b0c5;--success:#74d680;--error:#ff5c5c;--canvas:#17151d}
body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.65 system-ui,sans-serif;color:var(--ink);background:var(--canvas)}
h1{font-size:38px;line-height:1.2}h2{font-size:21px;line-height:1.4}
header,article{background:var(--pale);border:1px solid var(--line);border-radius:20px;padding:28px;margin:20px 0}article{background:var(--soft)}header strong{font-size:30px;color:var(--accent)}
aside{background:var(--inset);padding:14px;border:1px solid var(--line);border-radius:10px}aside b{color:var(--accent)}
.meta{color:var(--muted);font-size:13px}.ok{color:var(--success)}.bad{color:var(--error)}li{margin:20px 0}li p{margin:3px 0}
a{color:var(--accent);overflow-wrap:anywhere;text-underline-offset:.2em;transition:color 160ms ease,background-color 160ms ease}a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(hover:hover) and (pointer:fine){a:hover{background:var(--soft);text-decoration-thickness:2px}}a:active{background:var(--soft);text-decoration-thickness:2px}
@media(prefers-reduced-motion:reduce){a{transition:none}}.sources{font-size:13px}footer{font-size:13px;color:var(--muted)}
@media(forced-colors:active){a{color:LinkText!important}a:focus-visible{outline-color:Highlight}}
@media screen and (max-width:570px){body{margin:16px auto;padding:0 16px}h1{font-size:26px}header,article{padding:16px;margin:16px 0;border-radius:16px}header strong{font-size:24px}ul{padding-left:20px}}
@media print{:root,html[data-theme=dark]{--accent:${palette[0]};--fill-soft:${palette[1]};--fill-pale:${palette[2]};--inset-opacity:8%;--ink:#25212b;--muted:#68636f;--success:#267045;--error:#d32f2f;--canvas:#fff}body{padding:0;font-size:11pt}article{break-inside:avoid;border:0;border-bottom:1px solid var(--line);border-radius:0;padding:16px 0}header{border:0;padding:0}}
</style></head><body><header><div class="meta">${esc(APP_NAME)} · СОХРАНЁННЫЙ РАЗБОР</div><h1>${esc(levelById(attempt.level)?.name ?? '')} · уровень ${attempt.level}</h1><p>${attempt.mode === 'exam' ? 'Полный экзамен' : 'Работа над ошибками'}</p><strong>${score.correct} / ${score.total} · ${score.percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%</strong><p>Верно: ${score.correct}. Ошибки: ${score.wrong}. Пропущено: ${score.unanswered}.</p><p>Завершено: ${esc(attempt.completedAt)}. Версия вопросов: ${BANK_VERSION}.</p></header>${blocks}<footer>Независимые авторские задания по <a href="${PROGRAM_URL}">программе «Основы работы с ИИ»</a>. Этот результат не является официальной оценкой Яндекса. В файле сохранены исходные ответы и полный разбор.</footer></body></html>`);
}
