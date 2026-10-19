import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typograph, typographChildren } from '../src/core/typography.ts';
import { h } from '../src/components/ui.tsx';

test('короткие слова, частицы и числа связаны неразрывными пробелами', () => {
  assert.equal(typograph('Текст в вопросе и в ответе.'), 'Текст в\u00a0вопросе и\u00a0в\u00a0ответе.');
  assert.equal(typograph('Ответ за 72 секунды.'), 'Ответ за\u00a072\u00a0секунды.');
  assert.equal(typograph('Можно ли проверить?'), 'Можно\u00a0ли проверить?');
  const text = 'Текст в вопросе и в ответе.';
  assert.equal(typograph(typograph(text)), typograph(text));
});

test('типографика сохраняет формулы, код, числа, URL и экранированный HTML', () => {
  const original = 'API gpt-4.1; 1/2; 3 м2; 95%; 2026-10-12.1; https://example.test/a?x=1&y=2';
  assert.equal(typograph(original).replaceAll('\u00a0', ' '), original);
  assert.equal(
    typograph('<p>Текст в вопросе</p><style>.a { width: 3px }</style>'),
    '<p>Текст в\u00a0вопросе</p><style>.a { width: 3px }</style>',
  );
  assert.equal(typograph('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  for (const value of [0, false, null, undefined, '']) assert.equal(typograph(value), value);
});

test('общий шаблон обрабатывает статический текст, интерполяции и массивы без изменения служебных props', () => {
  const value = 'в вопросе';
  const node = h(
    'a',
    { href: 'https://example.test/a?x=1&y=2', 'data-id': 'в вопросе', title: value },
    'Осталось ',
    72,
    ' секунды ',
    ['и в ответе'],
  );
  assert.ok(Array.isArray(node.props.children));
  assert.equal(node.props.children[0], 'Осталось 72\u00a0секунды ');
  assert.deepEqual(node.props.children[1], ['и\u00a0в\u00a0ответе']);
  assert.equal(node.props.title, 'в\u00a0вопросе');
  assert.equal(node.props['data-id'], value);
  assert.equal(node.props.href, 'https://example.test/a?x=1&y=2');
  const Component = () => null;
  assert.equal(h(Component, { value }).props.value, value);
  assert.equal(h('input', { value }).props.value, value);
  assert.equal(h('code', null, value).props.children, value);
  assert.deepEqual(typographChildren(['в ', null, ['ответе']]), ['в\u00a0', null, ['ответе']]);
});

test('во всём банке типограф меняет только пробелы, сохраняя исходные данные', () => {
  const visit = (value: unknown): void => {
    if (typeof value === 'string') assert.equal(typograph(value).replace(/\s/gu, ''), value.replace(/\s/gu, ''));
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  for (let domain = 1; domain <= 6; domain++) {
    const original = readFileSync(new URL(`../src/data/domain-${domain}.json`, import.meta.url), 'utf8');
    const bank = JSON.parse(original);
    visit(bank);
    assert.deepEqual(bank, JSON.parse(original));
  }
});
