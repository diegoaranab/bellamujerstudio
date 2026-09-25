import { describe, expect, it } from 'vitest';
import { corsHeaders } from '../src/shared/cors';
import { resolveFrontendConfiguration } from '../src/shared/frontend-configuration';

const allowedOrigins = ['http://localhost:4200', 'https://diegoaranab.github.io'];

describe('CORS headers', () => {
  it('authorizes a known origin and declares the required request headers', () => {
    expect(corsHeaders('https://diegoaranab.github.io', allowedOrigins)).toEqual({
      'Access-Control-Allow-Origin': 'https://diegoaranab.github.io',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      Vary: 'Origin'
    });
  });

  it.each([['an unknown origin', 'https://untrusted.example'], ['a missing origin', undefined]])(
    'does not authorize %s',
    (_label, origin) => {
      const headers = corsHeaders(origin, allowedOrigins);

      expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
      expect(headers.Vary).toBe('Origin');
    }
  );
});

describe('frontend configuration', () => {
  it('derives CORS origins from callback URLs and accepts optional HTTPS production URLs', () => {
    expect(resolveFrontendConfiguration('https://studio.example.com/app')).toEqual({
      urls: [
        'http://localhost:4200/',
        'https://diegoaranab.github.io/bellamujerstudio/',
        'https://studio.example.com/app/'
      ],
      origins: [
        'http://localhost:4200',
        'https://diegoaranab.github.io',
        'https://studio.example.com'
      ]
    });
  });

  it('rejects an insecure custom production URL', () => {
    expect(() => resolveFrontendConfiguration('http://studio.example.com')).toThrow(
      'Frontend URL must use HTTPS'
    );
  });
});
