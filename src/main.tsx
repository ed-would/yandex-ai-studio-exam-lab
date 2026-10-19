import { Component, render } from 'preact';
import type { ComponentType } from 'preact';
import { App } from './app.tsx';
import { h, Fragment } from './components/ui.tsx';
import { questions } from './data/bank.ts';
import type { Question } from './types.ts';
import './styles.css';
import './theme.css';
import './components/progress-bar.css';

void Fragment;

type AccordionAnimation = { timer: number; onEnd: (event: TransitionEvent) => void };
const accordionAnimations = new WeakMap<HTMLDetailsElement, AccordionAnimation>();
document.addEventListener('click', (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;
  const summary = event.target.closest('summary');
  const accordion = summary?.parentElement;
  if (!(accordion instanceof HTMLDetailsElement) || !accordion.matches('details.accordion')) return;
  const panel = accordion.querySelector<HTMLElement>(':scope > .details-content');
  if (!panel) return;

  event.preventDefault();
  const opening = !accordion.open || accordion.hasAttribute('data-closing');
  const currentHeight = panel.getBoundingClientRect().height;
  const previous = accordionAnimations.get(accordion);
  if (previous) {
    window.clearTimeout(previous.timer);
    panel.removeEventListener('transitionend', previous.onEnd);
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    accordion.open = opening;
    accordion.removeAttribute('data-closing');
    panel.style.height = '';
    accordionAnimations.delete(accordion);
    return;
  }

  if (opening) {
    accordion.open = true;
    accordion.removeAttribute('data-closing');
  } else accordion.setAttribute('data-closing', '');

  panel.style.height = `${currentHeight}px`;
  void panel.offsetHeight;
  const targetHeight = opening ? panel.scrollHeight : 0;
  const finish = () => {
    if (!accordion.isConnected) return;
    panel.removeEventListener('transitionend', onEnd);
    window.clearTimeout(timer);
    if (!opening) {
      accordion.open = false;
      accordion.removeAttribute('data-closing');
    }
    panel.style.height = '';
    accordionAnimations.delete(accordion);
  };
  const onEnd = (transitionEvent: TransitionEvent) => {
    if (transitionEvent.target === panel && transitionEvent.propertyName === 'height') finish();
  };
  panel.addEventListener('transitionend', onEnd);
  panel.style.height = `${targetHeight}px`;
  const timer = window.setTimeout(finish, 320);
  accordionAnimations.set(accordion, { timer, onEnd });
});

class ErrorBoundary extends Component<{ children?: import('preact').ComponentChildren }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError(): { error: boolean } {
    return { error: true };
  }
  render() {
    if (this.state.error)
      return (
        <>
          <main class="page">
            <div class="empty-state">
              <h1>Не удалось показать страницу</h1>
              <p>Обнови страницу. Сохранённые результаты остаются в браузере.</p>
              <button class="button primary" onClick={() => window.location.reload()}>
                Обновить страницу
              </button>
            </div>
          </main>
        </>
      );
    return this.props.children;
  }
}

const mount = (Root: ComponentType<{ questions: Question[] }>) =>
  render(
    <>
      <ErrorBoundary>
        <Root questions={questions} />
      </ErrorBoundary>
    </>,
    document.getElementById('app')!,
  );

if (import.meta.env.DEV && import.meta.env.MODE === 'results-preview') {
  Promise.all([import('./dev/results-preview.tsx'), import('./dev/results-preview.css')]).then(([preview]) => {
    preview.preparePreviewRoute();
    mount(preview.ResultsPreview);
  });
} else mount(App);
