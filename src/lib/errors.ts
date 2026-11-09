export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "forbidden") {
    super("forbidden", 403, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "unauthorized") {
    super("unauthorized", 401, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "not_found") {
    super("not_found", 404, message);
  }
}

export class PlanLimitError extends AppError {
  constructor(
    public readonly feature: string,
    message = "plan_limit",
  ) {
    super("plan_limit", 402, message);
  }
}

/** Postgres 23505, whether the driver error is thrown directly or wrapped by Drizzle. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 3; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
