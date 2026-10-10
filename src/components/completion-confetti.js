import { useEffect, useState } from 'preact/hooks';
import { html } from './ui.js';

const COLORS = [
  'var(--ui-accent)',
  'var(--ui-action-bg)',
  'var(--ui-accent-soft)',
  'var(--ui-accent-strong)',
  'var(--muted)',
  'var(--ink)',
];

export function CompletionConfetti({ enabled, onConsumed, vivid = false }) {
  const [play] = useState(enabled);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!play) return;
    onConsumed();
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motion?.matches) return;
    setVisible(true);
    const stop = () => setVisible(false);
    const timer = window.setTimeout(stop, 3800);
    const onMotion = (event) => {
      if (event.matches) stop();
    };
    motion?.addEventListener?.('change', onMotion);
    return () => {
      window.clearTimeout(timer);
      motion?.removeEventListener?.('change', onMotion);
    };
  }, [play, onConsumed]);
  if (!visible) return null;
  return html`<div class="completion-confetti" aria-hidden="true">${Array.from({ length: vivid ? 100 : 64 }, (_, i) => {
    const direction = i % 2 ? -1 : 1;
    const distance = 20 + ((i * 37) % 65);
    return html`<i class=${i % 2 ? 'from-right' : 'from-left'} key=${i} style=${{
      '--burst-middle-x': `${direction * distance * 0.58}vw`,
      '--burst-end-x': `${direction * distance}vw`,
      '--burst-peak': `${-25 - ((i * 19) % 40)}vh`,
      '--burst-fall': `${40 + ((i * 13) % 30)}vh`,
      '--burst-turn': `${direction * (360 + ((i * 31) % 720))}deg`,
      '--burst-delay': `${(i * 17) % 220}ms`,
      '--burst-color': COLORS[i % COLORS.length],
      '--burst-width': `${6 + (i % 5)}px`,
      '--burst-height': `${8 + (i % 7)}px`,
      borderRadius: i % 4 === 0 ? '50%' : '1px',
    }}/>`;
  })}</div>`;
}
