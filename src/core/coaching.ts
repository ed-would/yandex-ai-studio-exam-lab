import { DOMAINS, TRAINING_TARGET } from '../data/meta.ts';
import { evaluate, scoreAttempt } from './exam.ts';
import type { Attempt, Question } from '../types.ts';

const OUTCOMES = {
  excellent: {
    id: 'excellent',
    icon: 'rosette',
    achievement: 'Точность в деталях',
    title: 'Сильный результат.',
    description:
      'Основные темы уже складываются в цельную картину. Закрепи оставшиеся нюансы и проверь себя в более сложных ситуациях.',
  },
  confident: {
    id: 'confident',
    icon: 'shield',
    achievement: 'Учебная цель достигнута',
    title: 'Есть уверенная опора.',
    description:
      'Учебная цель достигнута. Теперь полезнее точечно разобрать ошибки и укрепить темы, в которых пока меньше уверенности.',
  },
  close: {
    id: 'close',
    icon: 'spark',
    achievement: 'На пути к цели',
    title: 'До цели осталось несколько шагов.',
    description:
      'Хорошая основа уже есть. Сосредоточь следующую тренировку на темах ниже: они помогут продвинуться к учебной цели.',
  },
  starting: {
    id: 'starting',
    icon: 'seed',
    achievement: 'Точка старта найдена',
    title: 'Теперь есть маршрут.',
    description:
      'Эта попытка показала, с чего начать подготовку. Разбери несколько ключевых тем, потренируйся на ошибках и возвращайся к полному тесту.',
  },
};

const RESULT_BACKGROUNDS = {
  1: 'result-level-1-mono-light',
  2: 'result-level-2-mono-light',
  3: 'result-level-3-mono-light',
};

export function resultOutcome(percent: number) {
  if (percent >= 95) return OUTCOMES.excellent;
  if (percent >= TRAINING_TARGET) return OUTCOMES.confident;
  return percent >= 60 ? OUTCOMES.close : OUTCOMES.starting;
}

const FORMATS = {
  single: { title: 'Один ответ', tip: 'Сначала выдели главный критерий в условии, затем сравни с ним каждый вариант.' },
  multi: {
    title: 'Мультивыбор',
    tip: 'Оцени каждый вариант отдельно. Весь набор должен совпасть: лишний вариант и пропуск верного дают 0 баллов.',
  },
  match: {
    title: 'Сопоставление',
    tip: 'Сверь смысл каждой пары и проверь все связи перед ответом. Один неверный элемент меняет результат всего задания.',
  },
};

export function resultCoaching(attempt: Attempt, questions: Question[]) {
  const score = scoreAttempt(attempt, questions);
  const bank = new Map(questions.map((q) => [q.id, q]));
  const failures: Question[] = [];
  const formats = Object.entries(FORMATS).map(([type, copy]) => ({ type, ...copy, answered: 0, wrong: 0 }));
  for (const id of attempt.questionIds) {
    const question = bank.get(id);
    const answer = attempt.answers[id];
    if (!question || !answer) continue;
    const format = formats.find((item) => item.type === question.type);
    if (!format) continue;
    format.answered++;
    if (!evaluate(question, answer.response)) {
      failures.push(question);
      format.wrong++;
    }
  }
  const domains = score.byDomain
    .filter((row) => row.total)
    .map((row) => {
      const metadata = DOMAINS.find((domain) => domain.id === row.domain);
      const missed = failures.filter((question) => question.domain === row.domain);
      const topics = [...new Map(missed.map((q) => [q.topic, { title: q.topic, takeaway: q.takeaway }])).values()];
      return {
        ...row,
        ...metadata,
        wrong: row.answered - row.correct,
        skipped: row.total - row.answered,
        percent: Math.round((row.correct / row.total) * 100),
        topics,
      };
    });
  const priorities = domains
    .filter((row) => row.wrong > 0)
    .sort((a, b) => b.wrong / b.answered - a.wrong / a.answered || b.wrong - a.wrong || b.weight - a.weight);
  const strong = domains.filter(
    (row) => row.answered === row.total && row.correct / row.total >= TRAINING_TARGET / 100,
  );
  const skipped = domains.filter((row) => row.skipped > 0);
  const isPractice = attempt.mode === 'mistakes';
  const outcome = { ...resultOutcome(score.percent), background: RESULT_BACKGROUNDS[attempt.level] };
  if (score.unanswered) {
    outcome.achievement = 'Попытка завершена досрочно';
    outcome.title = score.answered ? 'Есть ещё что проверить.' : 'Начни с первого ответа.';
    outcome.description = score.answered
      ? 'Пропущенные задания вошли в результат с нулём баллов. Ошибки уже можно разобрать, а по пропускам ещё предстоит проверить знания.'
      : 'В этой попытке нет проверенных ответов. Пока рано делать выводы о сильных и слабых темах. Начни новую тренировку.';
  } else if (isPractice) {
    outcome.achievement = score.percent === 100 ? 'Подборка без ошибок' : 'Работа над ошибками';
    outcome.title = score.percent === 100 ? 'Нюансы закреплены.' : 'Ошибки становятся опытом.';
    outcome.description =
      'Это результат выбранной подборки. Чтобы оценить подготовку по всем шести темам, пройди полный тест этого уровня.';
  } else if (score.percent === 100) {
    outcome.title = 'Безошибочный раунд.';
    outcome.achievement = `Все ${score.total} заданий решены верно`;
    outcome.description =
      'В этой попытке все задания решены верно. Проверь, насколько легко ты переносишь эти знания в новые рабочие ситуации.';
  }
  return {
    score,
    outcome,
    domains,
    priorities,
    strong,
    skipped,
    isPractice,
    needed: Math.max(0, Math.ceil((score.total * TRAINING_TARGET) / 100) - score.correct),
    formatFocus: formats.filter((item) => item.wrong > 0).sort((a, b) => b.wrong - a.wrong)[0] || null,
  };
}
