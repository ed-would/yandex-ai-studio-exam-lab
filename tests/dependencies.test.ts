import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';

type AstNode = {
  type: string;
  nodes?: AstNode[];
  parent?: AstNode;
  value?: string;
  isClose?: boolean;
  invalid?: boolean;
  queue?: AstNode[];
};
type BracesOptions = { expand?: boolean; escapeInvalid?: boolean; maxDepth?: number };
interface BracesApi {
  [key: string]: unknown;
  (input: string | string[], options?: BracesOptions): string | string[];
  parse(input: string): AstNode;
  compile(input: string | AstNode, options?: BracesOptions): string;
  expand(input: string | string[] | AstNode, options?: BracesOptions): string[];
  stringify(input: string | AstNode, options?: BracesOptions): string;
  create(input: string, options?: BracesOptions): string[];
}
type Micromatch = (files: string[], pattern: string) => string[];

const require = createRequire(import.meta.url);
const requireUnknown = (id: string): unknown => require(id);
const braces = requireUnknown('braces') as BracesApi;
const micromatch = requireUnknown('micromatch') as Micromatch;
const bracesPackage = requireUnknown('braces/package.json') as { name: string; version: string };
const root = fileURLToPath(new URL('../', import.meta.url));
const nested = (depth: number, open = '{', close = '}') => open.repeat(depth) + 'a' + close.repeat(depth);

function ast(depth: number): AstNode {
  const root: AstNode = { type: 'root', nodes: [] };
  let parent = root as AstNode & { nodes: AstNode[] };
  for (let i = 0; i < depth; i++) {
    const child: AstNode = { type: 'paren', nodes: [], parent };
    parent.nodes!.push(child);
    parent = child as AstNode & { nodes: AstNode[] };
  }
  parent.nodes!.push({ type: 'text', value: 'a', parent });
  return root;
}

test('Stylelint glob-зависимости разрешают локальный security-патч braces', () => {
  const fromMicromatch = createRequire(require.resolve('micromatch'));
  assert.equal(fromMicromatch.resolve('braces'), require.resolve('braces'));
  assert.equal(bracesPackage.name, 'braces');
  assert.equal(bracesPackage.version, '3.0.3-patch.2');
  for (const file of [
    'index.js',
    'package.json',
    ...['compile', 'constants', 'expand', 'parse', 'stringify', 'utils'].map((name) => `lib/${name}.js`),
  ]) {
    assert.equal(
      readFileSync(join(dirname(require.resolve('braces')), file), 'utf8'),
      readFileSync(new URL(`../vendor/braces/${file}`, import.meta.url), 'utf8'),
      `Installed patch differs from reviewed source: ${file}`,
    );
  }
});

test('обычные glob-паттерны, диапазоны и публичные API braces остаются совместимыми', () => {
  assert.deepEqual(braces.expand('{src,public}/**/*.css'), ['src/**/*.css', 'public/**/*.css']);
  assert.deepEqual(braces('level-{1..3}', { expand: true }), ['level-1', 'level-2', 'level-3']);
  assert.equal(braces.stringify(braces.parse('a/{b,{c,d}}/e')), 'a/{b,{c,d}}/e');
  assert.equal(braces.compile('{src,public}/**/*.css'), '(src|public)/**/*.css');
  assert.deepEqual(braces.create('{a,b}', { expand: true }), ['a', 'b']);
  assert.deepEqual(
    micromatch(['src/styles.css', 'public/theme-controls.css', 'src/app.tsx'], '{src,public}/**/*.css'),
    ['src/styles.css', 'public/theme-controls.css'],
  );
});

test('escapeInvalid сохраняет родительский контекст, compile не пишет в консоль', (t) => {
  assert.equal(braces.stringify(braces.parse('{a}'), { escapeInvalid: true }), '\\{a\\}');
  assert.equal(braces.stringify(braces.parse('${a,b}'), { escapeInvalid: true }), '$\\{a,b\\}');
  assert.deepEqual(braces.expand('${a,b}', { escapeInvalid: true }), ['$\\{a,b\\}']);
  const invalid = braces.parse('{a,b}');
  invalid.nodes!.find((node) => node.type === 'brace')!.invalid = true;
  assert.deepEqual(braces.expand(invalid, { escapeInvalid: true }), ['\\{a,b\\}']);
  const log = t.mock.method(console, 'log', () => {});
  assert.equal(
    braces.compile({ type: 'root', nodes: [{ type: 'text', value: '}', isClose: true }] }, { escapeInvalid: true }),
    '\\}',
  );
  assert.equal(log.mock.callCount(), 0);
});

test('глубокие строки отклоняются до переполнения стека во всех публичных API', () => {
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    const call = braces[method as 'parse' | 'compile' | 'expand' | 'stringify'] as (
      input: string,
      options?: BracesOptions,
    ) => unknown;
    for (const [open, close] of [
      ['{', '}'],
      ['(', ')'],
      ['{(', ')}'],
    ]) {
      assert.doesNotThrow(() => call(nested(open.length === 1 ? 100 : 50, open, close)));
      for (const depth of [101, 4000]) {
        assert.throws(() => call(nested(depth, open, close)), /exceeds max (depth|characters)/);
      }
    }
  }
  assert.throws(() => braces(nested(4000)), /exceeds max depth/);
  assert.throws(() => braces([nested(4000)], { expand: true }), /exceeds max depth/);
});

test('готовый AST не обходит ограничение глубины compile, expand и stringify', () => {
  for (const method of ['compile', 'expand', 'stringify']) {
    const call = braces[method as 'compile' | 'expand' | 'stringify'] as (
      input: AstNode,
      options?: BracesOptions,
    ) => unknown;
    assert.doesNotThrow(() => call(ast(100)));
    assert.throws(() => call(ast(101)), /AST depth .* exceeds max depth/);
    const cyclic: AstNode = { type: 'root', nodes: [] };
    cyclic.nodes!.push(cyclic);
    assert.throws(() => call(cyclic), /AST depth .* exceeds max depth/);
  }
});

test('maxDepth допускает только более строгую глубину и не отключает защиту', () => {
  for (const method of ['parse', 'compile', 'expand', 'stringify']) {
    const call = braces[method as 'parse' | 'compile' | 'expand' | 'stringify'] as (
      input: string | AstNode,
      options?: BracesOptions,
    ) => unknown;
    for (const maxDepth of [1, 1.5]) {
      assert.doesNotThrow(() => call(nested(1), { maxDepth }));
      assert.throws(() => call(nested(2), { maxDepth }), /exceeds max depth/);
    }
    for (const maxDepth of [Infinity, NaN, 10000]) {
      assert.throws(() => call(nested(101), { maxDepth }), /exceeds max depth/);
    }
  }
  assert.throws(() => braces.expand(ast(2), { maxDepth: 1.5 }), /exceeds max depth/);
});

test('цикл parent в AST останавливается без зависания процесса', () => {
  const checked = spawnSync(
    process.execPath,
    [
      '-e',
      `
      const assert = require('node:assert/strict');
      const braces = require('braces');
      const parent = { type: 'paren', queue: [] };
      parent.parent = parent;
      const child = { type: 'paren', nodes: [], parent };
      assert.throws(() => braces.expand({ type: 'root', nodes: [child] }), /parent chain contains a cycle/);
    `,
    ],
    { cwd: root, encoding: 'utf8', timeout: 3000 },
  );
  assert.ifError(checked.error);
  assert.equal(checked.status, 0, checked.stderr);
});

test('Stylelint продолжает выявлять реальные ошибки CSS', async () => {
  const result = await stylelint.lint({
    code: '.broken:totally-unknown { colour: red; }',
    configFile: fileURLToPath(new URL('../stylelint.config.mjs', import.meta.url)),
  });
  assert.equal(result.errored, true);
  const rules = result.results[0].warnings.map((warning) => warning.rule);
  assert.ok(rules.includes('property-no-unknown'));
  assert.ok(rules.includes('selector-pseudo-class-no-unknown'));
});
