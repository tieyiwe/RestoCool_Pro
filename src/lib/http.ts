import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { log } from "./log";
import { markActivity } from "@/lib/usage/presence";

/** Wrap a route handler: AppErrors map to their status; anything else is a logged 500. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    // Requests mean someone is using RestoCool: background jobs may run (see usage/presence).
    markActivity();
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AppError) return NextResponse.json({ error: err.code }, { status: err.status });
      if (err instanceof ZodError) return NextResponse.json({ error: "invalid_input", issues: err.issues }, { status: 400 });
      log.error("unhandled_route_error", { err });
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
  };
}
