import d1 from './domain-1.json';
import d2 from './domain-2.json';
import d3 from './domain-3.json';
import d4 from './domain-4.json';
import d5 from './domain-5.json';
import d6 from './domain-6.json';
import type { Question } from '../types.ts';

// JSON bank is authored and checked by scripts/validate-bank.ts before build.
export const questions = ([...d1, ...d2, ...d3, ...d4, ...d5, ...d6] as unknown as Question[]).sort(
  (a, b) => a.level - b.level || a.domain - b.domain || a.id.localeCompare(b.id),
);
