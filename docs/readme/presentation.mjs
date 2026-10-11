import fs from 'node:fs/promises';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const outDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(outDir, '../..');
const buildDir = path.join(workspaceDir, 'node_modules/.cache/readme-presentation');
const fallbackDir = path.join(buildDir, 'fallback');
const presentationSkillDir = process.env.PRESENTATION_SKILL_DIR;
const runtimeNodeModules = process.env.RUNTIME_NODE_MODULES;
const pythonExecutable = process.env.PYTHON_EXECUTABLE;
const pptxOutput = process.env.PRESENTATION_PPTX_OUTPUT ?? path.join(outDir, 'presentation.pptx');

if (!presentationSkillDir) throw new Error('PRESENTATION_SKILL_DIR is required');
if (!runtimeNodeModules) throw new Error('RUNTIME_NODE_MODULES is required');
if (!pythonExecutable) throw new Error('PYTHON_EXECUTABLE is required');

const { importRuntimeModule } = await import(pathToFileURL(path.join(presentationSkillDir, 'container_tools/runtime_helpers.mjs')).href);
const { finalizePresentation } = await import(pathToFileURL(path.join(presentationSkillDir, 'container_tools/artifact_tool_utils.mjs')).href);
const DISPLAY_FONT = 'Unbounded';
const BODY_FONT = 'Arial';
const W = 1280;
const H = 720;

const C = {
  ink: '#25212B',
  muted: '#68636F',
  paper: '#FFFFFF',
  lilac: '#F0EDF4',
  lilacDeep: '#E8E2F0',
  purple: '#6841AB',
  purpleSoft: '#E9DCFB',
  sage: '#465C16',
  sageSoft: '#E6EFA9',
  teal: '#005B64',
  tealSoft: '#D6EFEB',
  dark: '#17151D',
  darkSurface: '#24212D',
  white: '#FFFFFF',
};

const assets = {
  hero: path.join(workspaceDir, 'public/images/artwork/hero-ribbon-expanded-1152-optimized.webp'),
  level1: path.join(workspaceDir, 'public/images/artwork/level-1-foundations-512-optimized.webp'),
  level2: path.join(workspaceDir, 'public/images/artwork/level-2-application-512-optimized.webp'),
  level3: path.join(workspaceDir, 'public/images/artwork/level-3-expert-512-optimized.webp'),
  logo: path.join(workspaceDir, 'public/images/brand/trainer-abstract-256-optimized.webp'),
};

// The bundled artifact runtime's PDF export refers to these standard-font
// metrics through a private import alias that is absent from the packaged
// runtime. Resolve that alias locally without changing the runtime bundle.
const originalResolveFilename = Module._resolveFilename;
const standardFontFiles = {
  Courier: 'Courier.cjs',
  CourierBold: 'CourierBold.cjs',
  CourierBoldOblique: 'CourierBoldOblique.cjs',
  CourierOblique: 'CourierOblique.cjs',
  Helvetica: 'Helvetica.cjs',
  HelveticaBold: 'HelveticaBold.cjs',
  HelveticaBoldOblique: 'HelveticaBoldOblique.cjs',
  HelveticaOblique: 'HelveticaOblique.cjs',
  Symbol: 'Symbol.cjs',
  TimesBold: 'TimesBold.cjs',
  TimesBoldItalic: 'TimesBoldItalic.cjs',
  TimesItalic: 'TimesItalic.cjs',
  TimesRoman: 'TimesRoman.cjs',
  ZapfDingbats: 'ZapfDingbats.cjs',
};
Module._resolveFilename = function resolveArtifactStandardFont(request, parent, isMain, options) {
  const prefix = '#standard-fonts/';
  if (request.startsWith(prefix)) {
    const name = request.slice(prefix.length);
    const file = standardFontFiles[name];
    if (file) return path.join(buildDir, 'standard-fonts', file);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

async function ensureStandardFontAdapters() {
  const adapterDir = path.join(buildDir, 'standard-fonts');
  await fs.mkdir(adapterDir, { recursive: true });
  const standardFontModule = path.join(runtimeNodeModules, '@pdf-lib/standard-fonts/lib/Font.js');
  const adapter = `const { Font } = require(${JSON.stringify(standardFontModule)});\nmodule.exports = (name) => {\n  const source = Font.load(name);\n  return { name, bbox: source.FontBBox, ascender: source.Ascender, descender: source.Descender, xHeight: source.XHeight, capHeight: source.CapHeight, glyphNames: source.CharMetrics.map((metric) => metric.N).join(' '), glyphWidths: source.CharMetrics.map((metric) => metric.WX), kernPairs: [] };\n};\n`;
  await fs.writeFile(path.join(adapterDir, 'adapt.cjs'), adapter);
  for (const [moduleName, fontName] of Object.entries({
    Courier: 'Courier', CourierBold: 'Courier-Bold', CourierBoldOblique: 'Courier-BoldOblique', CourierOblique: 'Courier-Oblique',
    Helvetica: 'Helvetica', HelveticaBold: 'Helvetica-Bold', HelveticaBoldOblique: 'Helvetica-BoldOblique', HelveticaOblique: 'Helvetica-Oblique',
    Symbol: 'Symbol', TimesBold: 'Times-Bold', TimesBoldItalic: 'Times-BoldItalic', TimesItalic: 'Times-Italic', TimesRoman: 'Times-Roman', ZapfDingbats: 'ZapfDingbats',
  })) {
    await fs.writeFile(path.join(adapterDir, `${moduleName}.cjs`), `module.exports = require('./adapt.cjs')(${JSON.stringify(fontName)});\n`);
  }
}

async function readImageBlob(imagePath) {
  const bytes = await fs.readFile(imagePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function shape(slide, geometry, left, top, width, height, fill = 'none', lineFill = 'none', name = undefined) {
  return slide.shapes.add({
    geometry,
    name,
    position: { left, top, width, height },
    fill,
    line: { style: 'solid', fill: lineFill, width: lineFill === 'none' ? 0 : 1 },
  });
}

function text(slide, value, left, top, width, height, options = {}) {
  const s = shape(slide, 'textbox', left, top, width, height, 'none', 'none', options.name);
  s.text = value;
  s.text.style = {
    typeface: options.typeface ?? BODY_FONT,
    fontSize: options.size ?? 22,
    color: options.color ?? C.ink,
    bold: options.bold ?? false,
    alignment: options.align ?? 'left',
    verticalAlignment: options.valign ?? 'top',
    lineSpacing: options.lineSpacing ?? 1.05,
    autoFit: 'shrinkText',
    insets: options.insets ?? 0,
  };
  return s;
}

function label(slide, value, left, top, width, color = C.purple) {
  return text(slide, value.toUpperCase(), left, top, width, 22, { size: 13, color, bold: true, typeface: DISPLAY_FONT });
}

function title(slide, value, options = {}) {
  return text(slide, value, 72, 62, options.width ?? 760, options.height ?? 98, {
    size: options.size ?? 42,
    color: options.color ?? C.ink,
    bold: true,
    typeface: DISPLAY_FONT,
    lineSpacing: 0.96,
  });
}

function footer(slide, n, dark = false) {
  text(slide, `Тренажёр компетенций ИИ  ·  ${String(n).padStart(2, '0')}`, 72, 680, 360, 18, {
    size: 11,
    color: dark ? '#B9B0C5' : C.muted,
  });
}

async function addImage(slide, imagePath, left, top, width, height, alt, fit = 'contain', geometry = 'rect') {
  slide.images.add({
    blob: await readImageBlob(imagePath),
    contentType: imagePath.endsWith('.webp') ? 'image/webp' : 'image/png',
    alt,
    fit,
    geometry,
    position: { left, top, width, height },
  });
}

function note(slide, lines) {
  slide.speakerNotes.text = lines.join('\n');
  slide.speakerNotes.setVisible(true);
}

function addPill(slide, value, left, top, width, fill, ink = C.ink) {
  shape(slide, 'roundRect', left, top, width, 34, fill, 'none');
  text(slide, value, left + 10, top + 7, width - 20, 20, { size: 13, color: ink, bold: true, align: 'center' });
}

function addDot(slide, x, y, size, fill) {
  shape(slide, 'ellipse', x, y, size, size, fill, 'none');
}

async function build() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(buildDir, { recursive: true });
  const stagingDir = await fs.mkdtemp(path.join(buildDir, 'finalizer-'));
  await fs.mkdir(fallbackDir, { recursive: true });
  await ensureStandardFontAdapters();

  process.env.RUNTIME_NODE_MODULES = runtimeNodeModules;
  const { Presentation, PresentationFile, registerPdfFontFace } = await importRuntimeModule('@oai/artifact-tool');
  const arialRegular = await fs.readFile('/System/Library/Fonts/Supplemental/Arial.ttf');
  const arialBold = await fs.readFile('/System/Library/Fonts/Supplemental/Arial Bold.ttf');
  await registerPdfFontFace({ family: BODY_FONT, weight: 400, source: arialRegular });
  await registerPdfFontFace({ family: BODY_FONT, weight: 700, source: arialBold });
  // DESIGN.md specifies the project's local Unbounded variable WOFF2 for display
  // type. Artifact Tool's standalone PDFKit exporter currently rejects WOFF2
  // (it accepts WOFF/TTF/OTF only). Keep the exact typeface declaration in the
  // editable deck; the static HTML companion is the exact WOFF2 render source.
  const localUnboundedWoff2 = await fs.readFile(path.join(workspaceDir, 'public/fonts/unbounded-cyrillic-variable.woff2'));
  if (localUnboundedWoff2.byteLength === 0) throw new Error('Local Unbounded WOFF2 is empty');
  await registerPdfFontFace({ family: DISPLAY_FONT, weight: 400, source: arialRegular });
  await registerPdfFontFace({ family: DISPLAY_FONT, weight: 700, source: arialBold });
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });

  // 1. Cover
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.dark;
    shape(slide, 'rect', 0, 0, W, H, C.dark, 'none');
    shape(slide, 'rect', 0, 0, 765, H, '#201C2A', 'none');
    await addImage(slide, assets.hero, 690, 0, 590, 720, 'Лавандовая лента с тремя цветами уровней', 'cover');
    shape(slide, 'rect', 0, 0, W, H, { type: 'gradient', gradientKind: 'linear', angleDeg: 0, stops: [
      { offset: 0, color: '#17151D' }, { offset: 61000, color: '#17151DCC' }, { offset: 100000, color: '#17151D00' },
    ] }, 'none');
    await addImage(slide, assets.logo, 72, 54, 58, 58, 'Абстрактный знак тренажёра', 'contain', 'ellipse');
    label(slide, 'Yandex AI Studio · самостоятельная практика', 72, 144, 500, '#C5A8F2');
    text(slide, 'Тренажёр\nкомпетенций ИИ', 72, 184, 560, 186, { size: 52, color: C.white, bold: true, typeface: DISPLAY_FONT, lineSpacing: 0.94 });
    text(slide, '180 авторских заданий · 3 уровня · 6 доменов', 76, 404, 520, 32, { size: 21, color: '#F2EDF8' });
    addPill(slide, 'Локальное веб-приложение', 76, 482, 230, '#E9DCFB', C.purple);
    addPill(slide, 'MIT', 320, 482, 72, '#D6EFEB', C.teal);
    text(slide, 'Практика перед экзаменом «Основы работы с ИИ»', 76, 556, 480, 28, { size: 17, color: '#B9B0C5' });
    text(slide, '2026', 1110, 654, 90, 28, { size: 15, color: '#B9B0C5', bold: true, align: 'right' });
    note(slide, [
      'Источники: DESIGN.md; src/data/meta.js; docs/SOURCE_REVIEW.md.',
      'Изображение: public/images/artwork/hero-ribbon-expanded-1152-optimized.webp, локальный авторский artwork проекта.',
      'Знак: public/images/brand/trainer-abstract-256-optimized.webp.',
    ]);
  }

  // 2. Purpose and independence
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.paper;
    label(slide, 'Зачем он нужен', 72, 48);
    title(slide, 'Подготовка, которую можно запустить сразу', { width: 760 });
    text(slide, 'Приложение собирает учебную практику в одном локальном интерфейсе. Оно помогает пройти вопросы, увидеть разбор и вернуться к ошибкам без аккаунта и сервера.', 76, 178, 610, 90, { size: 22, color: C.muted, lineSpacing: 1.12 });
    // Editorial action list: concrete implemented behavior replaces generic value cards.
    shape(slide, 'rect', 72, 304, 5, 250, C.purple, 'none');
    await addImage(slide, assets.logo, 104, 318, 92, 92, 'Абстрактный знак тренажёра', 'contain', 'ellipse');
    text(slide, 'ЛОКАЛЬНЫЙ КОНТУР', 220, 332, 260, 24, { size: 13, color: C.purple, bold: true, typeface: DISPLAY_FONT });
    text(slide, 'Открыть → ответить → разобрать', 220, 370, 430, 32, { size: 22, color: C.ink, bold: true, typeface: DISPLAY_FONT });
    text(slide, 'Статический сайт запускается без аккаунта и сервера. Попытки остаются в браузере ученика.', 220, 420, 430, 52, { size: 17, color: C.muted, lineSpacing: 1.08 });
    const actions = [
      ['01', 'Запустить уровень', 'Выбрать базовый, продвинутый или экспертный маршрут из готового банка.'],
      ['02', 'Отправить ответ', 'Проверить вопрос и сразу получить балл, объяснение и разбор вариантов.'],
      ['03', 'Вернуться к ошибкам', 'Открыть историю попыток и повторить то, что ещё не стало навыком.'],
    ];
    const actionYs = [310, 398, 486];
    for (let i = 0; i < actions.length; i++) {
      const [num, head, body] = actions[i];
      text(slide, num, 724, actionYs[i], 56, 26, { size: 15, color: C.purple, bold: true, typeface: DISPLAY_FONT });
      text(slide, head, 796, actionYs[i] - 2, 300, 28, { size: 20, color: C.ink, bold: true, typeface: DISPLAY_FONT });
      text(slide, body, 796, actionYs[i] + 34, 300, 44, { size: 15, color: C.muted, lineSpacing: 1.08 });
      if (i < actions.length - 1) shape(slide, 'line', 796, actionYs[i] + 78, 300, 1, '#D9D4E0', '#D9D4E0');
    }
    shape(slide, 'roundRect', 72, 592, 1050, 34, C.purpleSoft, 'none');
    text(slide, 'Граница проекта: авторский учебный банк помогает тренироваться, но не копирует официальный экзамен и не обещает проходной балл.', 90, 600, 1014, 20, { size: 15, color: C.purple, bold: true, align: 'center' });
    footer(slide, 2);
    note(slide, [
      'Источники: README.md, раздел «Что это»; docs/SOURCE_REVIEW.md, раздел 1.',
      'Ограничение: все задания авторские, проект не является официальным банком Яндекса.',
    ]);
  }

  // 3. Levels
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.lilac;
    label(slide, 'Учебная лестница', 72, 48);
    title(slide, 'Три уровня по 60 вопросов', { width: 760 });
    text(slide, 'Каждый уровень покрывает все шесть доменов. Меняется сложность ситуации, а не объём банка.', 76, 160, 720, 34, { size: 20, color: C.muted });
    const cols = [
      { x: 72, fill: C.sageSoft, accent: C.sage, img: assets.level1, name: 'Базовый', kicker: 'Разобраться в понятиях', body: 'Основы ИИ, промптов и инструментов на простых рабочих ситуациях.' },
      { x: 442, fill: C.tealSoft, accent: C.teal, img: assets.level2, name: 'Продвинутый', kicker: 'Решать рабочие задачи', body: 'Выбор подхода, диагностика ошибок и сборка решений.' },
      { x: 812, fill: C.purpleSoft, accent: C.purple, img: assets.level3, name: 'Экспертный', kicker: 'Учитывать всю картину', body: 'Несколько условий: качество, доступы, стоимость и последствия.' },
    ];
    for (const c of cols) {
      shape(slide, 'roundRect', c.x, 240, 330, 338, c.fill, 'none');
      await addImage(slide, c.img, c.x + 95, 252, 140, 140, `${c.name}: абстрактная иллюстрация уровня`, 'contain', 'ellipse');
      text(slide, c.name, c.x + 26, 408, 276, 30, { size: 24, bold: true, color: c.accent, align: 'center', typeface: DISPLAY_FONT });
      text(slide, c.kicker, c.x + 26, 446, 276, 25, { size: 15, color: c.accent, bold: true, align: 'center', typeface: DISPLAY_FONT });
      text(slide, c.body, c.x + 34, 490, 262, 62, { size: 16, color: C.ink, align: 'center', lineSpacing: 1.08 });
    }
    text(slide, '10 вопросов × 6 доменов = 60 вопросов на уровень', 76, 612, 650, 28, { size: 20, color: C.ink, bold: true, typeface: DISPLAY_FONT });
    footer(slide, 3);
    note(slide, [
      'Источник: src/data/meta.js, массив LEVELS; docs/CONTENT_CONTRACT.md.',
      'Изображения: public/images/artwork/level-1-foundations-512-optimized.webp, level-2-application-512-optimized.webp, level-3-expert-512-optimized.webp.',
    ]);
  }

  // 4. Domains and weights
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.paper;
    label(slide, 'Покрытие программы', 72, 48);
    title(slide, 'Шесть доменов. Равный банк, официальный вес', { width: 930, size: 40 });
    text(slide, 'Внутри тренажёра каждый домен даёт 30 заданий: по 10 на каждом уровне. Проценты ниже относятся к программе экзамена.', 76, 154, 920, 42, { size: 18, color: C.muted });
    const table = slide.tables.add({
      rows: 7,
      columns: 4,
      left: 72,
      top: 238,
      width: 1050,
      height: 330,
      columnWidths: [500, 180, 180, 190],
      values: [
        ['Домен', 'Доля программы', 'На уровень', 'Всего'],
        ['Основы ИИ и генеративного ИИ', '~14%', '10', '30'],
        ['Практическое применение в работе', '~18%', '10', '30'],
        ['Ответственный ИИ', '~12%', '10', '30'],
        ['Внедрение и ценность для бизнеса', '~16%', '10', '30'],
        ['ИИ-агенты и инструменты агентской платформы', '~12%', '10', '30'],
        ['Алиса AI Про для бизнеса', '~28%', '10', '30'],
      ],
    });
    table.styleOptions = { headerRow: true, bandedRows: true };
    table.borders.assign({ style: 'solid', fill: '#D9D4E0', width: 1 });
    for (let c = 0; c < 4; c++) {
      table.getCell(0, c).fill = C.purple;
      table.getCell(0, c).text.style = { typeface: DISPLAY_FONT, fontSize: 16, color: C.white, bold: true, alignment: c === 0 ? 'left' : 'center', verticalAlignment: 'middle' };
    }
    for (let r = 1; r < 7; r++) {
      for (let c = 0; c < 4; c++) table.getCell(r, c).text.style = { typeface: BODY_FONT, fontSize: 15, color: C.ink, alignment: c === 0 ? 'left' : 'center', verticalAlignment: 'middle' };
    }
    shape(slide, 'roundRect', 72, 598, 1050, 48, C.purpleSoft, 'none');
    text(slide, 'Учебная честность: равное число заданий помогает сравнивать уровни, а официальный вес остаётся видимым контекстом.', 94, 611, 1000, 24, { size: 16, color: C.purple, bold: true, align: 'center' });
    footer(slide, 4);
    note(slide, [
      'Источники: src/data/meta.js, массив DOMAINS; docs/SOURCE_REVIEW.md, раздел 1.',
      'Доли программы приблизительные и обозначены знаком «~». В банке 6 × 30 = 180 заданий; каждый домен получает по 10 заданий на уровень.',
    ]);
  }

  // 5. Answer cycle
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.dark;
    label(slide, 'Один вопрос', 72, 48, 400, '#C5A8F2');
    title(slide, 'Ответ превращается в следующий шаг', { width: 820, color: C.white });
    text(slide, 'Интерфейс фиксирует ответ, показывает разбор и позволяет вернуться к ошибкам через отдельный режим.', 76, 160, 770, 34, { size: 20, color: '#B9B0C5' });
    const steps = [
      ['01', 'Выбрать', 'Один ответ, несколько вариантов или пары'],
      ['02', 'Проверить', 'Отправить и получить 1 или 0'],
      ['03', 'Понять', 'Прочитать объяснение и памятку'],
      ['04', 'Повторить', 'Открыть режим «Ошибки»'],
    ];
    const xs = [72, 352, 632, 912];
    for (let i = 0; i < steps.length; i++) {
      const [num, head, body] = steps[i];
      addDot(slide, xs[i], 292, 62, i === 2 ? C.purple : i === 1 ? C.teal : i === 3 ? C.sage : '#3B304D');
      text(slide, num, xs[i], 312, 62, 22, { size: 16, color: C.white, bold: true, align: 'center' });
      text(slide, head, xs[i], 392, 210, 28, { size: 24, color: C.white, bold: true, typeface: DISPLAY_FONT });
      text(slide, body, xs[i], 438, 210, 60, { size: 17, color: '#B9B0C5', lineSpacing: 1.1 });
      if (i < 3) {
        shape(slide, 'line', xs[i] + 70, 323, 185, 2, '#494152', '#494152');
        addDot(slide, xs[i] + 255, 317, 12, '#494152');
      }
    }
    shape(slide, 'roundRect', 72, 572, 1050, 54, '#302B3A', 'none');
    text(slide, 'Разбор входит в учебный результат: вопрос хранит объяснения вариантов и источник.', 96, 589, 1000, 24, { size: 17, color: '#F2EDF8', bold: true, align: 'center' });
    footer(slide, 5, true);
    note(slide, [
      'Источники: src/core/exam.js (evaluate, submitAnswer, scoreAttempt); src/components/questions.js; docs/CONTENT_CONTRACT.md.',
      'Неверный ответ не получает частичный балл. Режим «Ошибки» строится из сохранённых результатов.',
    ]);
  }

  // 6. Score
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.paper;
    label(slide, 'Как читать результат', 72, 48);
    title(slide, '47 из 60: результат 78,3%', { width: 720, size: 44 });
    text(slide, 'Для тренировки приложение держит ориентир 80%. Это учебная цель, а не официальный проходной балл экзамена.', 76, 168, 760, 62, { size: 22, color: C.muted, lineSpacing: 1.1 });
    shape(slide, 'roundRect', 72, 290, 470, 230, C.purpleSoft, 'none');
    text(slide, '78,3%', 106, 328, 400, 96, { size: 72, bold: true, color: C.purple, align: 'center', typeface: DISPLAY_FONT });
    text(slide, '47 правильных ответов\nиз 60 вопросов', 106, 432, 400, 58, { size: 20, color: C.ink, bold: true, align: 'center', typeface: DISPLAY_FONT, lineSpacing: 1.06 });
    shape(slide, 'roundRect', 610, 290, 512, 230, C.lilac, 'none');
    text(slide, 'Что ещё видно', 646, 326, 400, 28, { size: 24, bold: true, color: C.ink, typeface: DISPLAY_FONT });
    text(slide, '• сколько вопросов отвечено\n• где ошибки по шести доменам\n• какие объяснения стоит повторить', 646, 382, 420, 96, { size: 19, color: C.ink, lineSpacing: 1.18 });
    text(slide, 'Счёт пересчитывается из ответов. Импортированный JSON не может подменить результат отдельным полем.', 76, 590, 920, 30, { size: 18, color: C.purple, bold: true });
    footer(slide, 6);
    note(slide, [
      'Источники: src/core/exam.js (scoreAttempt); src/data/meta.js (TRAINING_TARGET = 80); docs/SOURCE_REVIEW.md.',
      'Пример 47/60 = 78,3% показывает арифметику; он не относится к конкретному ученику.',
    ]);
  }

  // 7. Storage and portability
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.lilac;
    label(slide, 'Данные ученика', 72, 48);
    title(slide, 'Прогресс живёт рядом с приложением', { width: 840, size: 41 });
    text(slide, 'Тренажёр хранит попытки в localStorage, а резервную копию можно скачать и импортировать в совместимом браузере.', 76, 164, 820, 54, { size: 21, color: C.muted, lineSpacing: 1.1 });
    shape(slide, 'roundRect', 72, 294, 322, 220, C.white, '#D9D4E0');
    text(slide, 'Локально', 104, 330, 250, 30, { size: 24, bold: true, color: C.purple, typeface: DISPLAY_FONT });
    text(slide, 'Попытки, черновики, закладки и история сохраняются в браузере.', 104, 384, 248, 72, { size: 18, color: C.ink, lineSpacing: 1.08 });
    shape(slide, 'roundRect', 478, 294, 322, 220, C.white, '#D9D4E0');
    text(slide, 'Переносимо', 510, 330, 250, 30, { size: 24, bold: true, color: C.teal, typeface: DISPLAY_FONT });
    text(slide, 'JSON-резервная копия переносит историю между устройствами.', 510, 384, 248, 72, { size: 18, color: C.ink, lineSpacing: 1.08 });
    shape(slide, 'roundRect', 884, 294, 238, 220, C.white, '#D9D4E0');
    text(slide, 'Граница', 916, 330, 180, 30, { size: 24, bold: true, color: C.sage, typeface: DISPLAY_FONT });
    text(slide, 'Другой банк вопросов делает старые сохранения несовместимыми.', 916, 384, 176, 90, { size: 18, color: C.ink, lineSpacing: 1.08 });
    text(slide, 'Если браузер запрещает storage, сессия остаётся только в открытой вкладке.', 76, 590, 900, 30, { size: 18, color: C.ink, bold: true });
    footer(slide, 7);
    note(slide, [
      'Источники: src/core/storage.js (storageKey, readState, writeState, import/export validation); README.md, раздел «Сохранение прогресса».',
      'Ограничение: localStorage зависит от настроек браузера и origin. Несовместимая версия банка защищается без автоматической миграции.',
    ]);
  }

  // 8. Architecture and launch
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.dark;
    label(slide, 'Для автора и контрибьютора', 72, 48, 500, '#C5A8F2');
    title(slide, 'Статический стек, короткий путь до запуска', { width: 920, color: C.white, size: 40 });
    text(slide, 'Preact + htm + Vite собирают браузерное приложение из JavaScript, CSS, JSON-банка и локальных ресурсов.', 76, 160, 840, 50, { size: 20, color: '#B9B0C5', lineSpacing: 1.1 });
    // Editable architecture diagram
    const nodes = [
      { x: 72, fill: '#343C27', ink: '#D3E38C', h: 'src/data', b: '180 вопросов\nи метаданные' },
      { x: 340, fill: '#273F40', ink: '#93D7D0', h: 'src/core', b: 'экзамен · счёт\n· хранение' },
      { x: 608, fill: '#3B304D', ink: '#C5A8F2', h: 'src/components', b: 'экраны и\nвзаимодействия' },
      { x: 876, fill: '#302B3A', ink: '#F2EDF8', h: 'Vite → dist', b: 'статическая\nпубликация' },
    ];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      shape(slide, 'roundRect', n.x, 286, 220, 136, n.fill, 'none');
      text(slide, n.h, n.x + 20, 312, 180, 28, { size: n.h === 'src/components' ? 16 : 20, color: n.ink, bold: true, align: 'center', typeface: DISPLAY_FONT });
      text(slide, n.b, n.x + 20, 356, 180, 48, { size: 16, color: '#F2EDF8', align: 'center', lineSpacing: 1.08 });
      if (i < nodes.length - 1) {
        shape(slide, 'line', n.x + 224, 354, 44, 2, '#494152', '#494152');
        addDot(slide, n.x + 255, 348, 12, '#494152');
      }
    }
    shape(slide, 'roundRect', 72, 492, 510, 90, '#24212D', 'none');
    text(slide, 'npm ci\nnpm run dev', 98, 512, 180, 50, { size: 22, color: '#D3E38C', bold: true, typeface: DISPLAY_FONT });
    text(slide, 'локальный запуск', 304, 526, 220, 22, { size: 18, color: '#B9B0C5' });
    shape(slide, 'roundRect', 612, 492, 510, 90, '#24212D', 'none');
    text(slide, 'npm run check', 638, 516, 240, 30, { size: 22, color: '#C5A8F2', bold: true, typeface: DISPLAY_FONT });
    text(slide, 'линты · банк · тесты · build', 638, 552, 360, 22, { size: 18, color: '#B9B0C5' });
    text(slide, 'Сообщайте об ошибках и предлагайте изменения через GitHub Issues. Порядок участия описан в CONTRIBUTING.md.', 76, 626, 980, 24, { size: 16, color: '#F2EDF8' });
    footer(slide, 8, true);
    note(slide, [
      'Источники: package.json; README.md, разделы «Сборка и другие команды» и «Устройство проекта»; src/main.js; src/components; src/core.',
      'Команды: npm ci, npm run dev, npm run check. Публикация выполняется GitHub Actions из .github/workflows/pages.yml.',
    ]);
  }

  const pngDir = path.join(fallbackDir, 'slides');
  await fs.mkdir(pngDir, { recursive: true });
  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, '0')}`;
    const png = await presentation.export({ slide, format: 'png', scale: 1 });
    await fs.writeFile(path.join(pngDir, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  }
  const montage = await presentation.export({ format: 'png', montage: true });
  await fs.writeFile(path.join(fallbackDir, 'presentation-preview.png'), new Uint8Array(await montage.arrayBuffer()));
  const pdf = await presentation.export({ format: 'pdf' });
  await fs.writeFile(path.join(fallbackDir, 'presentation.pdf'), new Uint8Array(await pdf.arrayBuffer()));

  const candidatePath = path.join(stagingDir, 'candidate.pptx');
  const pptx = await PresentationFile.exportPptx(presentation);
  await pptx.save(candidatePath);
  const finalPath = path.join(await fs.mkdtemp(path.join(buildDir, 'native-')), 'presentation.pptx');
  const result = await finalizePresentation({
    explicitTotalSlideCount: 8,
    requiredNativeTableOwnerSlides: [4],
    requiredNativeChartOwnerSlides: [],
    workspaceDir,
    candidatePath,
    finalPath,
    pythonExecutable,
    integrityValidatorPath: path.join(presentationSkillDir, 'container_tools/inspect_presentation_package_integrity.py'),
    layoutValidatorPath: path.join(presentationSkillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
    layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit', '--require-native-table-slide', '4'],
    fontPolicy: { basis: 'design', families: [DISPLAY_FONT, BODY_FONT] },
    verifyArtifactToolImport: true,
    receiptPath: path.join(stagingDir, 'presentation.validation.json'),
  });
  await fs.copyFile(finalPath, pptxOutput);
  await fs.writeFile(path.join(buildDir, 'presentation-validation.json'), JSON.stringify(result, null, 2));
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
