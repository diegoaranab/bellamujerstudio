import {
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
  SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';

export interface SecretsManagerSender {
  send(command: GetSecretValueCommand): Promise<GetSecretValueCommandOutput>;
}

export interface PinPepperProvider {
  getPepper(): Promise<string>;
}

export class SecretsManagerPinPepperProvider implements PinPepperProvider {
  private cached?: Promise<string>;

  constructor(
    private readonly client: SecretsManagerSender,
    private readonly secretId: string
  ) {
    if (typeof secretId !== 'string' || secretId.trim().length === 0) {
      throw new Error('Club PIN pepper secret identifier is required');
    }
  }

  getPepper(): Promise<string> {
    if (!this.cached) {
      this.cached = this.load().catch((error) => {
        this.cached = undefined;
        throw error;
      });
    }
    return this.cached;
  }

  private async load(): Promise<string> {
    const result = await this.client.send(new GetSecretValueCommand({ SecretId: this.secretId }));
    if (typeof result.SecretString !== 'string' || result.SecretString.length === 0) {
      throw new Error('Club PIN pepper secret is unavailable');
    }
    return result.SecretString;
  }
}

export const createRuntimePinPepperProvider = (secretId: string): PinPepperProvider =>
  new SecretsManagerPinPepperProvider(new SecretsManagerClient({}), secretId);
