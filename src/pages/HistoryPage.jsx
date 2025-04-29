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

export default function HistoryPage() {
  const attempts = useSelector(selectAttempts);
  const dispatch = useDispatch();

  if (attempts.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="py-8 text-center text-sm text-gray-500">
          No check-ins yet this session.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">This session</h2>
        <button
          type="button"
          onClick={() => dispatch(historyCleared())}
          className="text-sm text-gray-500 underline hover:text-gray-800"
        >
          Clear
        </button>
      </div>

      <ul className="divide-y divide-gray-200 text-left">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="flex items-baseline gap-3 py-2.5">
            <span
              aria-hidden="true"
              className={`mt-1 size-2 shrink-0 rounded-full ${
                attempt.authenticated ? 'bg-success' : 'bg-danger'
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-900">
                {attempt.authenticated
                  ? attempt.name
                  : REASON_LABELS[attempt.reason] ?? 'Failed'}
              </p>
              {attempt.similarity != null && (
                <p className="text-xs text-gray-500">
                  {attempt.similarity}% similarity
                </p>
              )}
            </div>
            <time
              dateTime={attempt.at}
              className="shrink-0 text-xs tabular-nums text-gray-400"
            >
              {formatTime(attempt.at)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
