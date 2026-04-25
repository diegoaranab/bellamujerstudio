import { LocalStateService } from './local-state.service';

describe('LocalStateService gift card compatibility', () => {
  let service: LocalStateService;

  beforeEach(() => {
    window.localStorage.clear();
    service = new LocalStateService();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('default state includes giftCards as an empty array', () => {
    const state = service.loadState();

    expect(state.giftCards).toEqual([]);
  });

  it('imports older bm_state_v1 objects without giftCards', () => {
    const olderState = {
      version: 1,
      updatedAtISO: '2026-04-24T12:00:00.000Z',
      serviceOverrides: [{ id: 'svc' }],
      inventoryAdjustments: [{ id: 'inv' }],
      clientsOverrides: [{ id: 'client' }],
      transactions: [{ id: 'txn' }],
      assistantChatHistory: [
        { role: 'user', content: 'Hola', createdAtISO: '2026-04-24T12:00:00.000Z' },
        { role: 'assistant', content: 'Hola, bella.', extra: 'ignored' }
      ]
    };

    const imported = service.importState(JSON.stringify(olderState));

    expect(imported?.giftCards).toEqual([]);
    expect(imported?.serviceOverrides).toEqual(olderState.serviceOverrides);
    expect(imported?.inventoryAdjustments).toEqual(olderState.inventoryAdjustments);
    expect(imported?.clientsOverrides).toEqual(olderState.clientsOverrides);
    expect(imported?.transactions).toEqual(olderState.transactions);
    expect(imported?.assistantChatHistory).toEqual([
      { role: 'user', content: 'Hola', createdAtISO: '2026-04-24T12:00:00.000Z' },
      { role: 'assistant', content: 'Hola, bella.' }
    ]);
  });

  it('accepts giftCards when present and requires an array', () => {
    const validState = {
      version: 1,
      updatedAtISO: '2026-04-24T12:00:00.000Z',
      serviceOverrides: [],
      inventoryAdjustments: [],
      clientsOverrides: [],
      transactions: [],
      assistantChatHistory: [],
      giftCards: []
    };
    const invalidState = {
      ...validState,
      giftCards: { nope: true }
    };

    expect(service.importState(JSON.stringify(validState))?.giftCards).toEqual([]);
    expect(service.importState(JSON.stringify(invalidState))).toBeNull();
  });
});
