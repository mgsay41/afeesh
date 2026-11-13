// Server-side package: new Ably accounts (MAU pricing) reject the classic `ably` package (error 40168).
import { createHttpClient } from "@ably/pubsub-server";

/**
 * Issues a short-lived Ably token request so the API key never reaches the browser.
 * Returns 503 when ABLY_API_KEY isn't set — the client then falls back to same-browser
 * test mode (BroadcastChannel), handy for local development.
 */
export async function GET(request: Request) {
  // Forgive copy-paste slips: surrounding spaces, line breaks or quotes.
  const key = process.env.ABLY_API_KEY?.trim().replace(/^["']|["']$/g, "").trim();
  if (!key) return Response.json({ error: "ABLY_API_KEY is not configured" }, { status: 503 });

  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(clientId)) {
    return Response.json({ error: "invalid clientId" }, { status: 400 });
  }

  try {
    const rest = createHttpClient({ key });
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId,
      capability: { "afeesh:*": ["publish", "subscribe"] },
      ttl: 4 * 60 * 60 * 1000,
    });
    return Response.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Usually a malformed ABLY_API_KEY. Report only its shape, never the key itself.
    const hint = /^[\w-]+\.[\w-]+:\S+$/.test(key)
      ? "format looks right, but Ably rejected it"
      : !key.includes(":")
        ? "missing the ':' part. Copy the whole key (appId.keyId:secret)"
        : /\s/.test(key)
          ? "contains spaces or line breaks"
          : "expected format appId.keyId:secret";
    return Response.json({ error: `ABLY_API_KEY looks invalid: ${hint}` }, { status: 500 });
  }
}
