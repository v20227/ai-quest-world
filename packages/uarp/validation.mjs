export class UarpValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "UarpValidationError";
    this.path = path;
  }
}

export function isPlainRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertRecord(value, path) {
  if (!isPlainRecord(value)) {
    throw new UarpValidationError(path, "must be an object");
  }

  return value;
}

export function assertString(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    throw new UarpValidationError(path, allowEmpty ? "must be a string" : "must be a non-empty string");
  }

  return value;
}

export function assertBoolean(value, path) {
  if (typeof value !== "boolean") {
    throw new UarpValidationError(path, "must be a boolean");
  }

  return value;
}

export function assertInteger(value, path) {
  if (!Number.isInteger(value)) {
    throw new UarpValidationError(path, "must be an integer");
  }

  return value;
}

export function assertNonNegativeInteger(value, path) {
  assertInteger(value, path);
  if (value < 0) {
    throw new UarpValidationError(path, "must be non-negative");
  }

  return value;
}

export function assertNonNegativeNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new UarpValidationError(path, "must be a finite non-negative number");
  }

  return value;
}

export function assertAllowed(value, path, allowed) {
  if (!allowed.includes(value)) {
    throw new UarpValidationError(path, `must be one of: ${allowed.join(", ")}`);
  }

  return value;
}

export function assertOptionalString(value, path, options) {
  if (value !== undefined) {
    assertString(value, path, options);
  }
}

export function assertOptionalBoolean(value, path) {
  if (value !== undefined) {
    assertBoolean(value, path);
  }
}

export function assertOptionalInteger(value, path) {
  if (value !== undefined) {
    assertInteger(value, path);
  }
}

export function assertOptionalNonNegativeInteger(value, path) {
  if (value !== undefined) {
    assertNonNegativeInteger(value, path);
  }
}

export function assertOptionalNonNegativeNumber(value, path) {
  if (value !== undefined) {
    assertNonNegativeNumber(value, path);
  }
}

export function assertOptionalAllowed(value, path, allowed) {
  if (value !== undefined) {
    assertAllowed(value, path, allowed);
  }
}

export function assertStringArray(value, path) {
  if (!Array.isArray(value)) {
    throw new UarpValidationError(path, "must be an array");
  }

  value.forEach((item, index) => assertString(item, `${path}[${index}]`));
  return value;
}
