import * as Ably from "ably";

/**
 * Issues a short-lived Ably token request so the API key never reaches the browser.
 * Returns 503 when ABLY_API_KEY isn't set — the client then falls back to same-browser
 * test mode (BroadcastChannel), handy for local development.
 */
export async function GET(request: Request) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return Response.json({ error: "ABLY_API_KEY is not configured" }, { status: 503 });

  const clientId = new URL(request.url).searchParams.get("clientId") ?? "";
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(clientId)) {
    return Response.json({ error: "invalid clientId" }, { status: 400 });
  }

  const rest = new Ably.Rest({ key });
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId,
    capability: { "afeesh:*": ["publish", "subscribe"] },
    ttl: 4 * 60 * 60 * 1000,
  });
  return Response.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
}
