export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function assertOnlyKeys(body, allowedKeys) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Тело запроса должно быть объектом JSON');
  }
  const unexpected = Object.keys(body).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    throw new ValidationError(`Неизвестные поля: ${unexpected.join(', ')}`);
  }
}

export function validateClipboardPayload(body) {
  assertOnlyKeys(body, ['html', 'baseRevision']);
  if (typeof body.html !== 'string') {
    throw new ValidationError('Поле html должно быть строкой');
  }
  if (!Number.isInteger(body.baseRevision) || body.baseRevision < 0) {
    throw new ValidationError('Номер версии должен быть целым неотрицательным числом');
  }
  return { html: body.html, baseRevision: body.baseRevision };
}

export function validateForceClipboardPayload(body) {
  assertOnlyKeys(body, ['html']);
  if (typeof body.html !== 'string') {
    throw new ValidationError('Поле html должно быть строкой');
  }
  return { html: body.html };
}
