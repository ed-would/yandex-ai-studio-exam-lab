import Typograf from 'typograf';

const typograf = new Typograf({ locale: ['ru', 'en-US'] });
// Only spacing rules: question wording, formulas and units keep their original meaning.
typograf.disableRule('*');
typograf.enableRule([
  'common/nbsp/afterShortWord',
  'common/nbsp/afterShortWordByList',
  'common/nbsp/afterNumber',
  'common/nbsp/beforeShortLastWord',
  'common/nbsp/beforeShortLastNumber',
  'ru/nbsp/beforeParticle',
  'ru/nbsp/initials',
  'ru/nbsp/afterNumberSign',
]);

const cache = new Map();

export function typograph(value) {
  if (typeof value !== 'string' || !value) return value;
  if (cache.has(value)) return cache.get(value);
  const result = typograf.execute(value);
  // Reports and changing timer/status strings must not grow the cache indefinitely.
  if (value.length < 2000) {
    if (cache.size >= 2000) cache.clear();
    cache.set(value, result);
  }
  return result;
}

export function typographChildren(children) {
  const result = [];
  let text = '';
  const flush = () => {
    if (text) result.push(typograph(text));
    text = '';
  };
  for (const child of children) {
    if (typeof child === 'string' || typeof child === 'number') text += child;
    else {
      flush();
      result.push(Array.isArray(child) ? typographChildren(child) : child);
    }
  }
  flush();
  return result;
}
