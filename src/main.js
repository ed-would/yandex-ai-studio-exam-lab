import { Component, render } from 'preact';
import { App } from './app.js';
import { html } from './components/ui.js';
import { questions } from './data/bank.js';
import './styles.css';

class ErrorBoundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) return html`<main class="page"><div class="empty-state"><h1>Не удалось показать страницу</h1><p>Обнови страницу. Сохранённые результаты остаются в браузере.</p><button class="button primary" onClick=${() => window.location.reload()}>Обновить страницу</button></div></main>`;
    return this.props.children;
  }
}

render(html`<${ErrorBoundary}><${App} questions=${questions}/></${ErrorBoundary}>`, document.getElementById('app'));
