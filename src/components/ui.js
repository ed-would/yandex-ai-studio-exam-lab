import { h } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import htm from 'htm';
import { APP_NAME, APP_TAGLINE } from '../data/meta.js';

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
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6.1 6.1A8 8 0 0 1 20 12', 'M17.9 17.9A8 8 0 0 1 4 12'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 17v4h16v-4'],
  trash: ['M3 6h18', 'M9 6V3h6v3', 'm5 6 1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
  info: ['M12 11v6', 'M12 7v.1', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  spark: ['M12 3v18', 'M3 12h18', 'm5.6 5.6 12.8 12.8', 'M18.4 5.6 5.6 18.4'],
  sliders: ['M4 7h16', 'M4 17h16', 'M8 4v6', 'M16 14v6'],
  shield: ['m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z', 'm8 12 3 3 5-6'],
  chart: ['M4 3v18h17', 'M8 16v-4', 'M13 16V8', 'M18 16V5'],
  nodes: ['M4 4h6v6H4z', 'M14 14h6v6h-6z', 'M14 4h6v6h-6z', 'M7 10v7h7', 'M10 7h4'],
  layers: ['m12 3 10 5-10 5L2 8z', 'm2 12 10 5 10-5', 'm2 16 10 5 10-5'],
  book: ['M12 5v16', 'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1z'],
  link: ['m10 14 4-4', 'M9 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0', 'M15 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  flag: ['M5 21V3', 'M5 4c5-4 9 4 15 0v10c-6 4-10-4-15 0'],
  device: ['M3 4h18v13H3z', 'M8 21h8', 'M12 17v4'],
  search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'm15 15 6 6'],
};

export function Icon({ name = 'spark', size = 20, className = '' }) {
  return html`<svg class=${`icon ${className}`} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(PATHS[name] || PATHS.spark).map((d) => html`<path d=${d} />`)}</svg>`;
}

export function Wordmark() {
  return html`<span class="wordmark"><span class="brand-symbol"><img src=${assetUrl('brand/trainer-abstract.png')} alt="" width="256" height="256"/></span><span class="wordmark-text"><span>${APP_NAME}</span><small class="wordmark-tagline">${APP_TAGLINE}</small></span></span>`;
}

const assetUrl = (path) => `${import.meta.env?.BASE_URL || './'}images/${path}`;

export function PlatformMark() {
  return html`<span class="platform-mark"><img src=${assetUrl('brand/ai-studio-white.svg')} alt="Yandex AI Studio" width="347" height="58"/></span>`;
}

export function Art({ variant = 1, hero = false, progress = false }) {
  const file = hero
    ? 'hero-ribbon-expanded.webp'
    : progress
      ? `progress/level-${variant}-${['foundations', 'application', 'expert'][variant - 1] || 'foundations'}.png`
      : `${['foundations', 'applied', 'systems'][variant - 1] || 'foundations'}.jpg`;
  return html`<img class=${`generative-art art-${variant} ${hero ? 'art-hero' : ''} ${progress ? 'art-progress' : ''}`} src=${assetUrl(`generated/${file}`)} alt="" width=${progress ? 1254 : 1536} height=${progress ? 1254 : 1024} loading=${hero ? 'eager' : 'lazy'} decoding="async" fetchpriority=${hero ? 'high' : 'auto'}/>`;
}

export function SectionBackdrop({ name, level, format = 'jpg' }) {
  const file =
    name || ['level-1-triangles', 'level-2-woven-orbits', 'level-3-prisms'][level - 1] || 'level-1-triangles';
  return html`<img class="section-backdrop" src=${assetUrl(`generated/backgrounds/geometry/${file}.${format}`)} alt="" aria-hidden="true" width="1536" height="1024" loading="lazy" decoding="async"/>`;
}

export function ProgressBar({ value, max = 100, label = '', className = '' }) {
  const percent = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return html`<div class=${`progress-track ${className}`} role="progressbar" aria-label=${label} aria-valuemin="0" aria-valuemax=${max} aria-valuenow=${value}><span style=${{ width: `${percent}%` }} /></div>`;
}

export const formatPercent = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
export const formatDate = (value) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
export const plural = (n, forms = ['вопрос', 'вопроса', 'вопросов']) =>
  `${n} ${forms[n % 100 >= 11 && n % 100 <= 19 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;

export function SourceLinks({ sources = [], compact = false }) {
  const unique = [...new Map(sources.filter((s) => /^https:\/\//.test(s.url)).map((s) => [s.url, s])).values()];
  return html`<div class=${`source-links ${compact ? 'compact' : ''}`}>${unique.map((source) => html`<a href=${source.url} target="_blank" rel="noopener noreferrer">${source.title}<${Icon} name="external" size=${14}/><span class="sr-only"> (откроется в новой вкладке)</span></a>`)}</div>`;
}

export function Modal({ title, children, confirmText = 'Подтвердить', onConfirm, onClose, dangerous = false }) {
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
  }}><section class="modal" role="dialog" aria-modal="true" aria-labelledby=${id} ref=${ref}><div class="modal-symbol"><${Icon} name=${dangerous ? 'trash' : 'info'} size=${28}/></div><h2 id=${id}>${title}</h2><div class="modal-copy">${children}</div><div class="modal-actions"><button class="button secondary" onClick=${onClose}>Отмена</button><button class=${`button ${dangerous ? 'danger' : 'primary'}`} onClick=${onConfirm}>${confirmText}</button></div></section></div>`;
}

export function EmptyState({ icon = 'book', title, children }) {
  return html`<div class="empty-state"><span class="empty-symbol"><${Icon} name=${icon} size=${30}/></span><h3>${title}</h3><div>${children}</div></div>`;
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
