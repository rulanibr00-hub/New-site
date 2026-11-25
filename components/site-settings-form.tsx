"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateSiteSettings } from "@/app/admin/(protected)/settings/actions";
import type { SiteSettings } from "@/lib/catalog-store";

export function SiteSettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, save, pending] = useActionState(updateSiteSettings, { revision: settings.revision });
  const [values, setValues] = useState(settings);
  const message = useRef<HTMLParagraphElement>(null);

  useEffect(() => { message.current?.focus(); }, [state]);

  function change<K extends keyof SiteSettings>(field: K, value: SiteSettings[K]) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  return (
    <form className="admin-settings" action={save} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="revision" value={state.revision} />
      <input type="hidden" name="demo" value={values.demo ? "on" : "off"} />
      {state.error && <p className="admin-error" tabIndex={-1} ref={message} role="alert">{state.error}</p>}
      {state.saved && <p className="admin-success" tabIndex={-1} ref={message} role="status">Настройки сохранены.</p>}
      <fieldset className="admin-panel" disabled={pending}>
        <h2>Публичные страницы</h2>
        <div className="admin-grid">
          <label className="admin-field">Название сайта
            <input name="name" maxLength={70} required value={values.name} onChange={(event) => change("name", event.target.value)} />
          </label>
          <label className="admin-field">Заголовок главной
            <input name="headline" maxLength={120} required value={values.headline} onChange={(event) => change("headline", event.target.value)} />
          </label>
          <label className="admin-field admin-field-wide">Подзаголовок главной
            <input name="tagline" maxLength={240} required value={values.tagline} onChange={(event) => change("tagline", event.target.value)} />
          </label>
          <label className="admin-field admin-field-wide">О нас
            <textarea name="about" rows={6} maxLength={6000} value={values.about} onChange={(event) => change("about", event.target.value)} />
          </label>
        </div>
      </fieldset>
      <fieldset className="admin-panel" disabled={pending}>
        <h2>Контакты и публикация</h2>
        <div className="admin-grid">
          <label className="admin-field">Электронная почта
            <input name="email" type="email" maxLength={254} value={values.email} onChange={(event) => change("email", event.target.value)} />
          </label>
          <label className="admin-field">Телефон
            <input name="phone" type="tel" maxLength={48} value={values.phone} onChange={(event) => change("phone", event.target.value)} />
          </label>
          <label className="admin-field">WhatsApp
            <input name="whatsapp" type="tel" maxLength={48} placeholder="+996 555 123 456" value={values.whatsapp} onChange={(event) => change("whatsapp", event.target.value)} />
          </label>
          <label className="admin-field">Telegram
            <input name="telegram" maxLength={120} placeholder="username" value={values.telegram} onChange={(event) => change("telegram", event.target.value)} />
          </label>
          <label className="admin-field">Instagram
            <input name="instagram" maxLength={120} placeholder="username" value={values.instagram} onChange={(event) => change("instagram", event.target.value)} />
          </label>
        </div>
        <p className="admin-muted">Номер WhatsApp укажите в международном формате. В Telegram и Instagram можно вставить имя пользователя или ссылку на профиль.</p>
        <label className="admin-check">
          <input type="checkbox" checked={values.demo} onChange={(event) => change("demo", event.target.checked)} />
          <span>Демонстрационный режим</span>
        </label>
        <p className="admin-muted">В деморежиме посетители видят отметку о тестовом каталоге. Перед выключением проверьте опубликованные программы, цены, даты и контакты.</p>
      </fieldset>
      <div className="admin-actions">
        <button className="admin-button" type="submit" disabled={pending}>{pending ? "Сохраняем…" : "Сохранить настройки"}</button>
      </div>
    </form>
  );
}
