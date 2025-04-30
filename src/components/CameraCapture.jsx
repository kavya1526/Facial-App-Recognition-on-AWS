import { useCallback, useEffect, useRef, useState } from 'react';

// Long-edge cap for the captured frame. A 1080p webcam frame at quality 0.92
// lands around 200-400 KB, comfortably inside the 5 MB signed policy, and
// Rekognition gains nothing from more pixels -- it wants a face that is
// reasonably large in frame, not a large frame.
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.92;

const CONSTRAINTS = {
  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

/**
 * getUserMedia rejects with a handful of DOMException names that mean very
 * different things to the person holding the laptop, so they are translated
 * rather than shown raw.
 */
function describeCameraError(error) {
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow it in your browser’s address bar, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device.';
    case 'NotReadableError':
      // Windows and macOS both hand the camera to one process at a time.
      return 'The camera is already in use by another application.';
    default:
      return 'Could not start the camera.';
  }
}

/**
 * Live camera preview with a shutter that hands back a JPEG File.
 *
 * The File is built to look exactly like one from <input type="file">, so the
 * upload path does not need to know which source the image came from.
 */
export default function CameraCapture({ onCapture, disabled }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    // Undefined on an insecure origin: getUserMedia is gated to HTTPS and
    // localhost, so this is what a plain-http deployment would hit.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open a camera on an insecure connection.');
      return undefined;
    }

    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia(CONSTRAINTS)
      .then((stream) => {
        // The component can unmount while the permission prompt is still open;
        // without this the stream is orphaned and the camera light stays on.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        if (!cancelled) setError(describeCameraError(err));
      });

    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;

    const { videoWidth, videoHeight } = video;
    const scale = Math.min(1, MAX_EDGE / Math.max(videoWidth, videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);

    const ctx = canvas.getContext('2d');
    // The preview is mirrored so it reads as a mirror rather than a video call,
    // and the capture is mirrored to match -- otherwise the photo comes back
    // flipped from what was on screen. Rekognition is indifferent either way.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Fires before toBlob finishes encoding, so the flash acknowledges the
    // press immediately rather than after the compression pause.
    setFlash(true);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not read a frame from the camera.');
          return;
        }
        onCapture(
          new File([blob], 'capture.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        );
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  }

  if (error) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-danger-border bg-danger-surface p-6 text-center">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 text-danger">
          <path
            d="M12 9v4m0 3h.01M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-[#0b0e16]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="aspect-[4/3] w-full -scale-x-100 object-cover"
        />

        {/* A loose framing guide. Rekognition does not need the face centred,
            but people aim at a target if you give them one, and a centred,
            reasonably large face is what produces a usable match. */}
        {ready && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <div className="h-[68%] w-[52%] rounded-[50%] border-2 border-white/25" />
          </div>
        )}

        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
            Starting camera…
          </p>
        )}

        {flash && (
          <div
            aria-hidden="true"
            onAnimationEnd={() => setFlash(false)}
            className="animate-shutter absolute inset-0 bg-white"
          />
        )}
      </div>

      <button
        type="button"
        onClick={capture}
        disabled={!ready || disabled}
        className="w-full rounded-lg border border-border-strong px-5 py-2.5
                   text-sm font-medium text-ink transition-colors
                   hover:bg-sunken disabled:cursor-not-allowed
                   disabled:text-subtle"
      >
        Take photo
      </button>
    </div>
  );
}
