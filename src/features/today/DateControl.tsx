import { useRef } from 'react';
import { Icon } from '../../components/Icon';
import { addDays, formatLong, formatWeekday, isDateKey, type DateKey } from '../../date/localDate';
import type { DayRelation } from './useSelectedDate';

interface Props {
  selected: DateKey;
  today: DateKey;
  relation: DayRelation;
  onSelect: (key: DateKey) => void;
  compact?: boolean;
}

export function DateControl({ selected, today, relation, onSelect, compact }: Props) {
  const pickerRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`date-control ${compact ? 'date-control--compact' : ''}`}>
      <div className="date-control__row">
        <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => onSelect(addDays(selected, -1))}>
          <Icon name="chevronLeft" />
        </button>
        <div className="date-control__label">
          <label className="date-control__picker">
            <span className="visually-hidden">Choose a date</span>
            <input
              ref={pickerRef}
              type="date"
              value={selected}
              min="2000-01-01"
              max="2099-12-31"
              onChange={(e) => {
                if (isDateKey(e.target.value)) onSelect(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="date-control__title"
            onClick={() => {
              const el = pickerRef.current;
              if (!el) return;
              try {
                el.showPicker();
              } catch {
                el.focus();
              }
            }}
            aria-label={`Selected date: ${formatLong(selected)}. Open date picker`}
          >
            <span className="date-control__weekday">{relation === 'today' ? 'Today' : formatWeekday(selected)}</span>
            <span className="date-control__date">{formatLong(selected).replace(/^\w+, /, '')}</span>
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="Next day" onClick={() => onSelect(addDays(selected, 1))}>
          <Icon name="chevronRight" />
        </button>
      </div>
      {relation !== 'today' && (
        <div className={`day-flag day-flag--${relation}`} role="status">
          <span>{relation === 'past' ? 'Viewing a past day' : 'Planning ahead'}</span>
          <button type="button" className="link-btn" onClick={() => onSelect(today)}>
            Back to today
          </button>
        </div>
      )}
    </div>
  );
}
