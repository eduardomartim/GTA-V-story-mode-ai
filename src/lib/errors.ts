export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "payload_too_large"
  | "ai_unavailable"
  | "database_unavailable"
  | "retrieval_failed"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  payload_too_large: 413,
  rate_limited: 429,
  ai_unavailable: 503,
  database_unavailable: 503,
  retrieval_failed: 502,
  internal: 500,
};

/** Safe, user-facing messages (PT/EN). Internal details are logged server-side only — never returned. */
export const SAFE_MESSAGES: Record<ErrorCode, { pt: string; en: string }> = {
  invalid_request: { pt: "Não entendi essa solicitação. Verifique a mensagem e tente novamente.", en: "I couldn't understand that request. Please check your message and try again." },
  unauthorized: { pt: "Acesso não autorizado.", en: "Unauthorized." },
  payload_too_large: { pt: "A solicitação é grande demais.", en: "The request is too large." },
  rate_limited: { pt: "Muitas perguntas em pouco tempo. Aguarde alguns segundos e tente novamente.", en: "Too many requests. Please wait a few seconds and try again." },
  ai_unavailable: { pt: "O provedor de IA está indisponível agora. Tente novamente em instantes.", en: "The AI provider is unavailable right now. Please try again shortly." },
  database_unavailable: { pt: "Não consegui consultar a base de conhecimento agora. Tente novamente.", en: "I couldn't reach the knowledge base right now. Please try again." },
  retrieval_failed: { pt: "A busca na base de conhecimento falhou. Tente novamente.", en: "Knowledge-base retrieval failed. Please try again." },
  internal: { pt: "Algo deu errado do nosso lado. Tente novamente.", en: "Something went wrong on our side. Please try again." },
};

export class AppError extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message?: string, readonly retryAfterSec?: number) {
    super(message ?? code);
    this.name = "AppError";
    this.status = STATUS[code];
  }
}
