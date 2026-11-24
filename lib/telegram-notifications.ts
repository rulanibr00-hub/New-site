import "server-only";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import { claimTelegramJob, finishTelegramJob, getTelegramCredentials, type TelegramJob } from "./telegram-store";
import { formatMoney } from "./tours";

type TelegramCredentials = NonNullable<ReturnType<typeof getTelegramCredentials>>;
const deliveryErrors = {
  rate_limit: "Telegram временно ограничил отправку.",
  invalid_bot: "Telegram не принял токен бота. Проверьте токен.",
  chat_denied: "Telegram не принял сообщение. Проверьте ID чата и доступ бота к нему.",
  temporary: "Telegram временно недоступен.",
  timeout: "Telegram не ответил вовремя.",
  network_error: "Не удалось подключиться к Telegram. Проверьте доступ сервера к api.telegram.org.",
  attempts_exhausted: "Автоматические попытки отправки закончились.",
  credentials_unreadable: "Не удалось прочитать сохранённый токен. Проверьте настройки Telegram.",
};

type SendResult =
  | { ok: true }
  | { ok: false; code: keyof typeof deliveryErrors; retryable: boolean; waitSeconds?: number };

export function describeTelegramDeliveryError(code: string) {
  return Object.hasOwn(deliveryErrors, code) ? deliveryErrors[code as keyof typeof deliveryErrors]
    : "Не удалось доставить уведомление.";
}

const botApi = "https://api.telegram.org";
const sendTimeoutMs = 8000;
const maxReplyBytes = 32 * 1024;
const pollIntervalMs = 10_000;
const maxAttempts = 7;
const maxBatch = 20;
export const telegramDeliveryPaused = process.env.TOO_TURY_TELEGRAM_PAUSED === "1";
const dayFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", dateStyle: "long" });
const instantFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Bishkek",
  dateStyle: "long",
  timeStyle: "short",
});
const daysPlural = new Intl.PluralRules("ru-RU");

function singleLine(value: string, fallback = "—") {
  return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/gu, " ").trim() || fallback;
}

function printDate(value: string, format: Intl.DateTimeFormat) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? format.format(date) : singleLine(value);
}

export function formatTelegramBooking(booking: TelegramJob["booking"]) {
  const plural = daysPlural.select(booking.days);
  const dayWord = plural === "one" ? "день" : plural === "few" ? "дня" : "дней";

  return [
    `Новая заявка на тур ${singleLine(booking.id)}`,
    "",
    `Тур — ${singleLine(booking.tour_title)}`,
    `Категория — ${singleLine(booking.category, "Без категории")}`,
    `Дата выезда — ${printDate(booking.departure_date, dayFormat)}`,
    `Длительность — ${booking.days} ${dayWord}`,
    `Участников — ${booking.people}`,
    `Гид — ${booking.with_guide ? "с гидом" : "без гида"}`,
    "",
    `Клиент — ${singleLine(booking.name)}`,
    `Контакт — ${singleLine(booking.contact)}`,
    "",
    `Стоимость тура — ${formatMoney(booking.base)}`,
    `Доплата за гида — ${formatMoney(booking.guide)}`,
    `Итого за группу — ${formatMoney(booking.total)}`,
    "",
    `Заявка получена — ${printDate(booking.created_at, instantFormat)} (Бишкек)`,
  ].join("\n");
}

function secondsFrom(value: unknown) {
  const seconds = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

type TelegramReply = {
  ok?: boolean;
  error_code?: number;
  parameters?: { retry_after?: number };
};

async function readReply(response: IncomingMessage): Promise<TelegramReply | null> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of response) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxReplyBytes) return null;
    chunks.push(bytes);
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed as TelegramReply : null;
  } catch {
    return null;
  }
}

function requestMessage(token: string, body: string, signal: AbortSignal) {
  // Bot API places the credential in the URL path. Use native HTTPS so Next's
  // fetch cache, logs and traces never receive that URL.
  return new Promise<{ status: number; retryAfter: unknown; reply: TelegramReply | null }>((resolve, reject) => {
    const request = https.request(new URL(`${botApi}/bot${token}/sendMessage`), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      signal,
    }, (response) => {
      void readReply(response).then((reply) => resolve({
        status: response.statusCode ?? 0,
        retryAfter: response.headers["retry-after"],
        reply,
      }), reject);
    });
    request.once("error", reject);
    request.end(body);
  });
}

async function sendMessage({ token, chatId }: TelegramCredentials, text: string): Promise<SendResult> {
  const signal = AbortSignal.timeout(sendTimeoutMs);
  try {
    const { status: httpStatus, retryAfter, reply } = await requestMessage(token, JSON.stringify({
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    }), signal);
    const successfulStatus = httpStatus >= 200 && httpStatus < 300;
    if (successfulStatus && reply?.ok === true) return { ok: true };

    const status = successfulStatus ? reply?.error_code : httpStatus;
    if (status === 429) {
      const waitSeconds = secondsFrom(reply?.parameters?.retry_after) ?? secondsFrom(retryAfter);
      return { ok: false, code: "rate_limit", retryable: true, waitSeconds };
    }
    if (status === 401 || status === 404) {
      return { ok: false, code: "invalid_bot", retryable: false };
    }
    if (status === 400 || status === 403) {
      return { ok: false, code: "chat_denied", retryable: false };
    }
    return { ok: false, code: "temporary", retryable: true };
  } catch {
    if (signal.aborted) return { ok: false, code: "timeout", retryable: true };
    return { ok: false, code: "network_error", retryable: true };
  }
}

export async function sendTelegramTest(): Promise<{ ok: boolean; message: string }> {
  if (telegramDeliveryPaused) return { ok: false, message: "Отправка в Telegram приостановлена настройкой сервера." };

  try {
    const credentials = getTelegramCredentials();
    if (!credentials) return { ok: false, message: "Сначала сохраните ID чата и токен бота." };

    const result = await sendMessage(credentials, "Тестовое уведомление «Тоо Туры». Telegram подключён.");
    return result.ok ? { ok: true, message: "Тестовое сообщение отправлено в Telegram." }
      : { ok: false, message: describeTelegramDeliveryError(result.code) };
  } catch {
    return { ok: false, message: "Не удалось прочитать настройки Telegram." };
  }
}

async function deliverQueuedJobs() {
  for (let i = 0; i < maxBatch; i++) {
    const job = claimTelegramJob();
    if (!job) break;

    if (job.attempt > maxAttempts) {
      finishTelegramJob(job, { status: "failed", error: "attempts_exhausted" });
      continue;
    }

    const result = await sendMessage(job, formatTelegramBooking(job.booking));
    if (result.ok) {
      finishTelegramJob(job, { status: "sent" });
    } else if (result.retryable && job.attempt < maxAttempts) {
      const backoffSeconds = Math.min(2 ** job.attempt, 300);
      const waitSeconds = Math.max(backoffSeconds, result.waitSeconds ?? 0);
      if (waitSeconds > 24 * 60 * 60) {
        finishTelegramJob(job, { status: "failed", error: result.code });
      } else {
        finishTelegramJob(job, { status: "retry", retryAt: Date.now() + waitSeconds * 1000, error: result.code });
      }
    } else {
      finishTelegramJob(job, { status: "failed", error: result.code });
    }
    if (!result.ok && result.code === "rate_limit") break;
  }
}

type WorkerState = { running: boolean; started: boolean };
const shared = globalThis as typeof globalThis & { tooTuryTelegramWorker?: WorkerState };
const worker = shared.tooTuryTelegramWorker ??= { running: false, started: false };

export function triggerTelegramDelivery() {
  if (telegramDeliveryPaused || worker.running) return;
  worker.running = true;
  setImmediate(() => {
    void deliverQueuedJobs().catch(() => {
      console.error("Не удалось обработать очередь уведомлений Telegram.");
    }).finally(() => {
      worker.running = false;
    });
  });
}

export function startTelegramDeliveryWorker() {
  if (telegramDeliveryPaused || worker.started) return;
  worker.started = true;
  setInterval(triggerTelegramDelivery, pollIntervalMs).unref();
  triggerTelegramDelivery();
}
