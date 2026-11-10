import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { describe, expect, it, vi } from 'vitest';
import { SecretsManagerPinPepperProvider } from '../src/club-access/club-pin-pepper';

describe('Secrets Manager Club PIN pepper provider', () => {
  it('loads the configured SecretString once and reuses the warm-process cache', async () => {
    const send = vi.fn().mockResolvedValue({ SecretString: 'synthetic-pepper' });
    const provider = new SecretsManagerPinPepperProvider(
      { send },
      'arn:aws:secretsmanager:us-east-1:111111111111:secret:synthetic'
    );
    await expect(provider.getPepper()).resolves.toBe('synthetic-pepper');
    await expect(provider.getPepper()).resolves.toBe('synthetic-pepper');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetSecretValueCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      SecretId: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:synthetic'
    });
  });

  it.each([{}, { SecretString: '' }, { SecretBinary: new Uint8Array([1, 2, 3]) }])(
    'fails closed when SecretString is missing or empty',
    async (result) => {
      const provider = new SecretsManagerPinPepperProvider(
        { send: vi.fn().mockResolvedValue(result) },
        'synthetic-secret-id'
      );
      await expect(provider.getPepper()).rejects.toThrow(/unavailable/);
    }
  );

  it('does not log or attach the SecretString to its failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const provider = new SecretsManagerPinPepperProvider(
      { send: vi.fn().mockRejectedValue(new Error('synthetic SDK failure')) },
      'synthetic-secret-id'
    );
    await expect(provider.getPepper()).rejects.toThrow('synthetic SDK failure');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
