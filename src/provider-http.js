/**
 * Optional HTTP bridge to an application-owned image recognition backend.
 * This is NOT the Tokyo school AI API client: its image request schema is not
 * confirmed. Your backend must authenticate and adapt the provider's protocol.
 * Never include school-issued JWTs or API keys in shipped frontend code.
 */
export function createHttpRecognitionProvider({
  url,
  timeoutMs = 15000
} = {}) {
  if (!url || typeof url !== "string") throw new TypeError("A backend URL is required.");
  const destination = new URL(url, globalThis.location?.href ?? "http://localhost/");
  if (destination.protocol !== "https:" &&
      !(destination.hostname === "localhost" || destination.hostname === "127.0.0.1")) {
    throw new TypeError("The recognition proxy must use HTTPS.");
  }
  if (destination.username || destination.password || destination.searchParams.has("token")) {
    throw new TypeError("Credentials must not be included in the proxy URL.");
  }

  return async ({ image, contentType = "image/jpeg", localHint = null, signal } = {}) => {
    if (!(image instanceof Blob) || contentType !== "image/jpeg") {
      throw new TypeError("A cropped JPEG Blob is required.");
    }
    if (image.size > 4 * 1024 * 1024) throw new RangeError("Image exceeds 4 MiB.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop, { once: true });
    const form = new FormData();
    form.append("image", image, "waste-object.jpg");
    if (localHint) form.append("localHint", String(localHint).slice(0, 80));

    try {
      const response = await fetch(destination.toString(), {
        method: "POST",
        body: form,
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("Recognition proxy returned HTTP " + response.status);
      const data = await response.json();
      if (!data || typeof data !== "object") throw new Error("Invalid proxy response");
      return data;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
  };
}
