import { h } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import htm from 'htm';

export const html = htm.bind(h);
const PATHS = {
  arrow: ['M4 12h15', 'm13 6 6 6-6 6'], back: ['M20 12H5', 'm11 6-6 6 6 6'],
  check: ['m5 12 4 4L19 6'], close: ['m6 6 12 12', 'M18 6 6 18'],
  chevron: ['m6 9 6 6 6-6'], external: ['M14 4h6v6', 'm20 4-9 9', 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5'],
  bookmark: ['M6 4h12v17l-6-4-6 4z'], clock: ['M12 8v5l3 2', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6.1 6.1A8 8 0 0 1 20 12', 'M17.9 17.9A8 8 0 0 1 4 12'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v5h16v-5'], upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 17v4h16v-4'],
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
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'], flag: ['M5 21V3', 'M5 4c5-4 9 4 15 0v10c-6 4-10-4-15 0'],
  device: ['M3 4h18v13H3z', 'M8 21h8', 'M12 17v4'], search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'm15 15 6 6'],
};

export function Icon({ name = 'spark', size = 20, className = '' }) {
  return html`<svg class=${`icon ${className}`} width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(PATHS[name] || PATHS.spark).map((d) => html`<path d=${d} />`)}</svg>`;
}

export function Wordmark() {
  return html`<span class="wordmark"><span class="brand-symbol"><${Icon} name="spark" size=${27} /></span><span>Практикум<span class="wordmark-ai">ИИ</span></span></span>`;
}

export function Art({ variant = 1, hero = false }) {
  const uid = useId().replaceAll(':', '');
  const palettes = { 1: ['#c9f19c', '#517867', '#004d59'], 2: ['#ffe0d6', '#db8a67', '#783f31'], 3: ['#efd3fb', '#ab89df', '#51317b'] };
  const [light, mid, dark] = palettes[variant] || palettes[1];
  const rings = Array.from({ length: variant === 1 ? 12 : variant === 2 ? 9 : 16 }, (_, i) => i);
  return html`<svg class=${`generative-art art-${variant} ${hero ? 'art-hero' : ''}`} viewBox="0 0 480 330" aria-hidden="true">
    <defs><linearGradient id=${`petal-${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color=${light} /><stop offset=".65" stop-color=${mid} /><stop offset="1" stop-color=${dark} /></linearGradient><radialGradient id=${`core-${uid}`} cx=".3" cy=".25"><stop offset="0" stop-color=${mid} /><stop offset="1" stop-color=${dark} /></radialGradient></defs>
    <g class="art-grid" stroke=${dark} stroke-width=".6" opacity=".17"><path d="M20 60h440M20 165h440M20 270h440M80 20v290M240 20v290M400 20v290"/><circle cx="240" cy="165" r="142" fill="none" stroke-dasharray="2 7"/></g>
    <g class="art-object">
      ${variant === 1 && html`<g>${rings.map((i) => html`<ellipse cx="270" cy="155" rx="90" ry="42" transform=${`rotate(${i * 30} 240 165)`} fill=${`url(#petal-${uid})`} stroke=${dark} stroke-width=".65" opacity=".92"/>`)}<circle cx="240" cy="165" r="30" fill=${`url(#core-${uid})`}/><circle cx="233" cy="156" r="4" fill=${light} opacity=".8"/></g>`}
      ${variant === 2 && html`<g transform="rotate(-24 240 165)">${rings.map((i) => html`<rect x=${142 + i * 7} y=${65 + i * 7} width=${195 - i * 14} height=${195 - i * 14} rx=${65 - i * 4} fill="none" stroke=${i % 2 ? dark : mid} stroke-width="12"/>`)}<circle cx="336" cy="75" r="29" fill=${`url(#core-${uid})`}/><circle cx="155" cy="243" r="16" fill=${dark}/></g>`}
      ${variant === 3 && html`<g>${rings.map((i) => html`<ellipse cx="240" cy="165" rx="115" ry="43" transform=${`rotate(${i * 11.25} 240 165)`} fill="none" stroke=${i % 3 === 0 ? dark : mid} stroke-width=${i % 3 === 0 ? 2 : 1.2}/>`)}<path d="m240 91 63 37v74l-63 37-63-37v-74z" fill=${`url(#core-${uid})`} stroke=${light}/><path d="m177 128 63 37 63-37m-63 37v74m0-74V91" fill="none" stroke=${light} opacity=".6"/><circle cx="341" cy="74" r="9" fill=${dark}/></g>`}
    </g>
    <g fill=${dark} opacity=".6"><circle cx="80" cy="60" r="3"/><circle cx="400" cy="270" r="3"/><path d="M394 54h12m-6-6v12M74 264h12m-6-6v12" stroke=${dark}/></g>
  </svg>`;
}

export function ProgressBar({ value, max = 100, label = '', className = '' }) {
  const percent = Math.max(0, Math.min(100, max ? value / max * 100 : 0));
  return html`<div class=${`progress-track ${className}`} role="progressbar" aria-label=${label} aria-valuemin="0" aria-valuemax=${max} aria-valuenow=${value}><span style=${{ width: `${percent}%` }} /></div>`;
}

export const formatPercent = (value) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
export const formatDate = (value) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const plural = (n, forms = ['вопрос', 'вопроса', 'вопросов']) => `${n} ${forms[n % 100 >= 11 && n % 100 <= 19 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;

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
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = [...(ref.current?.querySelectorAll('button:not(:disabled), a, input, select, [tabindex="0"]') || [])];
        if (!nodes.length) return;
        const firstNode = nodes[0], lastNode = nodes.at(-1);
        if (event.shiftKey && document.activeElement === firstNode) { event.preventDefault(); lastNode.focus(); }
        else if (!event.shiftKey && document.activeElement === lastNode) { event.preventDefault(); firstNode.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = oldOverflow; previous?.focus?.(); };
  }, []);
  return html`<div class="modal-backdrop" onClick=${(event) => { if (event.target === event.currentTarget) onClose(); }}><section class="modal" role="dialog" aria-modal="true" aria-labelledby=${id} ref=${ref}><div class="modal-symbol"><${Icon} name=${dangerous ? 'trash' : 'info'} size=${28}/></div><h2 id=${id}>${title}</h2><div class="modal-copy">${children}</div><div class="modal-actions"><button class="button secondary" onClick=${onClose}>Отмена</button><button class=${`button ${dangerous ? 'danger' : 'primary'}`} onClick=${onConfirm}>${confirmText}</button></div></section></div>`;
}

export function EmptyState({ icon = 'book', title, children }) {
  return html`<div class="empty-state"><span class="empty-symbol"><${Icon} name=${icon} size=${30}/></span><h3>${title}</h3><div>${children}</div></div>`;
}

export function downloadFile(name, content, type = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
