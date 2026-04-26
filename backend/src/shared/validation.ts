import { PublicGiftCardRequest } from './gift-card-model';

const MAX_LENGTHS = {
  name: 120,
  phone: 30,
  email: 160,
  message: 500
} as const;

const MIN_AMOUNT_MXN = 300;

export interface ValidationSuccess {
  ok: true;
  value: PublicGiftCardRequest;
}

export interface ValidationFailure {
  ok: false;
  code: 'VALIDATION_ERROR';
  issues: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const failure = (issues: string[]): ValidationFailure => ({
  ok: false,
  code: 'VALIDATION_ERROR',
  issues
});

const trimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim();
};

const optionalTrimmedString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = trimmedString(value);

  return trimmed ? trimmed : undefined;
};

const requireString = (
  value: unknown,
  field: string,
  maxLength: number,
  issues: string[]
): string | undefined => {
  const trimmed = trimmedString(value);

  if (!trimmed) {
    issues.push(`${field} es requerido.`);
    return undefined;
  }

  if (trimmed.length > maxLength) {
    issues.push(`${field} es demasiado largo.`);
    return undefined;
  }

  return trimmed;
};

const optionalString = (
  value: unknown,
  field: string,
  maxLength: number,
  issues: string[]
): string | undefined => {
  const trimmed = optionalTrimmedString(value);

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    issues.push(`${field} es demasiado largo.`);
    return undefined;
  }

  return trimmed;
};

export const validatePublicGiftCardRequest = (body: unknown): ValidationResult => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return failure(['La solicitud debe ser un objeto JSON.']);
  }

  const input = body as Record<string, unknown>;
  const issues: string[] = [];

  const buyerName = requireString(input.buyerName, 'buyerName', MAX_LENGTHS.name, issues);
  const buyerPhone = requireString(input.buyerPhone, 'buyerPhone', MAX_LENGTHS.phone, issues);
  const buyerEmail = optionalString(input.buyerEmail, 'buyerEmail', MAX_LENGTHS.email, issues);
  const recipientName = requireString(input.recipientName, 'recipientName', MAX_LENGTHS.name, issues);
  const recipientPhone = optionalString(
    input.recipientPhone,
    'recipientPhone',
    MAX_LENGTHS.phone,
    issues
  );
  const message = optionalString(input.message, 'message', MAX_LENGTHS.message, issues);

  if (typeof input.amountMXN !== 'number' || !Number.isFinite(input.amountMXN)) {
    issues.push('amountMXN debe ser un número.');
  } else if (input.amountMXN < MIN_AMOUNT_MXN) {
    issues.push('amountMXN debe ser de al menos 300.');
  }

  if (issues.length > 0 || !buyerName || !buyerPhone || !recipientName) {
    return failure(issues);
  }

  return {
    ok: true,
    value: {
      buyerName,
      buyerPhone,
      ...(buyerEmail ? { buyerEmail } : {}),
      recipientName,
      ...(recipientPhone ? { recipientPhone } : {}),
      amountMXN: input.amountMXN as number,
      ...(message ? { message } : {})
    }
  };
};
