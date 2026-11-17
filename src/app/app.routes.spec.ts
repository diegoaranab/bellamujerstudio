import { routes } from './app.routes';

describe('Club administrator routes', () => {
  it('uses the PII-safe Club route hierarchy and canonical redirects', () => {
    const admin = routes.find((route) => route.path === 'admin');
    const club = admin?.children?.find((route) => route.path === 'club');
    const children = club?.children ?? [];

    expect(club?.providers).toBeTruthy();
    expect(children.find((route) => route.path === '')).toMatchObject({
      redirectTo: 'clientas',
      pathMatch: 'full'
    });
    expect(children.find((route) => route.path === 'clientas/:opaqueClientId')).toMatchObject({
      redirectTo: 'clientas/:opaqueClientId/resumen',
      pathMatch: 'full'
    });
    expect(children.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        'clientas',
        'clientas/nueva',
        'clientas/:opaqueClientId/resumen',
        'clientas/:opaqueClientId/visita',
        'clientas/:opaqueClientId/historial',
        'clientas/:opaqueClientId/acceso'
      ])
    );
  });
});
