import { useEffect, useRef, useState } from 'preact/hooks';
import type { Question, StorageLike } from '../types.ts';
import { App } from '../app.tsx';
import { h, Fragment, Icon } from '../components/ui.tsx';
import { SelectField } from '../components/select-field.tsx';
import { freshState } from '../core/storage.ts';
import { LEVELS } from '../data/meta.ts';
import { RESULT_SCENARIOS, createResultFixtures, previewAttemptId } from './results-fixtures.ts';

void Fragment;

type Selection = { level: string; scenario: string };
type ResultsPreviewProps = { questions: Question[] };

export const PREVIEW_STORAGE_KEY = 'trainer-results-preview';
const DEFAULT_SCENARIO = 'target80';

function selectionFromHash(): Selection | null {
  const id = window.location.hash.replace(/^#\/results\//, '');
  for (const level of LEVELS) {
    const scenario = RESULT_SCENARIOS.find((item) => previewAttemptId(level.id, item.id) === id);
    if (scenario) return { level: String(level.id), scenario: scenario.id };
  }
  return null;
}

export function preparePreviewRoute() {
  if (!selectionFromHash()) {
    window.history.replaceState(null, '', `#/results/${previewAttemptId(1, DEFAULT_SCENARIO)}`);
  }
}

export function createPreviewStorage(questions: Question[]): StorageLike {
  const data = new Map([
    [PREVIEW_STORAGE_KEY, JSON.stringify({ ...freshState(), history: createResultFixtures(questions) })],
  ]);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  };
}

export function ResultsPreview({ questions }: ResultsPreviewProps) {
  const [selection, setSelection] = useState<Selection>(
    () => selectionFromHash() || { level: '1', scenario: DEFAULT_SCENARIO },
  );
  const [generation, setGeneration] = useState(0);
  const storage = useRef<StorageLike | null>(null);
  if (!storage.current) storage.current = createPreviewStorage(questions);
  const scenarioIndex = RESULT_SCENARIOS.findIndex((item) => item.id === selection.scenario);
  const position = (Number(selection.level) - 1) * RESULT_SCENARIOS.length + scenarioIndex;
  const total = LEVELS.length * RESULT_SCENARIOS.length;

  useEffect(() => {
    const sync = () => {
      const next = selectionFromHash();
      if (next) setSelection(next);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  function show(next: Selection) {
    storage.current = createPreviewStorage(questions);
    window.location.hash = `#/results/${previewAttemptId(Number(next.level), next.scenario)}`;
    setSelection(next);
    setGeneration((value) => value + 1);
    window.scrollTo?.(0, 0);
  }
  function step(offset: number) {
    const next = (position + offset + total) % total;
    show({
      level: String(LEVELS[Math.floor(next / RESULT_SCENARIOS.length)].id),
      scenario: RESULT_SCENARIOS[next % RESULT_SCENARIOS.length].id,
    });
  }

  return (
    <>
      <div class="results-preview">
        <section class="results-preview-toolbar" aria-label="Просмотр макетных результатов">
          <div class="results-preview-heading">
            <div>
              <strong>
                <Icon name="sliders" size={18} />
                Макеты результатов
              </strong>
              <p>Реальный прогресс не используется. Смена сценария восстанавливает макеты.</p>
            </div>
            <span class="mini-label" aria-live="polite">
              {position + 1} / {total}
            </span>
          </div>
          <div class="results-preview-controls">
            <div class="results-preview-field">
              <span>Тест</span>
              <SelectField
                label="Тест для просмотра"
                value={selection.level}
                options={LEVELS.map((level) => ({ value: String(level.id), label: `${level.id}. ${level.name}` }))}
                onChange={(level) => show({ ...selection, level })}
              />
            </div>
            <div class="results-preview-field">
              <span>Результат</span>
              <SelectField
                label="Сценарий результата"
                value={selection.scenario}
                options={RESULT_SCENARIOS.map((item) => ({ value: item.id, label: item.label }))}
                onChange={(scenario) => show({ ...selection, scenario })}
              />
            </div>
            <div class="results-preview-navigation" role="group" aria-label="Перебор макетов">
              <button type="button" class="button secondary small" onClick={() => step(-1)}>
                Предыдущий
              </button>
              <button type="button" class="button secondary small" onClick={() => step(1)}>
                Следующий
              </button>
              <button type="button" class="text-button" onClick={() => show(selection)}>
                Открыть результат
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        </section>
        <App key={generation} questions={questions} storage={storage.current} storageName={PREVIEW_STORAGE_KEY} />
      </div>
    </>
  );
}
