/** Structured JSON logs (one line per event) — readable in Replit's deployment logs. */
type Level = "debug" | "info" | "warn" | "error";

function serialize(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  const entry: Record<string, unknown> = { level, msg, time: new Date().toISOString() };
  if (data) for (const [k, v] of Object.entries(data)) entry[k] = serialize(v);
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => process.env.NODE_ENV !== "production" && write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
};
