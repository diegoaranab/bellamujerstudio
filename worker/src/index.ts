interface Env {
  OPENAI_API_KEY: string;
}

type AssistantRole = "user" | "assistant";

interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

interface AssistantRequestBody {
  messages: AssistantMessage[];
  snapshot?: unknown;
  timezone?: string;
}

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4200",
  "https://diegoaranab.github.io"
]);

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin"
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...buildCorsHeaders(origin)
    }
  });
}

function isValidMessage(value: unknown): value is AssistantMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as Partial<AssistantMessage>;
  return (
    (maybeMessage.role === "user" || maybeMessage.role === "assistant") &&
    typeof maybeMessage.content === "string" &&
    maybeMessage.content.trim().length > 0
  );
}

function buildSystemPrompt(snapshot: unknown, timezone: string): string {
  const snapshotText = JSON.stringify(snapshot ?? {}, null, 2);

  return [
    "Eres una asistente operativa para Bella Mujer Studio (uso interno de dueña/personal).",
    "Responde SIEMPRE en español natural, pulido y práctico.",
    "Prioriza estrictamente la información del snapshot del negocio incluido abajo.",
    "No navegues web, no cites fuentes externas y no inventes datos fuera del snapshot.",
    "Si faltan datos, dilo con claridad y sugiere el siguiente paso útil.",
    "Mantén respuestas concisas pero accionables.",
    "Incluye una advertencia breve solo si el consejo toca temas sensibles (legal, fiscal, médico o seguridad).",
    `Zona horaria de referencia: ${timezone}.`,
    "",
    "Snapshot del negocio (JSON):",
    snapshotText
  ].join("\n");
}

function extractReplyText(responseData: unknown): string | null {
  if (!responseData || typeof responseData !== "object") {
    return null;
  }

  const maybeOutputText = (responseData as { output_text?: unknown }).output_text;
  if (typeof maybeOutputText === "string" && maybeOutputText.trim().length > 0) {
    return maybeOutputText.trim();
  }

  const output = (responseData as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const partText = (part as { text?: unknown }).text;
      if (typeof partText === "string" && partText.trim().length > 0) {
        return partText.trim();
      }
    }
  }

  return null;
}

async function parseOpenAiError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    const message = data?.error?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  } catch {
    // Ignore JSON parse errors and return fallback below.
  }
  return `OpenAI respondió con estado ${response.status}.`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get("Origin");
    const hasOrigin = typeof origin === "string" && origin.length > 0;
    const originAllowed = !hasOrigin || ALLOWED_ORIGINS.has(origin);

    if (request.method === "OPTIONS") {
      if (!originAllowed) {
        return jsonResponse({ ok: false, error: "Origin no permitido." }, 403, origin);
      }
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(origin)
      });
    }

    if (!originAllowed) {
      return jsonResponse({ ok: false, error: "Origin no permitido." }, 403, origin);
    }

    if (pathname !== "/assistant") {
      return jsonResponse({ ok: false, error: "Ruta no encontrada." }, 404, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Método no permitido." }, 405, origin);
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(
        { ok: false, error: "Falta configurar OPENAI_API_KEY en el Worker." },
        500,
        origin
      );
    }

    let body: AssistantRequestBody;
    try {
      body = (await request.json()) as AssistantRequestBody;
    } catch {
      return jsonResponse({ ok: false, error: "JSON inválido en el cuerpo de la solicitud." }, 400, origin);
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return jsonResponse({ ok: false, error: "Se requiere un arreglo de messages no vacío." }, 400, origin);
    }

    const validMessages = body.messages.filter(isValidMessage);
    if (validMessages.length !== body.messages.length) {
      return jsonResponse(
        {
          ok: false,
          error: "Cada mensaje debe incluir role ('user'|'assistant') y content de texto."
        },
        400,
        origin
      );
    }

    const timezone =
      typeof body.timezone === "string" && body.timezone.trim().length > 0
        ? body.timezone.trim()
        : "America/Mexico_City";
    const systemPrompt = buildSystemPrompt(body.snapshot, timezone);

    const input = [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }]
      },
      ...validMessages.map((message) => ({
        role: message.role,
        content: [{ type: "input_text", text: message.content }]
      }))
    ];

    let openAiResponse: Response;
    try {
      openAiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input,
          tools: []
        })
      });
    } catch {
      return jsonResponse(
        { ok: false, error: "No se pudo conectar con el proveedor de IA." },
        502,
        origin
      );
    }

    if (!openAiResponse.ok) {
      const errorMessage = await parseOpenAiError(openAiResponse);
      return jsonResponse({ ok: false, error: `Error del proveedor: ${errorMessage}` }, 502, origin);
    }

    let responseData: unknown;
    try {
      responseData = await openAiResponse.json();
    } catch {
      return jsonResponse(
        { ok: false, error: "La respuesta del proveedor no llegó en formato JSON válido." },
        502,
        origin
      );
    }
    const reply = extractReplyText(responseData);

    if (!reply) {
      return jsonResponse(
        { ok: false, error: "No se pudo obtener texto de respuesta del proveedor." },
        502,
        origin
      );
    }

    return jsonResponse({ ok: true, reply }, 200, origin);
  }
};
