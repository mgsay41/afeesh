"use client";

// Device-side package: new Ably accounts (MAU pricing) reject the classic `ably` package (error 40168).
import type * as AblyTypes from "@ably/pubsub-device";

export type ConnectionStatus = "connecting" | "online" | "offline";
export type Mode = "ably" | "local";

/** `sender` is the publisher's clientId. On Ably it's enforced by the server-issued token. */
type Handler = (name: string, data: unknown, sender: string) => void;

export interface Transport {
  mode: Mode;
  publish(name: string, data: unknown): Promise<void>;
  subscribe(handler: Handler): () => void;
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  close(): void;
}

const channelName = (room: string) => `afeesh:${room}`;

/** Same-browser transport (tabs/windows of one browser). Used when no Ably key is configured. */
function localTransport(room: string, clientId: string): Transport {
  const bc = new BroadcastChannel(channelName(room));
  const handlers = new Set<Handler>();
  bc.onmessage = (e) => handlers.forEach((h) => h(e.data.name, e.data.data, e.data.sender));
  return {
    mode: "local",
    async publish(name, data) {
      bc.postMessage({ name, data, sender: clientId });
      // BroadcastChannel doesn't echo to the sender; Ably does. Mirror Ably's behavior.
      handlers.forEach((h) => h(name, data, clientId));
    },
    subscribe(h) {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    onStatus(cb) {
      cb("online");
      return () => {};
    },
    close: () => bc.close(),
  };
}

function ablyTransport(Ably: typeof import("@ably/pubsub-device"), room: string, clientId: string): Transport {
  const client = Ably.createClient({
    clientId,
    echoMessages: true,
    authCallback: async (_params, cb) => {
      try {
        const res = await fetch(`/api/ably-token?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`token ${res.status}`);
        cb(null, await res.json());
      } catch (e) {
        cb(e instanceof Error ? e.message : String(e), null);
      }
    },
  });
  const channel = client.channels.get(channelName(room));
  return {
    mode: "ably",
    async publish(name, data) {
      await channel.publish(name, data);
    },
    subscribe(h) {
      const listener = (m: AblyTypes.InboundMessage) => h(m.name ?? "", m.data, m.clientId ?? "");
      void channel.subscribe(listener);
      return () => channel.unsubscribe(listener);
    },
    onStatus(cb) {
      const map = (s: string): ConnectionStatus =>
        s === "connected" ? "online" : s === "connecting" || s === "initialized" || s === "disconnected" ? "connecting" : "offline";
      cb(map(client.connection.state));
      const l = (change: AblyTypes.ConnectionStateChange) => {
        // A 4xx from Ably (bad key, rejected SDK, auth) won't fix itself by retrying: show it.
        const code = change.reason?.statusCode ?? 0;
        cb(code >= 400 && code < 500 ? "offline" : map(change.current));
      };
      client.connection.on(l);
      return () => client.connection.off(l);
    },
    close: () => client.close(),
  };
}

export class RealtimeSetupError extends Error {}

/**
 * Uses Ably when the server has a key, otherwise same-browser test mode.
 * Throws RealtimeSetupError when the server has a key but can't issue tokens (e.g. a wrong key).
 */
export async function connect(room: string, clientId: string): Promise<Transport> {
  let probe: Response;
  try {
    probe = await fetch(`/api/ably-token?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
  } catch {
    return localTransport(room, clientId);
  }
  if (probe.status === 503) return localTransport(room, clientId);
  if (!probe.ok) {
    const body = (await probe.json().catch(() => ({}))) as { error?: string };
    throw new RealtimeSetupError(body.error ?? `token ${probe.status}`);
  }
  return ablyTransport(await import("@ably/pubsub-device"), room, clientId);
}
