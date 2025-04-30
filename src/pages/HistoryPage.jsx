import { useDispatch, useSelector } from 'react-redux';
import { selectAttempts, historyCleared } from '../store/checkInsSlice';

const REASON_LABELS = {
  no_face_detected: 'No face detected',
  no_match: 'Not recognised',
  unknown_face: 'Record missing',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const CARD = 'rounded-2xl border border-border bg-surface p-5 shadow-card';

export default function HistoryPage() {
  const attempts = useSelector(selectAttempts);
  const dispatch = useDispatch();

  if (attempts.length === 0) {
    return (
      <section className={`${CARD} flex flex-col items-center gap-2 py-12`}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 text-subtle">
          <path
            d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm text-muted">No check-ins yet this session.</p>
        <p className="max-w-xs text-center text-xs text-subtle">
          Attempts are kept in memory only, and are gone when this tab closes.
        </p>
      </section>
    );
  }

  return (
    <section className={CARD}>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">This session</h2>
        <button
          type="button"
          onClick={() => dispatch(historyCleared())}
          className="rounded px-1 text-xs font-medium text-subtle transition-colors hover:text-ink"
        >
          Clear
        </button>
      </div>

      <ul className="divide-y divide-border text-left">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="flex items-center gap-3 py-2.5">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 rounded-full ${
                attempt.authenticated ? 'bg-success' : 'bg-danger'
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {attempt.authenticated
                  ? attempt.name
                  : REASON_LABELS[attempt.reason] ?? 'Failed'}
              </p>
            </div>
            {attempt.similarity != null && (
              <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-xs tabular-nums text-muted">
                {attempt.similarity}%
              </span>
            )}
            <time
              dateTime={attempt.at}
              className="shrink-0 text-xs tabular-nums text-subtle"
            >
              {formatTime(attempt.at)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
