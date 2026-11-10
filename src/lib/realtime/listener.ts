import "server-only";
import { Client } from "pg";
import { log } from "@/lib/log";
import { CHANNEL, parseEvent, type RtEvent } from "./events";

type Listener = (ev: RtEvent) => void;
type State = { client: Client | null; connecting: Promise<void> | null; listeners: Set<Listener>; retry: number };

// One LISTEN connection per server process, shared by every open stream (kept across hot reloads).
const g = globalThis as unknown as { __rcRealtime?: State };
const state: State = (g.__rcRealtime ??= { client: null, connecting: null, listeners: new Set(), retry: 0 });

async function connect(): Promise<void> {
  if (state.client || state.connecting) return state.connecting ?? undefined;
  state.connecting = (async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL) return;
      const ev = parseEvent(msg.payload);
      if (ev) for (const l of state.listeners) l(ev);
    });
    const drop = (err?: unknown) => {
      if (state.client !== client) return;
      state.client = null;
      log.warn("realtime.listen.lost", { error: err instanceof Error ? err.message : String(err ?? "end") });
      client.end().catch(() => {});
      // Reconnect while someone is listening; screens fall back to polling meanwhile.
      if (state.listeners.size > 0) setTimeout(() => void connect().catch(() => {}), Math.min(30_000, 1000 * 2 ** state.retry++));
    };
    client.on("error", drop);
    client.on("end", () => drop());
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    state.client = client;
    state.retry = 0;
  })().finally(() => {
    state.connecting = null;
  });
  return state.connecting;
}

/** Subscribe to every live event of this process. Returns the unsubscribe function. */
export async function subscribe(fn: Listener): Promise<() => void> {
  state.listeners.add(fn);
  try {
    await connect();
  } catch (err) {
    log.warn("realtime.listen.failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return () => {
    state.listeners.delete(fn);
  };
}

export function listening(): boolean {
  return state.client !== null;
}
