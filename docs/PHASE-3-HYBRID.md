# Optional extension — Hybrid Vision (NOT in default SDK)

## Why

The general COCO object detector cannot identify many household-waste items and often mislabels others. We now separate **real-time local localization** from an **optional remote visual description of one still image**.

## Implemented in this prototype

- `captureWasteSnapshot(video, { boundingBox? })`: creates a cropped JPEG locally using Canvas, with bounding-box padding. With no detection it crops the center of the video instead, so a missed detection does not block the workflow.
- `recognizeWasteSnapshot({ snapshot, provider, consent, localHint })`: passes the chosen JPEG to an optional app-provided recognition function **only when consent is explicitly true**. Missing consent returns `consent_required`; a missing provider returns `provider_unavailable`. Free-form provider text does not directly become disposal advice.
- `createHttpRecognitionProvider({ url })`: transport to an **application-owned HTTPS proxy**; sends a `multipart/form-data` request with `image` (JPEG) and optional `localHint` (untrusted hint). No API secrets are included.
- The previous hybrid demonstration UI was **removed from the default demo**. The helper functions remain importable through the explicit extension entry point.
- All camera images stay local unless the user approves a *specific preview image* and a configured provider is available.

## State machine

```text
local camera stream
  -> detector optional, region marked
  -> user presses snapshot OR opts in to local auto-capture
  -> local crop JPEG generated
  -> user inspects cropped photo
  -> user explicitly clicks "Send image to AI" [requires configured proxy]
     -> app-owned proxy
     -> authorized external vision provider
     -> validated {status,label}
     -> human confirmation -> Samurai classifier / municipal rule engine
```

## Provider contract (not the native Toritsu AI API)

The default GitHub Pages demo is now **local-only** and has no cloud upload UI. This optional extension is available only by explicit import. GitHub Pages itself which cannot host a server-side secret-bearing endpoint. The backend **must** be supplied separately; the actual native Toritsu AI image-upload payload, attachment authorization and CORS/allowed-client rules have not been confirmed.

Example application-owned endpoint contract (proposed, **not** evidence of a working Tokyo-school AI integration):

- Request: `POST /api/vision/recognize` with `multipart/form-data` fields `image` (one cropped JPEG) and `localHint` (optional).
- Success: `{"status":"recognized","label":"beverage_can"}`
- Rejected/uncertain: `{"status":"unknown"}`
- Server failures should use an error HTTP status and no secrets in the response.

Backend responsibilities: authorize user/session, restrict rate and upload size, validate image MIME/bytes, use only institution-authorized API credentials, enforce the provider's exact image request format, validate/normalize JSON responses, prevent arbitrary relays, and apply retention/privacy rules. In production also enforce authentication or anti-CSRF measures on the proxy; the included test transport uses `credentials: "omit"`.

**Never put school token/JWT/API key in Vite env variables or GitHub Pages JavaScript.** Any `VITE_*` variable is public in compiled files. A server-to-server adapter is required for credentials.

### Frontend SDK usage

```js
import {
  captureWasteSnapshot,
  recognizeWasteSnapshot,
  createHttpRecognitionProvider
} from "waste-vision/extensions/hybrid";

// After the user starts the camera:
const snapshot = await captureWasteSnapshot(video, {
  boundingBox: scanner.latestResult.primaryObject?.boundingBox ?? null
});

// After showing a preview AND receiving explicit approval:
const provider = createHttpRecognitionProvider({ url: "/api/vision/recognize" });
const result = await recognizeWasteSnapshot({
  snapshot,
  provider,
  consent: true,
  localHint: scanner.latestResult.text
});
console.log(result.status, result.text);
```

When integrating into a third-party app, `provider` can also be a supplied `async ({image,localHint,signal}) => ({label: "bottle"})` function.

### Default demo and extension boundary

The main demo no longer imports the hybrid functionality. The extension code is
retained, but **no default UI, network client or remote recognition path runs**.

When an application opts in, it should supply a separate approved HTTPS backend
and explicit per-image consent. Any Vite-exposed URL is public; never put an API
credential in a bundled environment variable. This is not a Tokyo-school AI
integration, only a transport contract.

## Policy boundaries

Tokyo's school AI service supports image input in its *chat product*. This does not, by itself, establish public API support for image attachments or authorization to connect it to an arbitrary public application.

The Tokyo Metropolitan Board of Education's school GenAI guideline restricts use to education-related purposes and forbids handling personal/confidential information absent an approved exception. **A school-only educational prototype may be eligible subject to administrator approval, but a public Samurai product for tourists must not assume access to the school-only service.** Use a separately authorized provider for public deployment.

The crop only reduces incidental background content. There is **no face or PII detection** in v0.3; users must inspect the preview and avoid sending people, names, addresses, or identifying details. Canvas-encoded images omit original EXIF metadata; the displayed pixels can still reveal personal data. Do not enable unconditional image upload.

## Practical accuracy strategy

- Remote AI is called once per selected crop rather than on every frame.
- The remote visual model is asked for **object name only**, not material or municipal disposal class.
- The local class name is an optional hint that the remote provider should treat as uncertain, not a fact; A/B-test remote classification with and without the hint to avoid anchoring.
- Responses should support `unknown` (no forced confident answer). Require user confirmation before passing class labels to disposal logic.
- To measure real gains, evaluate at least the same held-out 6-class+negative set used in [Phase 3](PHASE-3-PLAN.md), comparing local-only, remote-only, and hybrid accepted-error/coverage/latency.

## Remaining work

- [x] Snapshot crop and no-detection center fallback
- [x] Explicit human approval gate before provider callback
- [x] Provider-neutral HTTP transport and local demo
- [ ] Verify Toritsu AI's **actual** image-upload API with an institution-approved account and authorized usage
- [ ] Implement server proxy with authentication, security controls, and provider response parser
- [ ] Validate remote responses with a strict taxonomy, explicit unknown and content-filtering rules
- [ ] Add on-device preview redaction/facial detection and timeout/cancellation UX
- [ ] Conduct real-device accuracy / privacy / latency evaluation
- [ ] Develop non-school provider for public Samurai integration
