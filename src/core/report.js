import { APP_NAME, domainById, levelById, PROGRAM_URL, BANK_VERSION } from '../data/meta.js';
import { evaluate, scoreAttempt } from './exam.js';

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

export function createHtmlReport(attempt, questions, theme = 'light') {
  const score = scoreAttempt(attempt, questions);
  const bank = new Map(questions.map((q) => [q.id, q]));
  const blocks = attempt.questionIds
    .map((id, index) => {
      const q = bank.get(id),
        answer = attempt.answers[id];
      const correct = answer && evaluate(q, answer.response);
      const status = correct ? 'Верно' : answer ? 'Ошибка' : 'Пропущено';
      let answers;
      if (q.type === 'match') {
        answers = q.left
          .map((left) => {
            const right = q.right.find((r) => r.id === q.pairs[left.id]);
            const chosen = q.right.find((r) => r.id === answer?.response[left.id]);
            return `<li><strong>${esc(left.text)} → ${esc(right.text)}</strong><p>Твой ответ: ${esc(chosen?.text || 'не дан')}.</p><p>${esc(q.pairExplanations[left.id])}</p></li>`;
          })
          .join('');
      } else {
        answers = q.options
          .map(
            (option) =>
              `<li><strong>${esc(option.text)}</strong><p>${q.correct.includes(option.id) ? 'Верный вариант' : 'Неверный вариант'}${answer?.response.includes(option.id) ? ' · твой выбор' : ''}.</p><p>${esc(option.explanation)}</p></li>`,
          )
          .join('');
      }
      return `<article><div class="meta">${index + 1}. ${esc(domainById(q.domain).short)} · <b class="${correct ? 'ok' : 'bad'}">${status}</b></div><h2>${esc(q.prompt)}</h2><p>${esc(q.explanation)}</p><aside><b>Запомнить:</b> ${esc(q.takeaway)}</aside><ul>${answers}</ul><div class="sources">${q.sources
        .filter((s) => /^https:\/\//.test(s.url))
        .map((s) => `<a href="${esc(s.url)}" rel="noopener noreferrer" target="_blank">${esc(s.title)}</a>`)
        .join(' · ')}</div></article>`;
    })
    .join('');
  return `<!doctype html><html lang="ru" data-theme="${theme === 'dark' ? 'dark' : 'light'}"><head><meta name="color-scheme" content="${theme === 'dark' ? 'dark' : 'light'}"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Разбор · ${esc(APP_NAME)}</title><style>body{max-width:900px;margin:40px auto;padding:0 24px;font:16px/1.65 system-ui,sans-serif;color:#172b2b;background:#f7f7f4}h1{font-size:38px;line-height:1.2}h2{font-size:21px;line-height:1.4}header,article{background:white;border:1px solid #dddeda;border-radius:20px;padding:28px;margin:20px 0}header strong{font-size:30px}aside{background:#e7f2df;padding:14px;border-radius:10px}.meta{color:#62716c;font-size:13px}.ok{color:#17633c}.bad{color:#a4382a}li{margin:20px 0}li p{margin:3px 0}a{color:#004d59;overflow-wrap:anywhere;text-underline-offset:.2em;transition:color 160ms ease}a:focus-visible{outline:3px solid #7650bf;outline-offset:3px}@media(hover:hover) and (pointer:fine){a:hover{color:#00333b;text-decoration-thickness:2px}}a:active{color:#6841ab;text-decoration-thickness:2px}@media(prefers-reduced-motion:reduce){a{transition:none}}.sources{font-size:13px}footer{font-size:13px;color:#626b68}html[data-theme=dark] body{color:#f2edf8;background:#17151d}html[data-theme=dark] header,html[data-theme=dark] article{background:#24212d;border-color:#494152}html[data-theme=dark] aside{background:#273f40}html[data-theme=dark] .meta,html[data-theme=dark] footer{color:#b9b0c5}html[data-theme=dark] .ok{color:#9cddb1}html[data-theme=dark] .bad{color:#f1b3a4}html[data-theme=dark] a{color:#93d7d0}html[data-theme=dark] a:focus-visible{outline-color:#c4a8f4}@media(hover:hover) and (pointer:fine){html[data-theme=dark] a:hover{color:#c2f0e9}}html[data-theme=dark] a:active{color:white}@media print{html[data-theme=dark] body,html[data-theme=dark] header,html[data-theme=dark] article,html[data-theme=dark] aside{color:#172b2b;background:white}html[data-theme=dark] .meta,html[data-theme=dark] footer{color:#62716c}html[data-theme=dark] a{color:#004d59}html[data-theme=dark] .ok{color:#17633c}html[data-theme=dark] .bad{color:#a4382a}body{background:white;padding:0;font-size:11pt}article{break-inside:avoid;border:0;border-bottom:1px solid #ccc;border-radius:0;padding:16px 0}header{border:0;padding:0}}</style></head><body><header><div class="meta">${esc(APP_NAME)} · СОХРАНЁННЫЙ РАЗБОР</div><h1>${esc(levelById(attempt.level).name)} · уровень ${attempt.level}</h1><p>${attempt.mode === 'exam' ? 'Полный экзамен' : 'Работа над ошибками'}</p><strong>${score.correct} / ${score.total} · ${score.percent}%</strong><p>Верно: ${score.correct}. Ошибки: ${score.wrong}. Пропущено: ${score.unanswered}.</p><p>Завершено: ${esc(attempt.completedAt)}. Версия вопросов: ${BANK_VERSION}.</p></header>${blocks}<footer>Независимые авторские задания по <a href="${PROGRAM_URL}">программе «Основы работы с ИИ»</a>. Этот результат не является официальной оценкой Яндекса. В файле сохранены исходные ответы и полный разбор.</footer></body></html>`;
}
