import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = ['single', 'multi', 'match'];
const RUSSIAN = /[А-Яа-яЁё]/u;
const LETTER = /\p{L}/u;
// oxlint-disable-next-line no-control-regex -- Управляющие символы намеренно запрещены контрактом банка.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
// oxlint-disable-next-line no-control-regex -- Прямая ссылка не должна содержать управляющие символы.
const UNSAFE_URL = /[\s<>"'\u0000-\u001F]/u;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalizedPrompt = (value) =>
  String(value).normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/gu, 'е').replace(/\s+/gu, ' ').trim();

/** Read the authored JSON directly; no Vite JSON-import behaviour is required. */
export async function readQuestionBank(root = ROOT) {
  const domains = await Promise.all(
    Array.from({ length: 6 }, async (_, index) => {
      const domain = index + 1;
      const name = `src/data/domain-${domain}.json`;
      let value;
      try {
        value = JSON.parse(await readFile(path.join(root, name), 'utf8'));
      } catch (error) {
        throw new Error(`${name}: не удалось прочитать JSON (${error.message}).`);
      }
      if (!Array.isArray(value)) throw new Error(`${name}: ожидается массив вопросов.`);
      if (value.length !== 30) throw new Error(`${name}: ожидается 30 вопросов, получено ${value.length}.`);
      if (value.some((question) => !record(question) || question.domain !== domain)) {
        throw new Error(`${name}: файл содержит вопрос другого домена или повреждённую запись.`);
      }
      return value;
    }),
  );
  return domains
    .flat()
    .sort((a, b) => a.level - b.level || a.domain - b.domain || String(a.id).localeCompare(String(b.id)));
}

/**
 * Structural and editorial guard for the distributable bank.
 * It verifies Russian prose mechanically, but does not claim to verify factual
 * correctness, semantic uniqueness, or current availability of source pages.
 */
export function validateBank(questions) {
  const errors = [];
  const warnings = [];
  const cells = new Map();
  const ids = new Set();
  const prompts = new Map();
  const sources = new Set();
  const multiSizes = new Map(Array.from({ length: 6 }, (_, i) => [i + 1, new Set()]));
  const singlePositions = new Map(Array.from({ length: 6 }, (_, i) => [i + 1, {}]));
  const error = (where, message) => errors.push(`${where}: ${message}`);
  const text = (value, where, { russian = false, label = false } = {}) => {
    if (typeof value !== 'string' || !value.trim()) {
      error(where, 'ожидается непустой текст');
      return false;
    }
    if (value !== value.trim()) error(where, 'лишние пробелы по краям');
    if (CONTROL.test(value)) error(where, 'недопустимые управляющие символы');
    if (russian && !RUSSIAN.test(value)) error(where, 'пояснение или формулировка должны быть на русском');
    // A number or mathematical expression is a valid answer label. Textual
    // options retain Russian wording even when product names appear in Latin.
    if (label && LETTER.test(value) && !RUSSIAN.test(value))
      error(where, 'текстовый вариант должен содержать русскую формулировку');
    return true;
  };
  const itemList = (value, where, prefix, withExplanation = false) => {
    if (!Array.isArray(value) || value.length < 4 || value.length > 5) {
      error(where, 'ожидается 4–5 элементов');
      return [];
    }
    const seen = new Set();
    for (const [index, item] of value.entries()) {
      const at = `${where}[${index}]`;
      if (!record(item)) {
        error(at, 'ожидается объект');
        continue;
      }
      const validId =
        prefix === 'option' ? /^[a-e]$/u.test(item.id) : new RegExp(`^${prefix}[1-5]$`, 'u').test(item.id);
      if (typeof item.id !== 'string' || !validId) error(at, 'некорректный идентификатор элемента');
      if (seen.has(item.id)) error(at, 'идентификатор повторяется');
      seen.add(item.id);
      text(item.text, `${at}.text`, { label: true });
      if (withExplanation) text(item.explanation, `${at}.explanation`, { russian: true });
    }
    return value.filter(record).map((item) => item.id);
  };

  if (!Array.isArray(questions))
    return { errors: ['Банк: ожидается массив.'], warnings, stats: { total: 0, sources: 0, cells: [] } };
  if (questions.length !== 180) error('Банк', `ожидается 180 вопросов, получено ${questions.length}`);

  for (const [index, q] of questions.entries()) {
    const at = record(q) && typeof q.id === 'string' ? q.id : `Вопрос ${index + 1}`;
    if (!record(q)) {
      error(at, 'ожидается объект');
      continue;
    }
    if (![1, 2, 3].includes(q.level)) error(at, 'уровень должен быть 1, 2 или 3');
    if (![1, 2, 3, 4, 5, 6].includes(q.domain)) error(at, 'домен должен быть от 1 до 6');
    if (!TYPES.includes(q.type)) error(at, 'неизвестный тип вопроса');
    const idParts = typeof q.id === 'string' ? /^L([1-3])-D([1-6])-Q(?:0[1-9]|10)$/u.exec(q.id) : null;
    if (!idParts || Number(idParts[1]) !== q.level || Number(idParts[2]) !== q.domain)
      error(at, 'ID должен соответствовать уровню, домену и номеру 01–10');
    if (ids.has(q.id)) error(at, 'ID не уникален');
    ids.add(q.id);

    for (const field of ['topic', 'prompt', 'explanation', 'takeaway'])
      text(q[field], `${at}.${field}`, { russian: true });
    if (typeof q.prompt === 'string') {
      const key = normalizedPrompt(q.prompt);
      if (prompts.has(key)) error(at, `повтор формулировки из ${prompts.get(key)}`);
      else prompts.set(key, at);
    }

    const cellKey = `${q.level}:${q.domain}`;
    const cell = cells.get(cellKey) || { level: q.level, domain: q.domain, total: 0, single: 0, multi: 0, match: 0 };
    cell.total += 1;
    if (TYPES.includes(q.type)) cell[q.type] += 1;
    cells.set(cellKey, cell);

    if (!Array.isArray(q.sources) || q.sources.length < 1 || q.sources.length > 3) {
      error(at, 'нужны 1–3 прямых источника');
    } else {
      const seenSources = new Set();
      for (const [i, source] of q.sources.entries()) {
        const where = `${at}.sources[${i}]`;
        if (!record(source)) {
          error(where, 'ожидается объект источника');
          continue;
        }
        text(source.title, `${where}.title`);
        let parsed;
        try {
          parsed = new URL(source.url);
        } catch {
          error(where, 'некорректный URL');
          continue;
        }
        if (
          typeof source.url !== 'string' ||
          !source.url.startsWith('https://') ||
          parsed.protocol !== 'https:' ||
          !parsed.hostname ||
          parsed.username ||
          parsed.password ||
          UNSAFE_URL.test(source.url)
        ) {
          error(where, 'нужна прямая ссылка HTTPS без учётных данных и управляющих символов');
        }
        if (/^(?:bit\.ly|t\.co|tinyurl\.com|goo\.gl|shorturl\.at)$/iu.test(parsed.hostname))
          error(where, 'сокращатель URL не является прямой ссылкой на материал');
        if (seenSources.has(source.url)) error(where, 'источник повторяется внутри вопроса');
        seenSources.add(source.url);
        sources.add(source.url);
      }
    }

    if (q.type === 'single' || q.type === 'multi') {
      const optionIds = itemList(q.options, `${at}.options`, 'option', true);
      if (q.type === 'multi' && q.options?.length !== 5)
        error(at, 'множественный выбор должен содержать ровно 5 вариантов');
      if (!Array.isArray(q.correct) || q.correct.length < 1 || q.correct.length > 5) {
        error(at, 'correct должен содержать 1–5 идентификаторов');
      } else {
        if (new Set(q.correct).size !== q.correct.length) error(at, 'правильный вариант повторён');
        if (q.correct.some((id) => !optionIds.includes(id))) error(at, 'correct ссылается на отсутствующий вариант');
        if (q.type === 'single' && q.correct.length !== 1) error(at, 'для single нужен ровно один правильный вариант');
        if (q.type === 'multi') multiSizes.get(q.domain)?.add(q.correct.length);
        if (q.type === 'single' && singlePositions.has(q.domain)) {
          const distribution = singlePositions.get(q.domain);
          distribution[q.correct[0]] = (distribution[q.correct[0]] || 0) + 1;
        }
      }
      for (const field of ['left', 'right', 'pairs', 'pairExplanations']) {
        if (field in q) error(at, `поле ${field} относится только к сопоставлению`);
      }
    }

    if (q.type === 'match') {
      const left = itemList(q.left, `${at}.left`, 'l');
      const right = itemList(q.right, `${at}.right`, 'r');
      if (left.length !== right.length) error(at, 'колонки сопоставления должны быть одной длины');
      if (!record(q.pairs)) error(at, 'pairs должен быть объектом');
      else {
        const keys = Object.keys(q.pairs);
        const values = Object.values(q.pairs);
        if (
          keys.length !== left.length ||
          keys.some((id) => !left.includes(id)) ||
          left.some((id) => !Object.hasOwn(q.pairs, id))
        )
          error(at, 'pairs должен покрывать всю левую колонку без лишних ключей');
        if (
          new Set(values).size !== values.length ||
          values.length !== right.length ||
          values.some((id) => !right.includes(id))
        )
          error(at, 'сопоставление должно быть полной биекцией без повторов справа');
      }
      if (!record(q.pairExplanations)) error(at, 'нужны объяснения всех пар');
      else {
        const keys = Object.keys(q.pairExplanations);
        if (keys.length !== left.length || keys.some((id) => !left.includes(id)))
          error(at, 'объяснения должны соответствовать всем левым элементам без лишних ключей');
        for (const id of left) text(q.pairExplanations[id], `${at}.pairExplanations.${id}`, { russian: true });
      }
      for (const field of ['options', 'correct'])
        if (field in q) error(at, `поле ${field} не используется для сопоставления`);
    }
  }

  const matrix = [];
  for (const level of [1, 2, 3]) {
    for (const domain of [1, 2, 3, 4, 5, 6]) {
      const cell = cells.get(`${level}:${domain}`) || { level, domain, total: 0, single: 0, multi: 0, match: 0 };
      matrix.push(cell);
      if (cell.total !== 10 || cell.single !== 4 || cell.multi !== 4 || cell.match !== 2) {
        error(
          `Уровень ${level}, домен ${domain}`,
          `нужно 10 вопросов (4 single / 4 multi / 2 match), получено ${cell.total} (${cell.single}/${cell.multi}/${cell.match})`,
        );
      }
    }
  }
  for (const [domain, sizes] of multiSizes) {
    if (!sizes.has(1) || !sizes.has(5))
      error(`Домен ${domain}`, 'нужны вопросы multi с одним и с пятью правильными вариантами');
    const missing = [1, 2, 3, 4, 5].filter((size) => !sizes.has(size));
    if (missing.length)
      warnings.push(
        `Домен ${domain}: размеры правильного набора multi, не представленные в банке: ${missing.join(', ')}.`,
      );
  }
  return {
    errors,
    warnings,
    stats: {
      total: questions.length,
      sources: sources.size,
      cells: matrix,
      multiSizes: Object.fromEntries([...multiSizes].map(([id, set]) => [id, [...set].sort()])),
      singlePositions: Object.fromEntries(singlePositions),
    },
  };
}

export async function main() {
  try {
    const bank = await readQuestionBank();
    const result = validateBank(bank);
    if (result.errors.length) {
      console.error(`Банк вопросов не прошёл проверку: ${result.errors.length} ошибок.`);
      for (const message of result.errors) console.error(`  • ${message}`);
      process.exitCode = 1;
      return result;
    }
    console.log(`Банк проверен: ${result.stats.total} вопросов, 3 уровня × 6 доменов × 10 вопросов.`);
    console.log('В каждой группе: 4 с одним ответом, 4 с множественным выбором, 2 на сопоставление.');
    console.log(
      `ID и формулировки уникальны; объяснения и биекции полны; ${result.stats.sources} прямых HTTPS-источников.`,
    );
    console.log('Русские формулировки проверены; во всех доменах есть multi с 1 и 5 верными вариантами.');
    for (const warning of result.warnings) console.warn(`Примечание: ${warning}`);
    return result;
  } catch (error) {
    console.error(`Ошибка чтения банка: ${error.message}`);
    process.exitCode = 1;
    return { errors: [error.message] };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
