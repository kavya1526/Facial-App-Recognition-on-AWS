import reducer, {
  attemptRecorded,
  historyCleared,
  selectStats,
  selectAttempts,
} from './checkInsSlice';

const granted = { authenticated: true, name: 'Ada Lovelace', similarity: 98.5 };
const denied = { authenticated: false, reason: 'no_match' };

function stateAfter(...attempts) {
  return attempts.reduce(
    (state, attempt) => reducer(state, attemptRecorded(attempt)),
    undefined
  );
}

test('starts empty', () => {
  expect(reducer(undefined, { type: 'init' })).toEqual({ attempts: [] });
});

test('records an attempt with a generated id and timestamp', () => {
  const [attempt] = stateAfter(granted).attempts;

  expect(attempt).toMatchObject({ authenticated: true, name: 'Ada Lovelace' });
  expect(attempt.id).toEqual(expect.any(String));
  expect(Date.parse(attempt.at)).not.toBeNaN();
});

test('orders newest first', () => {
  const state = stateAfter(granted, denied);

  // The history view reads top-down, so the most recent attempt has to be at
  // index 0 rather than appended.
  expect(state.attempts.map((a) => a.authenticated)).toEqual([false, true]);
});

test('fills absent fields with null rather than leaving them undefined', () => {
  // undefined does not survive a JSON round trip and reads as "missing key"
  // in the devtools; null is explicit.
  const [attempt] = stateAfter(denied).attempts;

  expect(attempt.name).toBeNull();
  expect(attempt.similarity).toBeNull();
});

test('caps the log so a long-running kiosk cannot grow it without bound', () => {
  const state = Array.from({ length: 60 }).reduce(
    (acc) => reducer(acc, attemptRecorded(granted)),
    undefined
  );

  expect(state.attempts).toHaveLength(50);
});

test('dropping the oldest entry keeps the newest', () => {
  let state;
  for (let i = 0; i < 50; i += 1) {
    state = reducer(state, attemptRecorded({ ...granted, name: `Person ${i}` }));
  }
  state = reducer(state, attemptRecorded({ ...granted, name: 'Newest' }));

  expect(state.attempts[0].name).toBe('Newest');
  expect(state.attempts.map((a) => a.name)).not.toContain('Person 0');
});

test('clearing empties the log', () => {
  const state = reducer(stateAfter(granted, denied), historyCleared());

  expect(selectAttempts({ checkIns: state })).toEqual([]);
});

test('derives granted and denied counts for the header', () => {
  const state = stateAfter(granted, denied, denied);

  expect(selectStats({ checkIns: state })).toEqual({
    total: 3,
    granted: 1,
    denied: 2,
  });
});

test('stats selector memoises on the attempts array', () => {
  // The header re-renders on every store change; without memoisation it would
  // recompute the counts each time and get a new object identity, defeating
  // useSelector's equality check.
  const state = { checkIns: stateAfter(granted) };

  expect(selectStats(state)).toBe(selectStats(state));
});
