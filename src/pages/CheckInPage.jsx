import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { identifyVisitor } from '../api';
import { attemptRecorded } from '../store/checkInsSlice';
import CameraCapture from '../components/CameraCapture';

const ACCEPTED_TYPE = 'image/jpeg';

// Matches MAX_UPLOAD_BYTES in the backend. Checked here purely to give a
// useful message before spending a round trip -- the signed S3 policy is what
// actually enforces it, since anything in the browser can be bypassed.
const MAX_BYTES = 5 * 1024 * 1024;

const IDLE_MESSAGE = 'Choose a photo or take one to check in.';

// Keyed by status so the result banner's colour is a lookup rather than a
// chain of ternaries in the JSX. Written out in full because Tailwind scans
// source for complete class strings -- building them by interpolation
// (`bg-${tone}-50`) would leave the classes out of the compiled stylesheet.
const RESULT_STYLES = {
  idle: 'bg-gray-50 text-gray-600',
  working: 'bg-gray-50 text-gray-600',
  success: 'bg-success-surface text-success',
  failure: 'bg-danger-surface text-danger',
};

const RESULT_ICONS = {
  idle: null,
  working: '…',
  success: '✓',
  failure: '✕',
};

function describeResult(result) {
  if (result.authenticated) {
    return `Welcome, ${result.firstName} ${result.lastName}. Matched at ${result.similarity}% similarity.`;
  }
  switch (result.reason) {
    case 'no_face_detected':
      return 'No face found in that photo. Try one that is well lit and front-facing.';
    case 'no_match':
      return 'Not recognised. This person is not a registered employee.';
    case 'unknown_face':
      // Rekognition matched but the employee record is missing -- an
      // operational fault rather than a rejection, so say so honestly instead
      // of implying the person is an impostor.
      return 'Matched a face, but the employee record is missing. Contact an administrator.';
    default:
      return 'Authentication failed.';
  }
}

const sourceTabClass = (active) =>
  `flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
    active
      ? 'bg-white text-gray-900 shadow-sm'
      : 'text-gray-500 hover:text-gray-700'
  }`;

export default function CheckInPage() {
  const [source, setSource] = useState('upload'); // upload | camera
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | working | success | failure
  const [message, setMessage] = useState(IDLE_MESSAGE);
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

  function reset() {
    setFile(null);
    setStatus('idle');
    setMessage(IDLE_MESSAGE);
  }

  function onFileChange(event) {
    const selected = event.target.files[0];
    setStatus('idle');

    if (!selected) {
      setFile(null);
      setMessage(IDLE_MESSAGE);
      return;
    }
    if (selected.type !== ACCEPTED_TYPE) {
      setFile(null);
      setStatus('failure');
      setMessage('Please choose a JPEG image.');
      return;
    }
    if (selected.size > MAX_BYTES) {
      setFile(null);
      setStatus('failure');
      setMessage(
        `That image is ${(selected.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`
      );
      return;
    }

    setFile(selected);
    setMessage(IDLE_MESSAGE);
  }

  // Frames arrive already capped and encoded as JPEG by CameraCapture, so the
  // size and type checks above cannot fail for this path.
  function onCapture(captured) {
    setFile(captured);
    setStatus('idle');
    setMessage(IDLE_MESSAGE);
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!file || status === 'working') return;

    setStatus('working');
    setMessage('Checking…');

    try {
      const result = await identifyVisitor(file);
      setStatus(result.authenticated ? 'success' : 'failure');
      setMessage(describeResult(result));

      // The local status drives this view; the store records the attempt for
      // the header count and the history route.
      dispatch(
        attemptRecorded({
          authenticated: result.authenticated,
          name: result.authenticated
            ? `${result.firstName} ${result.lastName}`
            : null,
          reason: result.reason,
          similarity: result.similarity,
        })
      );
    } catch (error) {
      setStatus('failure');
      // The API never returns internal detail, so whatever reaches here is
      // either a network fault or a status code -- safe to show directly.
      setMessage(error.message);
      console.error(error);
      // Not recorded in history: a network failure says nothing about who was
      // at the door, and logging it as a denial would misrepresent the person.
    }
  }

  const busy = status === 'working';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {previewUrl ? (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="Selected visitor"
            className="aspect-[4/3] w-full rounded-lg bg-gray-100 object-cover"
          />
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="w-full rounded-lg border border-gray-300 px-4 py-2
                       text-sm font-medium text-gray-700 transition
                       hover:bg-gray-50 disabled:opacity-50"
          >
            {source === 'camera' ? 'Retake' : 'Choose a different photo'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            role="tablist"
            aria-label="Photo source"
            className="flex gap-1 rounded-lg bg-gray-100 p-1"
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
              className="flex aspect-[4/3] cursor-pointer flex-col items-center
                         justify-center gap-2 rounded-lg border-2 border-dashed
                         border-gray-300 text-center transition
                         hover:border-gray-400 hover:bg-gray-50"
            >
              <span className="text-sm font-medium text-gray-700">
                Choose a JPEG
              </span>
              <span className="text-xs text-gray-500">Up to 5 MB</span>
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
          className="w-full rounded-lg bg-brand px-5 py-2.5 text-sm font-medium
                     text-white transition hover:bg-brand/90
                     disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? 'Checking…' : 'Authenticate'}
        </button>
      </form>

      <p
        role="status"
        aria-live="polite"
        className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${RESULT_STYLES[status]}`}
      >
        {RESULT_ICONS[status] && (
          <span aria-hidden="true" className="font-semibold leading-5">
            {RESULT_ICONS[status]}
          </span>
        )}
        <span>{message}</span>
      </p>
    </section>
  );
}
