"use client";

import type * as AblyTypes from "ably";

export type ConnectionStatus = "connecting" | "online" | "offline";
export type Mode = "ably" | "local";

type Handler = (name: string, data: unknown) => void;

export interface Transport {
  mode: Mode;
  publish(name: string, data: unknown): Promise<void>;
  subscribe(handler: Handler): () => void;
  onStatus(cb: (s: ConnectionStatus) => void): () => void;
  close(): void;
}

const channelName = (room: string) => `afeesh:${room}`;

/** Same-browser transport (tabs/windows of one browser). Used when no Ably key is configured. */
function localTransport(room: string): Transport {
  const bc = new BroadcastChannel(channelName(room));
  const handlers = new Set<Handler>();
  const self = new Set<Handler>();
  bc.onmessage = (e) => handlers.forEach((h) => h(e.data.name, e.data.data));
  return {
    mode: "local",
    async publish(name, data) {
      bc.postMessage({ name, data });
      // BroadcastChannel doesn't echo to the sender; Ably does. Mirror Ably's behavior.
      self.forEach((h) => h(name, data));
    },
    subscribe(h) {
      handlers.add(h);
      self.add(h);
      return () => {
        handlers.delete(h);
        self.delete(h);
      };
    },
    onStatus(cb) {
      cb("online");
      return () => {};
    },
    close: () => bc.close(),
  };
}

async function ablyTransport(room: string, clientId: string): Promise<Transport> {
  const Ably = await import("ably");
  const client = new Ably.Realtime({
    clientId,
    echoMessages: true,
    authCallback: async (_params, cb) => {
      try {
        const res = await fetch(`/api/ably-token?clientId=${encodeURIComponent(clientId)}`);
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
      const listener = (m: AblyTypes.InboundMessage) => h(m.name ?? "", m.data);
      void channel.subscribe(listener);
      return () => channel.unsubscribe(listener);
    },
    onStatus(cb) {
      const map = (s: string): ConnectionStatus =>
        s === "connected" ? "online" : s === "connecting" || s === "initialized" ? "connecting" : "offline";
      cb(map(client.connection.state));
      const l = (change: AblyTypes.ConnectionStateChange) => cb(map(change.current));
      client.connection.on(l);
      return () => client.connection.off(l);
    },
    close: () => client.close(),
  };
}

/** Uses Ably when the server has a key, otherwise same-browser test mode. */
export async function connect(room: string, clientId: string): Promise<Transport> {
  try {
    const probe = await fetch(`/api/ably-token?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
    if (probe.status === 503) return localTransport(room);
  } catch {
    return localTransport(room);
  }
  return ablyTransport(room, clientId);
}
