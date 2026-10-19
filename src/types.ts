export type LevelId = 1 | 2 | 3;
export type DomainId = 1 | 2 | 3 | 4 | 5 | 6;
export type QuestionType = 'single' | 'multi' | 'match';
export type AttemptMode = 'exam' | 'mistakes';

export interface Source {
  title: string;
  url: string;
}

export interface QuestionOption {
  id: string;
  text: string;
  explanation: string;
}

export interface PairItem {
  id: string;
  text: string;
}

interface QuestionBase {
  id: string;
  level: LevelId;
  domain: DomainId;
  topic: string;
  prompt: string;
  explanation: string;
  takeaway: string;
  sources: Source[];
}

export interface ChoiceQuestion extends QuestionBase {
  type: 'single' | 'multi';
  options: QuestionOption[];
  correct: string[];
}

export interface MatchQuestion extends QuestionBase {
  type: 'match';
  left: PairItem[];
  right: PairItem[];
  pairs: Record<string, string>;
  pairExplanations: Record<string, string>;
}

export type Question = ChoiceQuestion | MatchQuestion;
export type ChoiceResponse = string[];
export type MatchResponse = Record<string, string>;
export type Response = ChoiceResponse | MatchResponse;
export type QuestionResponse = Response;

export interface AnswerRecord {
  response: Response;
  correct: boolean;
  submittedAt: string;
  timedOut?: boolean;
}

export interface Timing {
  secondsPerQuestion: number;
  deadlines: Record<string, string>;
}

export interface Attempt {
  id: string;
  bankVersion: string;
  level: LevelId;
  mode: AttemptMode;
  questionIds: string[];
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  cursor: number;
  answers: Record<string, AnswerRecord>;
  drafts: Record<string, Response>;
  bookmarks: string[];
  timing?: Timing;
}

export interface AppState {
  schemaVersion: number;
  bankVersion: string;
  revision: number;
  sessions: Record<string, Attempt>;
  history: Attempt[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DomainScore {
  domain: DomainId;
  total: number;
  answered: number;
  correct: number;
  weight: number;
}

export interface Score {
  correct: number;
  total: number;
  answered: number;
  wrong: number;
  unanswered: number;
  incorrect: number;
  percent: number;
  weighted: number | null;
  byDomain: DomainScore[];
}

export interface LevelMeta {
  id: LevelId;
  name: string;
  kicker: string;
  description: string;
  icon: string;
  tag: string;
  theme: string;
}

export interface DomainMeta {
  id: DomainId;
  short: string;
  title: string;
  weight: number;
  icon: string;
  description: string;
  guide: [string, string][];
}

export interface OfficialResource {
  title: string;
  url: string;
  note: string;
}

export interface StorageReadResult {
  state: AppState;
  warning: string;
  protected: boolean;
  raw: string | null;
}

export interface StorageWriteResult {
  ok: boolean;
  conflict?: boolean;
  warning?: string;
}
