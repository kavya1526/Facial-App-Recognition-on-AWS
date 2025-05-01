# Facial Recognition Check-In

Serverless employee check-in on AWS. An employee photo dropped into a private
S3 bucket is indexed into a Rekognition collection asynchronously; a visitor at
the door presents a photo — uploaded or taken with the device camera — through
a short-lived presigned policy, and gets a match decision in one synchronous
call.

**Live:** https://kavya1526.github.io/Facial-Recognition-App-on-AWS

![The check-in page after a successful match: the submitted photo, a granted
verdict for the matched employee, and the similarity meter with the accept
threshold marked](assets/check-in.png)

```
                    ┌──────────────── enrolment (async) ────────────────┐
                    │                                                    │
  employee photo ──▶ S3 employees/  ──ObjectCreated──▶ Lambda index_face │
                                                            │            │
                                            IndexFaces ─────┤            │
                                                            ▼            │
                                            Rekognition collection       │
                                                            │            │
                                             FaceId ────────┴──▶ DynamoDB│
                                                                         │
                    └────────────────────────────────────────────────────┘

                    ┌────────────── authentication (sync) ──────────────┐
                    │                                                    │
  browser ─POST /uploads─▶ API GW ─▶ Lambda presign_upload               │
          ◀── signed policy + server-chosen key ──┘                      │
          │                                                              │
          └─POST (multipart)─▶ S3 visitors/<uuid>.jpg                    │
                                                                         │
  browser ─GET /employee?objectKey─▶ API GW ─▶ Lambda authenticate       │
                                                  │                      │
                                    SearchFacesByImage ──▶ Rekognition   │
                                                  │                      │
                                        FaceId ───┴──▶ DynamoDB GetItem  │
                    └────────────────────────────────────────────────────┘
```

## Why it is split this way

Enrolment and authentication have opposite requirements, so they are wired
differently rather than sharing an endpoint.

Enrolment is nobody's blocking task. Onboarding fifty new hires means fifty
photos arriving at once, and no human is watching. So it runs off an S3
notification: Lambda concurrency absorbs the burst, a Rekognition throttle just
means the event is retried, and anything still failing after two retries lands
in a dead-letter queue where it can be inspected. Nothing is lost and nothing
times out.

Authentication is a person standing at a door. The answer is worthless if it
arrives thirty seconds later, so it is a synchronous API call with no queue in
front of it. The tradeoff is that a Rekognition outage becomes a user-visible
error rather than a delayed retry — which is the correct failure mode here,
because failing closed at a door is safer than failing open.

## Design decisions

### Uploads go directly to S3, not through API Gateway

The first version of this project used API Gateway's S3 proxy integration: the
browser PUT image bytes to API Gateway, which forwarded them to S3. That had
three problems.

It was unauthenticated — anyone who read the URL out of the JavaScript bundle
could write arbitrary objects into the bucket, and every uploaded image costs a
Rekognition call. It capped uploads at API Gateway's 10 MB request limit. And
every byte was billed twice, once as API Gateway data transfer and again as an
S3 PUT.

Now the browser asks `POST /uploads` for permission, and a Lambda returns a
presigned POST policy scoped to one server-chosen key. The client cannot pick
the key, so it cannot overwrite another upload or escape the `visitors/`
prefix. The policy expires in 60 seconds.

It is a presigned **POST** rather than a PUT specifically because only the POST
form can carry a `content-length-range` condition. A presigned PUT has no way
to express a size limit, so a caller could upload a multi-gigabyte object and
the first sign of trouble would be the bill. S3 enforces the range server-side
from the signed policy, so a client that ignores the advertised limit still
fails.

### The client never chooses an object key

`authenticate` rejects any `objectKey` that does not match
`visitors/<uuid-v4>.jpg` exactly. Without that check, a caller could pass
`objectKey=employees/ceo.jpg` and have the API run recognition against an image
they were never allowed to upload — effectively asking the system to confirm
the CEO's identity on demand. The regex is the whole defence and it is
[unit-tested against traversal, prefix, and suffix-smuggling attempts](backend/tests/test_keys.py).

### DynamoDB holds an opaque FaceId, not a face

Rekognition stores the face vectors inside its own collection and hands back an
opaque `FaceId`. The table maps `FaceId → employee`, and nothing else. The
biometric template never enters our datastore, which keeps the highest-risk
data class out of a store we back up, log, and query.

The table is a single partition key with no sort key and no secondary index,
because the only access pattern is a point lookup by `FaceId` — one RCU, no
scan. Listing all employees would need a GSI or a Scan; it is not built,
because there is no feature that needs it.

### Choosing the similarity threshold

`SIMILARITY_THRESHOLD` defaults to 90 and is a stack parameter, not a constant,
because the right value is a policy decision rather than an engineering one.

Lowering it reduces false rejects — the employee who changed their hair and
gets refused — at the cost of false accepts. For door access a false accept
means letting in someone who is not an employee, which is far more expensive
than the inconvenience of a retry, so the threshold sits high. AWS recommends
99 for use cases where a false accept is a safety issue; 90 is the value tuned
for this demo's small collection, and a real deployment should be measured
against a labelled set rather than guessed.

The decision boundary is re-checked in application code even though Rekognition
already applies `FaceMatchThreshold`. That keeps the rule testable without
calling AWS, and means the behaviour is visible in the repository rather than
buried in a service parameter.

The frontend draws the threshold as a notch on the similarity meter, so a 91%
pass and a 99% pass do not look like the same result. That number reaches the
browser through `REACT_APP_SIMILARITY_THRESHOLD` rather than from the API,
because the API deliberately answers "yes or no, and a score" rather than
publishing its own configuration. The cost of that choice is a value stored in
two places: deploying the stack with a different `SimilarityThreshold` and not
updating the env var leaves the marker drawn in the wrong place. The verdict
itself is unaffected — the accept/reject decision is made server-side either
way, and only the drawn marker would be wrong.

### Idempotency

S3 event notifications are at-least-once, so the same object can be delivered
twice. `index_face` writes with `attribute_not_exists(FaceId)` and treats the
conditional failure as success. Without that, a replay would either overwrite a
good row or raise — and raising would send a perfectly healthy event to the
DLQ and fire the alarm at 3am for nothing.

### Retry classification

The async handler deliberately distinguishes permanent from transient failure,
because Lambda's retry behaviour is driven by whether the handler raises.

Permanent failures are swallowed with a log line: a photo with no detectable
face will not grow one on retry, and a file that does not match the naming
scheme never will. Retrying those costs three Rekognition calls and ends in a
DLQ message no operator can action.

Transient failures — DynamoDB unavailable, Rekognition throttling — are allowed
to propagate, buying two retries and then the DLQ. Swallowing one of those
would silently lose an employee's enrolment, and nobody would find out until
that person was refused at a door.

### Operations

Every log line is a single JSON object with an `event` field, so CloudWatch
Logs Insights can query it without regex:

```
fields @timestamp, similarity, employeeId
| filter event = "auth.match"
| stats avg(similarity), count() by employeeId
```

Two alarms exist. `index-dlq-not-empty` fires when anything reaches the DLQ —
each message is an employee who will be denied entry, which is the one
condition worth waking someone for. `authenticate-errors` fires on 5xx from the
sync path.

One log event is worth calling out: `auth.orphan_face` means Rekognition
matched a face that has no row in DynamoDB, which happens if `IndexFaces`
succeeded and the subsequent write failed. It is an operational defect, not a
failed login, and it is logged distinctly so the two are not confused in a
dashboard.

## Known limitations

These are deliberate omissions, not oversights:

- **No caller authentication.** Anyone who can reach the API can request an
  upload policy. Real access control needs Cognito or an API key in front of
  API Gateway; throttling (20 rps, 40 burst) currently bounds the damage rather
  than preventing it.
- **No liveness detection.** A photo of a photo authenticates, and the camera
  makes that easier rather than harder: holding a phone up to the lens is the
  whole attack. Nothing about capturing in-browser implies the face was
  present — the frame is a JPEG by the time the API sees it, identical to an
  uploaded one. Defeating this needs Rekognition Face Liveness, which requires
  a video stream and a session the server controls.
- **`employees/` is populated out of band**, by console or CLI upload. There is
  no enrolment UI or admin authorisation.
- **Employee names come from the filename** (`employees/first_last.jpg`), which
  cannot represent names outside `[a-z]_[a-z]`. A real system would carry
  identity in a request body, not a key.
- **No load test.** Latency and cost figures are not published here because
  they have not been measured.

## Layout

```
backend/
  template.yaml            SAM stack: buckets, table, collection, functions, alarms
  src/
    common/                config, boto3 clients, key rules, Rekognition, DynamoDB
    handlers/              one module per Lambda
  tests/                   pytest; moto for S3/DynamoDB, botocore Stubber for Rekognition
src/
  api.js                   all network calls; the components never fetch
  index.css                Tailwind entry and the whole design token set
  store/                   Redux Toolkit slice for the session check-in log
  components/
    Header.jsx             nav plus live granted/denied counts
    CameraCapture.jsx      getUserMedia preview and canvas shutter
    Verdict.jsx            the granted/denied result and similarity meter
  pages/                   the two routes
craco.config.js            PostCSS override so Tailwind runs under CRA
```

### Capturing from the camera

A door terminal that can only accept a file picker is the wrong shape for the
problem, so the photo source is a choice between an upload and the device
camera. The captured frame is drawn to a canvas and encoded with `toBlob` into
a JPEG `File`, which means it enters the upload path indistinguishable from a
picked file — [src/api.js](src/api.js) and the backend never learn which one
they are handling. That is also why the presigned policy pins `image/jpeg`:
every browser can produce JPEG from a canvas, so one content type covers both
sources.

Frames are capped at 1280px on the long edge at quality 0.92, which lands a few
hundred KB. Rekognition gains nothing from more pixels — it wants a face that
is reasonably large in frame, not a large frame — and staying well inside the
5 MB signed policy means the size check cannot fail on that path.

Three things a camera needs that are easy to leave out:

- The stream is stopped on unmount, **including when the component unmounts
  while the permission prompt is still open**. Miss that and the stream is
  orphaned and the camera light stays on with nothing rendering it.
- The tab switch is keyed, so moving to Upload actually unmounts the component
  and releases the device rather than hiding a live preview.
- `getUserMedia`'s rejections are translated. `NotReadableError` means "another
  application has the camera" and `NotAllowedError` means "you denied the
  prompt"; shown raw, neither tells the person what to do next.

### Design tokens

The tokens in [src/index.css](src/index.css) are named for the role they play —
`surface`, `sunken`, `border`, `ink`, `muted`, `subtle` — rather than for their
value. That is what lets the dark theme be a list of value swaps at the bottom
of the same file instead of a second set of components, and it stops each
component inventing its own idea of what "muted text" means.

Colour is never the only carrier of the verdict: granted and denied differ by
icon, label, and position as well as hue. Focus is a single `:focus-visible`
rule in the base layer rather than per-component utilities, which drift apart
as soon as someone adds a control and forgets one. Both animations are dropped
under `prefers-reduced-motion`.

### Session check-in log

The frontend keeps an in-memory log of this session's attempts, shown on a
`/history` route with live granted/denied counts in the header. It is in Redux
rather than component state because three components in different parts of the
tree read it, and the header is a sibling of the check-in form rather than its
parent — there is no prop path between them.

The form's own state (selected file, preview URL, status) stays local. `File`
objects and blob URLs are not serialisable, so putting them in the store would
break exactly the devtools guarantee that makes the store worth having.

The log is capped at 50 entries and never persisted. It records who presented
themselves at a door, so writing it to localStorage would leave identifying
records on a shared kiosk with no expiry — the same reasoning behind the
one-day lifecycle rule on the visitor bucket.

Tailwind v4 is configured in CSS (`@theme` in [src/index.css](src/index.css))
rather than a `tailwind.config.js`. It runs through CRACO because Create React
App does not expose its PostCSS config and ejecting to change one line is a
poor trade — see the comment in `craco.config.js` for the failure mode that
setup has if configured the way most guides describe.

Rekognition's face operations are not implemented by moto, so those are driven
with botocore's `Stubber`. That is arguably the better tool anyway: it
validates requests against the real service model, so a misspelled parameter
fails the test instead of being silently accepted.

## Running it

### Tests

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest
```

No AWS credentials are needed or used — the fixtures inject dummy ones so a
test can never reach a real account.

### Deploy the backend

Requires the [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
(`brew install aws-sam-cli`) and credentials with permission to create the
stack.

```bash
cd backend
sam build
sam deploy --guided \
  --parameter-overrides AllowedOrigin=https://kavya1526.github.io
```

`AllowedOrigin` must be the exact origin the frontend is served from — it sets
both API Gateway CORS and the visitor bucket's CORS policy. It is not `*`,
because the browser POSTs directly to S3 and a wildcard would let any page
drive that endpoint.

Then enrol someone:

```bash
aws s3 cp ada.jpg s3://facial-recog-employees-<account-id>/employees/ada_lovelace.jpg
```

The filename is the contract: `first_last.jpg`, lowercase.

### Deploy the frontend

```bash
cp .env.example .env.local          # set REACT_APP_API_BASE_URL from stack outputs
npm install
npm run deploy                      # builds and pushes to the gh-pages branch
```

`npm run deploy` only pushes the branch. The first time, GitHub Pages also has
to be pointed at it: **Settings → Pages → Deploy from a branch → `gh-pages`,
`/ (root)`**. Until that is set the branch exists and the site still 404s,
which looks like a failed deploy but is not one.

The API base URL is inlined into the bundle at build time, so changing it means
rebuilding, not just redeploying. Camera capture needs a secure context —
`getUserMedia` is unavailable over plain http, so it works on GitHub Pages and
on `localhost` but not on a bare-IP dev server.

### Tear down

Rekognition collections and non-empty buckets both block stack deletion, so
they have to be emptied first:

```bash
aws s3 rm s3://facial-recog-visitors-<account-id> --recursive
aws s3 rm s3://facial-recog-employees-<account-id> --recursive
aws cloudformation delete-stack --stack-name facial-recog
```


