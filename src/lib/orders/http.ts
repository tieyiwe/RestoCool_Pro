import "server-only";
import { NextResponse } from "next/server";
import { OrderError } from "./service";

const STATUS: Record<OrderError["code"], number> = {
  no_seat: 409,
  name_required: 400,
  delivery_required: 400,
  unavailable: 409,
  empty: 400,
  conflict: 409,
  invalid: 400,
  reason_required: 400,
  // On a bus: the hostess hasn't started the trip yet.
  no_trip: 409,
};

/** OrderErrors become JSON answers the screens can explain; anything else is rethrown. */
export function orderErrorResponse(err: unknown): Response {
  if (err instanceof OrderError) return NextResponse.json({ error: err.code, itemIds: err.itemIds }, { status: STATUS[err.code] });
  throw err;
}
