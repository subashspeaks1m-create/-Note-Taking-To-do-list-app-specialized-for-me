import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTodayKey } from '../../date/clock';
import { compareKeys, isDateKey, type DateKey } from '../../date/localDate';
import { PROFILE_DEFAULTS } from '../../domain/config';

export type DayRelation = 'past' | 'today' | 'future';

/**
 * The selected day lives in the URL (`?date=YYYY-MM-DD`) so it survives
 * reloads and deep links, and never silently snaps back to today.
 */
export function useSelectedDate() {
  const [params, setParams] = useSearchParams();
  const today = useTodayKey(PROFILE_DEFAULTS.timeZone);
  const raw = params.get('date');
  const selected: DateKey = raw && isDateKey(raw) ? raw : today;
  const cmp = compareKeys(selected, today);
  const relation: DayRelation = cmp < 0 ? 'past' : cmp > 0 ? 'future' : 'today';

  const select = useCallback(
    (key: DateKey) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === today) next.delete('date');
          else next.set('date', key);
          return next;
        },
        { replace: false },
      );
    },
    [setParams, today],
  );

  return { today, selected, relation, select, timeZone: PROFILE_DEFAULTS.timeZone };
}
