"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { testTelegramSettings, updateTelegramSettings } from "@/app/admin/(protected)/settings/telegram-actions";
import type { getTelegramSettings } from "@/lib/telegram-store";

type TelegramSettings = ReturnType<typeof getTelegramSettings>;

export function TelegramSettingsForm({ settings, deliveryPaused }: { settings: TelegramSettings; deliveryPaused: boolean }) {
  const [saveResult, save, saving] = useActionState(updateTelegramSettings, null);
  const [testResult, test, testing] = useActionState(testTelegramSettings, null);
  const [chatId, setChatId] = useState(settings.chatId);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [clearToken, setClearToken] = useState(false);
  const [savedRevision, setSavedRevision] = useState(settings.revision);
  const tokenInput = useRef<HTMLInputElement>(null);
  const formId = useId();
  const busy = saving || testing;
  const revision = saveResult?.ok ? saveResult.settings.revision : savedRevision;
  const hasToken = saveResult?.ok ? saveResult.settings.hasToken : settings.hasToken;
  const savedChatId = saveResult?.ok ? saveResult.settings.chatId : settings.chatId;

  useEffect(() => {
    if (tokenInput.current) tokenInput.current.value = "";
    if (saveResult?.ok) {
      setChatId(saveResult.settings.chatId);
      setEnabled(saveResult.settings.enabled);
      setClearToken(false);
      setSavedRevision(saveResult.settings.revision);
    }
  }, [saveResult]);

  useEffect(() => {
    if (saving && tokenInput.current) tokenInput.current.value = "";
  }, [saving]);

  return (
    <details className="admin-panel telegram-settings">
      <summary>Уведомления Telegram</summary>
      <p className="admin-muted">Бот отправляет новые заявки с контактами клиентов в указанный чат.</p>
      {deliveryPaused && <p className="admin-muted">Отправка в Telegram приостановлена настройкой сервера.</p>}
      <form action={save} onReset={(event) => event.preventDefault()}>
        <input type="hidden" name="revision" value={revision} />
        <input type="hidden" name="enabled" value={enabled && !clearToken ? "on" : "off"} />
        <input type="hidden" name="clearToken" value={clearToken ? "on" : "off"} />
        {saveResult && (
          <p className={saveResult.ok ? "admin-success" : "admin-error"} role={saveResult.ok ? "status" : "alert"}>
            {saveResult.message}
          </p>
        )}
        <fieldset className="telegram-settings__fields" disabled={busy} aria-label="Параметры Telegram">
          <div className="admin-grid">
            <div className="admin-field">
              <label htmlFor={`${formId}-chat`}>ID чата</label>
              <input id={`${formId}-chat`} name="chatId" autoComplete="off" placeholder="-1001234567890"
                spellCheck={false} maxLength={24} value={chatId} onChange={(event) => setChatId(event.target.value)} />
            </div>
            <div className="admin-field">
              <label htmlFor={`${formId}-token`}>Токен бота</label>
              <input id={`${formId}-token`} ref={tokenInput} name="token" type="password" autoComplete="new-password"
                aria-describedby={`${formId}-token-hint`} disabled={clearToken} maxLength={180} />
              <small id={`${formId}-token-hint`}>{hasToken
                ? <><span>Токен сохранён.</span> Оставьте поле пустым, чтобы сохранить текущий токен.</>
                : "Введите токен бота из BotFather."}</small>
            </div>
          </div>
          <label className="admin-check">
            <input type="checkbox" checked={enabled && !clearToken} onChange={(event) => setEnabled(event.target.checked)}
              disabled={clearToken} />
            <span>Включить уведомления</span>
          </label>
          {hasToken && (
            <label className="admin-check">
              <input type="checkbox" checked={clearToken} onChange={(event) => {
                setClearToken(event.target.checked);
                if (event.target.checked && tokenInput.current) tokenInput.current.value = "";
              }} />
              <span>Удалить сохранённый токен</span>
            </label>
          )}
        </fieldset>
        <button className="admin-button" type="submit" disabled={busy}>
          {saving ? "Сохраняем…" : "Сохранить настройки Telegram"}
        </button>
      </form>
      <form action={test} className="telegram-settings__test">
        <button className="admin-secondary" type="submit" disabled={deliveryPaused || busy || !savedChatId || !hasToken}>
          {testing ? "Отправляем…" : "Отправить тестовое сообщение"}
        </button>
        <p className="admin-muted">Тест использует сохранённые ID чата и токен.</p>
        {testResult && (
          <p className={testResult.ok ? "admin-success" : "admin-error"} role={testResult.ok ? "status" : "alert"}>
            {testResult.message}
          </p>
        )}
      </form>
      {(settings.enabled || settings.pending + settings.sent + settings.failed > 0) && (
        <dl className="telegram-settings__counts">
          <div><dt>В очереди</dt><dd>{settings.pending}</dd></div>
          <div><dt>Отправлено</dt><dd>{settings.sent}</dd></div>
          <div><dt>Не доставлено</dt><dd>{settings.failed}</dd></div>
        </dl>
      )}
    </details>
  );
}
