import { html } from './ui.js';

export function ProgressBar({ value, max = 100, label = '' }) {
  const percent = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
  return html`<div class="progress-track" role="progressbar" aria-label=${label} aria-valuemin="0" aria-valuemax=${max} aria-valuenow=${value}><span style=${{ width: `${percent}%` }} /></div>`;
}
