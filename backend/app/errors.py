class AppError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, code: str | None = None, status: int | None = None):
        super().__init__(code or self.code)
        if code:
            self.code = code
        if status:
            self.status = status


class Unauthorized(AppError):
    status = 401
    code = "unauthorized"


class Forbidden(AppError):
    status = 403
    code = "forbidden"


class NotFound(AppError):
    status = 404
    code = "not_found"


class Conflict(AppError):
    status = 409
    code = "conflict"


class Blocked(AppError):
    """Raised when the egress or ingress sanitizer refuses a payload."""

    status = 422
    code = "request_blocked"
