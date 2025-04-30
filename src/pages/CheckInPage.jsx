import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { identifyVisitor } from '../api';
import { attemptRecorded } from '../store/checkInsSlice';
import CameraCapture from '../components/CameraCapture';
import Verdict from '../components/Verdict';

const ACCEPTED_TYPE = 'image/jpeg';

// Matches MAX_UPLOAD_BYTES in the backend. Checked here purely to give a
// useful message before spending a round trip -- the signed S3 policy is what
// actually enforces it, since anything in the browser can be bypassed.
const MAX_BYTES = 5 * 1024 * 1024;

const IDLE_MESSAGE = 'Choose a photo or take one to check in.';

const sourceTabClass = (active) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
    active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
  }`;

export default function CheckInPage() {
  const [source, setSource] = useState('upload'); // upload | camera
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | working | success | failure
  const [message, setMessage] = useState(IDLE_MESSAGE);
  const [result, setResult] = useState(null);
  const dispatch = useDispatch();

  // Object URLs hold the file in memory until explicitly revoked, so each one
  // is released when it is replaced or the component unmounts.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearVerdict() {
    setStatus('idle');
    setMessage(IDLE_MESSAGE);
    setResult(null);
  }

  function reset() {
    setFile(null);
    clearVerdict();
  }

  function fail(text) {
    setFile(null);
    setStatus('failure');
    setMessage(text);
    setResult(null);
  }

  function onFileChange(event) {
    const selected = event.target.files[0];

    if (!selected) {
      setFile(null);
      clearVerdict();
      return;
    }
    if (selected.type !== ACCEPTED_TYPE) {
      fail('Please choose a JPEG image.');
      return;
    }
    if (selected.size > MAX_BYTES) {
      fail(
        `That image is ${(selected.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`
      );
      return;
    }

    setFile(selected);
    clearVerdict();
  }

  // Frames arrive already capped and encoded as JPEG by CameraCapture, so the
  // size and type checks above cannot fail for this path.
  function onCapture(captured) {
    setFile(captured);
    clearVerdict();
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!file || status === 'working') return;

    setStatus('working');
    setMessage('Checking…');
    setResult(null);

    try {
      const outcome = await identifyVisitor(file);
      setStatus(outcome.authenticated ? 'success' : 'failure');
      setResult(outcome);

      // The local status drives this view; the store records the attempt for
      // the header count and the history route.
      dispatch(
        attemptRecorded({
          authenticated: outcome.authenticated,
          name: outcome.authenticated
            ? `${outcome.firstName} ${outcome.lastName}`
            : null,
          reason: outcome.reason,
          similarity: outcome.similarity,
        })
      );
    } catch (error) {
      // The API never returns internal detail, so whatever reaches here is
      // either a network fault or a status code -- safe to show directly. It is
      // left as a result-less failure so Verdict renders it as trouble rather
      // than as a denial.
      setStatus('failure');
      setMessage(error.message);
      setResult(null);
      console.error(error);
      // Not recorded in history: a network failure says nothing about who was
      // at the door, and logging it as a denial would misrepresent the person.
    }
  }

  const busy = status === 'working';

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      {previewUrl ? (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="Selected visitor"
            className="animate-rise-in aspect-[4/3] w-full rounded-xl bg-sunken object-cover"
          />
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="w-full rounded-lg border border-border-strong px-4 py-2
                       text-sm font-medium text-muted transition-colors
                       hover:bg-sunken hover:text-ink disabled:opacity-50"
          >
            {source === 'camera' ? 'Retake' : 'Choose a different photo'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label="Photo source"
            className="flex gap-1 rounded-lg bg-sunken p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={source === 'upload'}
              onClick={() => setSource('upload')}
              className={sourceTabClass(source === 'upload')}
            >
              Upload
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'camera'}
              onClick={() => setSource('camera')}
              className={sourceTabClass(source === 'camera')}
            >
              Camera
            </button>
          </div>

          {source === 'upload' ? (
            <label
              className="group flex aspect-[4/3] cursor-pointer flex-col items-center
                         justify-center gap-1.5 rounded-xl border border-dashed
                         border-border-strong text-center transition-colors
                         hover:border-focus hover:bg-sunken
                         focus-within:border-focus"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-7 text-subtle transition-colors group-hover:text-muted"
              >
                <path
                  d="M12 16V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-sm font-medium text-ink">Choose a JPEG</span>
              <span className="text-xs text-subtle">Up to 5 MB</span>
              <input
                type="file"
                name="image"
                accept="image/jpeg"
                onChange={onFileChange}
                disabled={busy}
                className="sr-only"
              />
            </label>
          ) : (
            // Keyed on the tab so switching away unmounts the component, which
            // is what stops the stream and turns the camera light off.
            <CameraCapture key="camera" onCapture={onCapture} disabled={busy} />
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-4">
        <button
          type="submit"
          disabled={!file || busy}
          className="w-full rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold
                     text-on-accent shadow-sm transition-colors duration-150
                     hover:bg-accent-hover disabled:cursor-not-allowed
                     disabled:bg-border-strong disabled:text-subtle
                     disabled:shadow-none"
        >
          {busy ? 'Checking…' : 'Authenticate'}
        </button>
      </form>

      <Verdict status={status} message={message} result={result} />
    </section>
  );
}
