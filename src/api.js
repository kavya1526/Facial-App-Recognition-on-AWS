/**
 * Client for the authentication API.
 *
 * The base URL comes from the environment rather than being hardcoded, so the
 * same bundle can point at a dev stack or a prod stack, and so tearing down a
 * stack does not leave a dead endpoint committed to the repo.
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

if (!API_BASE_URL) {
  // Surfaces at load time instead of as a confusing "fetch failed" on the
  // first click.
  console.error(
    'REACT_APP_API_BASE_URL is not set. Copy .env.example to .env.local and ' +
      'set it to the ApiBaseUrl output from the CloudFormation stack.'
  );
}

/**
 * Ask the API for permission to upload one image.
 *
 * The server chooses the object key; the client never does. That is what stops
 * a caller writing over someone else's upload or placing an object outside the
 * visitors/ prefix.
 */
async function requestUploadPermission(contentType) {
  const response = await fetch(`${API_BASE_URL}/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType }),
  });

  if (!response.ok) {
    throw new Error(`Could not start upload (${response.status})`);
  }
  return response.json();
}

/**
 * Upload directly to S3 using the signed policy.
 *
 * This is a multipart form POST rather than a PUT because only the POST form
 * of a presigned request can carry a content-length-range condition, which is
 * what caps the upload size server-side. The signed fields must be appended
 * before the file -- S3 stops reading at the first byte of file content, so
 * any field after it is ignored.
 */
async function uploadToS3({ uploadUrl, fields }, file) {
  const form = new FormData();
  Object.entries(fields).forEach(([name, value]) => form.append(name, value));
  form.append('file', file);

  const response = await fetch(uploadUrl, { method: 'POST', body: form });

  if (!response.ok) {
    // S3 returns 403 for a policy violation, which for this form means the
    // file exceeded maxBytes or the URL expired before the upload started.
    throw new Error(
      response.status === 403
        ? 'Upload rejected: the image is too large or the link expired.'
        : `Upload failed (${response.status})`
    );
  }
}

async function authenticate(objectKey) {
  const url = `${API_BASE_URL}/employee?${new URLSearchParams({ objectKey })}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Authentication request failed (${response.status})`);
  }
  return response.json();
}

/**
 * Full flow: get permission, upload, then ask who it is.
 *
 * Sequential by necessity -- the object has to exist in S3 before Rekognition
 * can read it. S3 has been strongly consistent for new objects since December
 * 2020, so there is no read-after-write delay to poll around here.
 */
export async function identifyVisitor(file) {
  const permission = await requestUploadPermission(file.type || 'image/jpeg');
  await uploadToS3(permission, file);
  return authenticate(permission.objectKey);
}

export { API_BASE_URL };
