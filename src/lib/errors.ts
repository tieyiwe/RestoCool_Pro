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
