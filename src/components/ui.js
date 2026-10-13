import { h } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import htm from 'htm';
import { APP_NAME, APP_TAGLINE } from '../data/meta.js';
import { useTheme } from '../core/theme.js';
import imageVariants from '../data/image-variants.json' with { type: 'json' };

export const html = htm.bind(h);
const PATHS = {
  arrow: ['M4 12h15', 'm13 6 6 6-6 6'],
  back: ['M20 12H5', 'm11 6-6 6 6 6'],
  check: ['m5 12 4 4L19 6'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  chevron: ['m6 9 6 6 6-6'],
  external: ['M14 4h6v6', 'm20 4-9 9', 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5'],
  bookmark: ['M6 4h12v17l-6-4-6 4z'],
  clock: ['M12 8v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2'],
  refresh: ['M3 12a9 9 0 1 0 9-9c-2.52 0-4.93 1-6.74 2.74L3 8', 'M3 3v5h5'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 17v4h16v-4'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'm5 6 1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
  info: ['M12 11v6', 'M12 7v.1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  spark: ['M12 3v18', 'M3 12h18', 'm5.6 5.6 12.8 12.8', 'M18.4 5.6 5.6 18.4'],
  sliders: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
  shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z', 'm8 12 3 3 5-6'],
  rosette: [
    'M12 1.1 13.5 1.95 15.21 1.74 16.28 3.1 17.94 3.56 18.4 5.22 19.76 6.29 19.55 8 20.4 9.5 19.55 11 19.76 12.71 18.4 13.78 17.94 15.44 16.28 15.9 15.21 17.26 13.5 17.05 12 17.9 10.5 17.05 8.79 17.26 7.72 15.9 6.06 15.44 5.6 13.78 4.24 12.71 4.45 11 3.6 9.5 4.45 8 4.24 6.29 5.6 5.22 6.06 3.56 7.72 3.1 8.79 1.74 10.5 1.95z',
    'm12 5.8 1.1 2.2 2.45.36-1.77 1.73.42 2.44L12 11.38l-2.2 1.15.42-2.44-1.77-1.73 2.45-.36z',
    'm8.1 16.3-1.15 5.5L12 19.5',
    'm15.9 16.3 1.15 5.5L12 19.5',
  ],
  chart: ['M4 3v18h17', 'M8 16v-4', 'M13 16V8', 'M18 16V5'],
  nodes: ['M4 4h6v6H4z', 'M14 14h6v6h-6z', 'M14 4h6v6h-6z', 'M7 10v7h7', 'M10 7h4'],
  layers: ['m12 3 10 5-10 5L2 8z', 'm2 12 10 5 10-5', 'm2 16 10 5 10-5'],
  book: ['M12 5v16', 'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1z'],
  map: ['M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
  link: ['m10 14 4-4', 'M9 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0', 'M15 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  flag: ['M5 21V3', 'M5 4c5-4 9 4 15 0v10c-6 4-10-4-15 0'],
  seed: ['M12 21v-8', 'M12 15C5 15 3 10 3 4c6 0 9 3 9 9', 'M12 17c7 0 9-5 9-11-6 0-9 3-9 9'],
  device: ['M3 4h18v13H3z', 'M8 21h8', 'M12 17v4'],
  search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'm15 15 6 6'],
};

export function Icon({ name = 'spark', size = 20, className = '' }) {
  return html`<svg class=${`icon ${className}`} data-icon=${name} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(PATHS[name] || PATHS.spark).map((d) => html`<path d=${d} />`)}</svg>`;
}

export function TimerOption({ enabled = false, onChange }) {
  const id = useId();
  return html`<label class="timer-option" for=${id}><span class="timer-option-icon"><${Icon} name="clock" size=${24}/></span><span class="timer-option-copy"><strong>Таймер для новых попыток</strong><small>Включи перед стартом. 1:12 на вопрос, затем 0 баллов и следующий вопрос. У «Продолжить» режим не меняется.</small></span><input id=${id} type="checkbox" role="switch" checked=${enabled} onChange=${(event) => onChange(event.currentTarget.checked)}/><span class="timer-switch" aria-hidden="true"/></label>`;
}

export function Wordmark() {
  const [firstWord, ...remainingWords] = APP_NAME.split(' ');
  return html`<span class="wordmark"><span class="brand-symbol"><img src=${assetUrl('brand/trainer-abstract.png')} srcset=${responsiveSources('brand/trainer-abstract.png')} sizes="52px" alt="" width="256" height="256"/></span><span class="wordmark-text"><span class="wordmark-title"><span>${firstWord}</span>${' '}<span>${remainingWords.join(' ')}</span></span><small class="wordmark-tagline">${APP_TAGLINE}</small></span></span>`;
}

export function ThemeToggle() {
  const dark = useTheme() === 'dark';
  const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  return html`<button class="theme-toggle" type="button" data-theme-toggle aria-label=${label} aria-pressed=${dark} title=${label}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="theme-sun"><circle cx="12" cy="12" r="4"/><path class="theme-rays" d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></g><path class="theme-moon" d="M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z"/></svg></button>`;
}

const assetUrl = (path) =>
  `${import.meta.env?.BASE_URL || './'}images/${imageVariants[path]?.variants.at(-1)?.[1] || path}`;
const responsiveSources = (path) =>
  imageVariants[path]?.variants.map(([width, file]) => `${assetUrl(file)} ${width}w`).join(', ');

export function PlatformMark() {
  return html`<span class="platform-mark"><img src=${assetUrl('brand/ai-studio-white.svg')} alt="Yandex AI Studio" width="347" height="58"/></span>`;
}

export function Art({ variant = 1, hero = false, progress = false, compact = false }) {
  const dark = useTheme() === 'dark';
  const demoCard =
    import.meta.env?.DEV &&
    !hero &&
    !progress &&
    !compact &&
    new URLSearchParams(window.location.search).has('art-demo');
  const file = hero
    ? 'hero-ribbon-expanded.webp'
    : progress || compact
      ? `level-${variant}-${['foundations', 'application', 'expert'][variant - 1] || 'foundations'}.png`
      : `${['foundations', 'applied', 'systems'][variant - 1] || 'foundations'}.jpg`;
  const path = `artwork/${file}`;
  const night = demoCard
    ? `artwork/card-level-${variant}-dark-demo.png`
    : `artwork/${hero ? 'hero-night' : `level-${variant}`}.webp`;
  const useNightArt = dark && (hero || progress || demoCard);
  const size = hero
    ? '(max-width: 570px) calc(100vw - 32px), (max-width: 900px) 60vw, (max-width: 1296px) calc(61vw - 40px), 752px'
    : progress
      ? '120px'
      : compact
        ? '72px'
        : '(max-width: 570px) calc(100vw - 32px), (max-width: 900px) calc((100vw - 80px) / 2), 384px';
  const dimensions = imageVariants[path];
  return html`<picture class=${`generative-art art-${variant} ${hero ? 'art-hero' : ''} ${progress ? 'art-progress' : ''}`}>${useNightArt && html`<source media="all" srcset=${responsiveSources(night) || assetUrl(night)} sizes=${size}/>`}<img src=${assetUrl(path)} srcset=${responsiveSources(path)} sizes=${size} alt="" width=${dimensions?.width || 1536} height=${dimensions?.height || 1024} loading=${hero ? 'eager' : 'lazy'} decoding="async" fetchpriority=${hero ? 'high' : 'auto'}/></picture>`;
}

export function SectionBackdrop({ name, format = 'jpg', sizes }) {
  const dark = useTheme() === 'dark';
  const file = name;
  const night = {
    'studio-01-three-trajectories': 'levels-night.webp',
    'footer-orbital-sectors': 'footer-night.webp',
    'progress-light-facet-weave-v2': 'progress-night-facet-weave-v2.png',
    'study-phase-rosettes': 'study-night.webp',
    'practice-meander-light': 'practice-meander-dark.png',
    'history-lens-light': 'history-lens-dark.png',
    'stats-level-1-ribbon-wave-light': 'stats-level-1-ribbon-wave-dark.png',
    'stats-level-2-ribbon-wave-light': 'stats-level-2-ribbon-wave-dark.png',
    'stats-level-3-ribbon-wave-light': 'stats-level-3-ribbon-wave-dark.png',
    'banner-level-1-braid-light': 'banner-level-1-braid-dark.webp',
    'banner-level-1-folded-planes-light': 'banner-level-1-folded-planes-dark.webp',
    'banner-level-2-wave-fins-light': 'banner-level-2-wave-fins-dark.webp',
    'banner-level-3-faceted-prisms-light': 'banner-level-3-faceted-prisms-dark.webp',
    'banner-level-2-chevron-weave-light': 'banner-level-2-chevron-weave-dark.webp',
    'banner-level-3-gates-light': 'banner-level-3-gates-dark.webp',
    'result-level-1-mono-light': 'result-level-1-mono-dark.png',
    'result-level-2-mono-light': 'result-level-2-mono-dark.png',
    'result-level-3-mono-light': 'result-level-3-mono-dark.png',
  }[file];
  const path = `artwork/${file}.${format}`;
  const nightPath = night && `artwork/${night}`;
  const dimensions = imageVariants[path];
  const size =
    sizes ||
    (file === 'footer-orbital-sectors'
      ? '100vw'
      : file === 'practice-meander-light'
        ? '(max-width: 570px) calc(100vw - 32px), (max-width: 820px) calc(100vw - 44px), (max-width: 1296px) calc(50vw - 44px), 604px'
        : '(max-width: 700px) calc(100vw - 32px), (max-width: 1296px) calc(100vw - 64px), 1232px');
  return html`<picture class=${`section-backdrop ${night ? 'has-night-art' : ''}`} aria-hidden="true">${night && html`<source media=${dark ? 'all' : 'not all'} srcset=${responsiveSources(nightPath) || assetUrl(nightPath)} sizes=${size}/>`}<img src=${assetUrl(path)} srcset=${responsiveSources(path)} sizes=${size} alt="" width=${dimensions?.width || 1536} height=${dimensions?.height || 1024} loading="lazy" decoding="async"/></picture>`;
}

const percentFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
export const formatPercent = (value) => percentFormat.format(value);
export const formatDate = (value) => dateFormat.format(new Date(value));
export const plural = (n, forms = ['вопрос', 'вопроса', 'вопросов']) =>
  `${n} ${forms[n % 100 >= 11 && n % 100 <= 19 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;

export function SourceLinks({ sources = [], compact = false }) {
  const unique = [...new Map(sources.filter((s) => /^https:\/\//.test(s.url)).map((s) => [s.url, s])).values()];
  return html`<div class=${`source-links ${compact ? 'compact' : ''}`}>${unique.map((source) => html`<a href=${source.url} target="_blank" rel="noopener noreferrer">${source.title}<${Icon} name="external" size=${14}/><span class="sr-only"> (откроется в новой вкладке)</span></a>`)}</div>`;
}

export function Modal({ title, children, confirmText = 'Подтвердить', onConfirm, onClose, dangerous = false, level }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const first = ref.current?.querySelector('button');
    first?.focus();
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        const nodes = [
          ...(ref.current?.querySelectorAll('button:not(:disabled), a, input, select, [tabindex="0"]') || []),
        ];
        if (!nodes.length) return;
        const firstNode = nodes[0],
          lastNode = nodes.at(-1);
        if (event.shiftKey && document.activeElement === firstNode) {
          event.preventDefault();
          lastNode.focus();
        } else if (!event.shiftKey && document.activeElement === lastNode) {
          event.preventDefault();
          firstNode.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = oldOverflow;
      previous?.focus?.();
    };
  }, []);
  return html`<div class="modal-backdrop" onClick=${(event) => {
    if (event.target === event.currentTarget) onClose();
  }}><section class=${`modal${level ? ` theme-${level}` : ''}`} role="dialog" aria-modal="true" aria-labelledby=${id} ref=${ref}><div class="modal-heading"><div class="modal-symbol"><${Icon} name=${dangerous ? 'trash' : 'info'} size=${28}/></div><h2 id=${id}>${title}</h2></div><div class="modal-copy">${children}</div><div class="modal-actions"><button class="button secondary" onClick=${onClose}>Отмена</button><button class=${`button ${dangerous ? 'danger' : 'primary'}`} onClick=${onConfirm}>${confirmText}</button></div></section></div>`;
}

export function EmptyState({ icon = 'book', title, children, backdrop, className = '' }) {
  return html`<div class=${`empty-state ${className}`}>${backdrop}<div class="empty-state-heading"><span class="empty-symbol"><${Icon} name=${icon} size=${30}/></span><h3>${title}</h3></div><div>${children}</div></div>`;
}

export function downloadFile(name, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
