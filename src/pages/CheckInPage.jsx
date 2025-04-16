import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { identifyVisitor } from '../api';
import { attemptRecorded } from '../store/checkInsSlice';

const ACCEPTED_TYPE = 'image/jpeg';

// Matches MAX_UPLOAD_BYTES in the backend. Checked here purely to give a
// useful message before spending a round trip -- the signed S3 policy is what
// actually enforces it, since anything in the browser can be bypassed.
const MAX_BYTES = 5 * 1024 * 1024;

const IDLE_MESSAGE = 'Upload a photo to check in.';

// Keyed by status so the result banner's colour is a lookup rather than a
// chain of ternaries in the JSX. Written out in full because Tailwind scans
// source for complete class strings -- building them by interpolation
// (`bg-${tone}-50`) would leave the classes out of the compiled stylesheet.
const RESULT_STYLES = {
  idle: 'text-gray-600',
  working: 'text-gray-600',
  success: 'bg-success-surface text-success',
  failure: 'bg-danger-surface text-danger',
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

export default function CheckInPage() {
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
    <section className="text-center">
      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-center justify-center gap-3"
      >
        <input
          type="file"
          name="image"
          accept="image/jpeg"
          onChange={onFileChange}
          disabled={busy}
          className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0
                     file:bg-gray-100 file:px-4 file:py-2 file:text-sm
                     file:font-medium hover:file:bg-gray-200
                     disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-md bg-brand px-5 py-2 text-white
                     hover:bg-brand/90 disabled:cursor-not-allowed
                     disabled:bg-gray-400"
        >
          {busy ? 'Checking…' : 'Authenticate'}
        </button>
      </form>

      <p
        role="status"
        aria-live="polite"
        className={`my-5 min-h-12 rounded-md p-3 ${RESULT_STYLES[status]}`}
      >
        {message}
      </p>

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Selected visitor"
          className="mx-auto w-64 max-w-full rounded-lg"
        />
      )}
    </section>
  );
}
