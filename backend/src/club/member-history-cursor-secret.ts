import {
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
  SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';

export interface MemberHistoryCursorSecretProvider {
  getSecret(): Promise<string>;
}

interface SecretsManagerSender {
  send(command: GetSecretValueCommand): Promise<GetSecretValueCommandOutput>;
}

export class SecretsManagerMemberHistoryCursorSecretProvider
  implements MemberHistoryCursorSecretProvider {
  private cached?: Promise<string>;

  constructor(
    private readonly client: SecretsManagerSender,
    private readonly secretId: string
  ) {
    if (typeof secretId !== 'string' || secretId.trim().length === 0) {
      throw new Error('Member history cursor secret identifier is required');
    }
  }

  getSecret(): Promise<string> {
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
      throw new Error('Member history cursor secret is unavailable');
    }
    return result.SecretString;
  }
}

export const createRuntimeMemberHistoryCursorSecretProvider = (
  secretId: string
): MemberHistoryCursorSecretProvider =>
  new SecretsManagerMemberHistoryCursorSecretProvider(new SecretsManagerClient({}), secretId);
