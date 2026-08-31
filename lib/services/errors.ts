export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class NotFoundError extends ServiceError {
  constructor(message = "资源不存在") {
    super(message, 404);
  }
}

export class ForbiddenError extends ServiceError {
  constructor(message = "权限不足") {
    super(message, 403);
  }
}

export class ValidationError extends ServiceError {
  constructor(message = "参数校验失败") {
    super(message, 422);
  }
}
