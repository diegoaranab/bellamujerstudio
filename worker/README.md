# Worker (Assistant Backend)

## Requisitos
- Node.js 18+ (recomendado 20+)
- Cuenta de Cloudflare con Workers habilitado

## Instalar dependencias
```bash
cd worker
npm install
```

## Login de Cloudflare (Wrangler)
```bash
npx wrangler login
```

## Configurar `OPENAI_API_KEY` como secret
```bash
npx wrangler secret put OPENAI_API_KEY
```

## Ejecutar localmente
```bash
npm run dev
```

El endpoint queda disponible en:
- `POST /assistant`

## Deploy
```bash
npm run deploy
```

## URL final en workers.dev
- Wrangler imprime la URL al finalizar el deploy.
- También puedes verla en Cloudflare Dashboard: `Workers & Pages` -> tu Worker -> `Settings` / `Domains`.
