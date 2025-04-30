/**
 * The result of a check-in attempt.
 *
 * This is the only part of the screen that carries a decision, so it is the
 * only part allowed to use colour, weight, and size to say something. The rest
 * of the UI stays neutral to keep that signal legible.
 */

// Mirrors the SimilarityThreshold stack parameter. It is duplicated here rather
// than returned by the API because the API deliberately answers "yes/no" and a
// score, not "here is my configuration" -- but that means changing the stack
// parameter without changing this leaves the marker in the wrong place. Env var
// rather than a literal so the two can be kept in step from one place.
const THRESHOLD = Number(process.env.REACT_APP_SIMILARITY_THRESHOLD ?? 90);

const FAILURE_HEADLINES = {
  no_face_detected: 'No face detected',
  no_match: 'Not recognised',
  unknown_face: 'Record missing',
};

const FAILURE_DETAILS = {
  no_face_detected:
    'Try a photo that is well lit and front-facing, with one face in frame.',
  no_match: 'This person is not enrolled as an employee.',
  // Rekognition matched but the employee record is missing -- an operational
  // fault rather than a rejection, so it says so honestly instead of implying
  // the person is an impostor.
  unknown_face:
    'A face matched, but its employee record is missing. Contact an administrator.',
};

function Spinner() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.25"
      />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Similarity against the accept threshold.
 *
 * The number alone ("94%") does not tell you whether that was a comfortable
 * pass or a near miss. Drawing the threshold on the track does, and it makes
 * the one tunable parameter in the system visible in the product rather than
 * buried in a CloudFormation parameter.
 */
function SimilarityMeter({ value }) {
  return (
    <div className="mt-3">
      <div
        role="img"
        aria-label={`Similarity ${value}%, accept threshold ${THRESHOLD}%`}
        className="relative h-2 w-full overflow-hidden rounded-full bg-success-border"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
        {/* Notch drawn over the fill in the card's own background colour, so it
            reads as a gap cut through the bar. Underneath the fill it would be
            invisible at exactly the scores that matter -- the passing ones. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-success-surface"
          style={{ left: `${THRESHOLD}%` }}
        />
      </div>
      {/* Legend rather than a number floating under the notch: a label anchored
          to the notch position runs off the end of the track once the threshold
          is set high, which is exactly where a door threshold belongs. */}
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-success/70">
        <span aria-hidden="true" className="inline-block h-2.5 w-0.5 bg-success/40" />
        <span className="tabular-nums">Accept threshold {THRESHOLD}%</span>
      </p>
    </div>
  );
}

export default function Verdict({ status, message, result }) {
  if (status === 'idle') {
    return (
      <p className="mt-4 text-center text-sm text-subtle">{message}</p>
    );
  }

  if (status === 'working') {
    return (
      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
        <Spinner />
        {message}
      </p>
    );
  }

  const granted = status === 'success';

  // A network or HTTP failure has no result object -- there is no verdict to
  // report, only an error, so it is rendered as plain trouble rather than as a
  // denial the person could take personally.
  if (!granted && !result) {
    return (
      <div className="animate-rise-in mt-4 rounded-lg border border-border bg-sunken p-3 text-sm text-muted">
        {message}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`animate-rise-in mt-4 rounded-xl border p-4 ${
        granted
          ? 'border-success-border bg-success-surface'
          : 'border-danger-border bg-danger-surface'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            granted
              ? 'bg-success text-success-surface'
              : 'bg-danger text-danger-surface'
          }`}
        >
          {granted ? '✓' : '✕'}
        </span>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-semibold uppercase tracking-wider ${
              granted ? 'text-success/80' : 'text-danger/80'
            }`}
          >
            {granted ? 'Access granted' : 'Access denied'}
          </p>

          <p
            className={`truncate text-lg font-semibold ${
              granted ? 'text-success' : 'text-danger'
            }`}
          >
            {granted
              ? `${result.firstName} ${result.lastName}`
              : FAILURE_HEADLINES[result.reason] ?? 'Authentication failed'}
          </p>

          {granted ? (
            <>
              <p className="text-sm tabular-nums text-success/80">
                {result.similarity}% similarity
              </p>
              <SimilarityMeter value={result.similarity} />
            </>
          ) : (
            <p className="text-sm text-danger/80">
              {FAILURE_DETAILS[result.reason] ?? message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
