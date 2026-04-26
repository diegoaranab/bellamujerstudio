import { describe, expect, it } from 'vitest';
import { validatePublicGiftCardRequest } from '../src/shared/validation';

const validBody = {
  buyerName: 'Diego',
  buyerPhone: '5551234567',
  buyerEmail: 'diego@example.com',
  recipientName: 'Alejandra',
  recipientPhone: '5557654321',
  amountMXN: 500,
  message: 'Feliz cumple'
};

describe('validatePublicGiftCardRequest', () => {
  it('accepts a valid public gift-card request', () => {
    const result = validatePublicGiftCardRequest(validBody);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toEqual(validBody);
  });

  it('rejects missing buyerName', () => {
    const result = validatePublicGiftCardRequest({ ...validBody, buyerName: ' ' });

    expect(result.ok).toBe(false);
  });

  it('rejects missing buyerPhone', () => {
    const result = validatePublicGiftCardRequest({ ...validBody, buyerPhone: undefined });

    expect(result.ok).toBe(false);
  });

  it('rejects missing recipientName', () => {
    const result = validatePublicGiftCardRequest({ ...validBody, recipientName: null });

    expect(result.ok).toBe(false);
  });

  it('rejects amountMXN below 300', () => {
    const result = validatePublicGiftCardRequest({ ...validBody, amountMXN: 299 });

    expect(result.ok).toBe(false);
  });

  it('trims strings', () => {
    const result = validatePublicGiftCardRequest({
      ...validBody,
      buyerName: '  Diego  ',
      buyerPhone: '  5551234567  ',
      buyerEmail: '  diego@example.com  ',
      recipientName: '  Alejandra  ',
      recipientPhone: '  5557654321  ',
      message: '  Feliz cumple  '
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject(validBody);
  });

  it('limits overly long message', () => {
    const result = validatePublicGiftCardRequest({
      ...validBody,
      message: 'x'.repeat(501)
    });

    expect(result.ok).toBe(false);
  });
});
