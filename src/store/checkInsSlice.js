import { createSlice, createSelector, nanoid } from '@reduxjs/toolkit';

/**
 * The session's check-in attempts, newest first.
 *
 * This is the state that justifies a store at all: three components in
 * different parts of the tree read it. The header shows a live count, the
 * history route renders the list, and the check-in form writes to it -- and
 * the form and the header are siblings under the router, so lifting state to a
 * common ancestor would mean threading it through the layout.
 *
 * Attempts are kept in memory only. Deliberately: this is a log of who
 * presented themselves at a door, and persisting it to localStorage would put
 * identifying records on a shared kiosk with no way to expire them. The
 * backend already discards visitor images after a day for the same reason.
 */

// Bounded so a kiosk left running for a week does not grow the array without
// limit. The history view is for spotting a recent failure, not an audit
// trail -- CloudWatch holds the real one.
const MAX_ATTEMPTS = 50;

const checkInsSlice = createSlice({
  name: 'checkIns',
  initialState: {
    attempts: [],
  },
  reducers: {
    attemptRecorded: {
      reducer(state, action) {
        state.attempts.unshift(action.payload);
        if (state.attempts.length > MAX_ATTEMPTS) {
          state.attempts.pop();
        }
      },
      // `prepare` keeps nanoid() and Date.now() out of the reducer. A reducer
      // that calls either is no longer a pure function of its inputs, which
      // breaks both the devtools' replay and the reducer tests.
      prepare({ authenticated, name, reason, similarity }) {
        return {
          payload: {
            id: nanoid(),
            at: new Date().toISOString(),
            authenticated,
            name: name ?? null,
            reason: reason ?? null,
            similarity: similarity ?? null,
          },
        };
      },
    },
    historyCleared(state) {
      state.attempts = [];
    },
  },
});

export const { attemptRecorded, historyCleared } = checkInsSlice.actions;

export const selectAttempts = (state) => state.checkIns.attempts;

/**
 * Derived counts for the header.
 *
 * createSelector memoises on the attempts array, so the header does not
 * recompute (or re-render) when an unrelated part of the store changes.
 */
export const selectStats = createSelector([selectAttempts], (attempts) => {
  const granted = attempts.filter((a) => a.authenticated).length;
  return {
    total: attempts.length,
    granted,
    denied: attempts.length - granted,
  };
});

export default checkInsSlice.reducer;
