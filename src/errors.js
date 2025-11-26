export class AuthError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}