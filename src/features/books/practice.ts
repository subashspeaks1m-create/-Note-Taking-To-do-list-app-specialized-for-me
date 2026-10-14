import type { DateKey } from '../../date/localDate';
import { updateBook, type PlanId } from './db';
import { actionKey } from './planMath';

export function startPlan(bookId: string, plan: PlanId, startDate: DateKey) {
  return updateBook(bookId, (b) => {
    b.practice[plan] = { startDate, done: {}, notes: {} };
  });
}

export function stopPlan(bookId: string, plan: PlanId) {
  return updateBook(bookId, (b) => {
    delete b.practice[plan];
  });
}

export function toggleAction(bookId: string, plan: PlanId, day: number, index: number) {
  return updateBook(bookId, (b) => {
    const p = b.practice[plan];
    if (!p) return;
    const key = actionKey(day, index);
    if (p.done[key]) delete p.done[key];
    else p.done[key] = true;
  });
}

export function setDayNote(bookId: string, plan: PlanId, day: number, text: string) {
  return updateBook(bookId, (b) => {
    const p = b.practice[plan];
    if (!p) return;
    if (text.trim()) p.notes[String(day)] = text;
    else delete p.notes[String(day)];
  });
}
