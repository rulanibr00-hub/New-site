"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { AdminMediaField } from "@/components/admin-media-field";
import { AdminRouteEditor } from "@/components/admin-route-editor";
import type { ManagedTour } from "@/lib/catalog-store";
import { tourDifficulties, type Tour } from "@/lib/tours";
import "../app/admin/tours.css";

export type AdminTourState = {
  revision: number | null;
  publishedRevision: number | null;
  notice: string | null;
  error: string | null;
};

type Props = {
  record?: ManagedTour;
  action: (previous: AdminTourState, data: FormData) => Promise<AdminTourState>;
};

const textFields = [
  { name: "title", label: "Название тура", limit: 120 },
  { name: "region", label: "Регион", limit: 100 },
  { name: "category", label: "Категория", limit: 100 },
  { name: "departure", label: "Место выезда", limit: 100 },
] as const;

type TextField = typeof textFields[number]["name"];

const weekdays = [
  [1, "Понедельник"], [2, "Вторник"], [3, "Среда"], [4, "Четверг"],
  [5, "Пятница"], [6, "Суббота"], [0, "Воскресенье"],
] as const;

type OptionInput = {
  id: string;
  days: string;
  pricePerPerson: string;
  guidePerGroup: string;
};

type StepInput = Tour["program"][number] & { key: number };

function fieldNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function optionFields(tour?: Tour): OptionInput[] {
  return tour?.options.map((option) => ({
    id: option.id,
    days: fieldNumber(option.days || null),
    pricePerPerson: fieldNumber(option.pricePerPerson || null),
    guidePerGroup: fieldNumber(option.guidePerGroup),
  })) ?? [];
}

export function AdminTourForm({ record, action }: Props) {
  const initial = record?.draft;
  const formId = useId();
  const [status, submit, pending] = useActionState(action, {
    revision: record?.revision ?? null,
    publishedRevision: record?.publishedRevision ?? null,
    notice: null,
    error: null,
  });
  const [fields, setFields] = useState<Record<TextField, string>>({
    title: initial?.title ?? "",
    region: initial?.region ?? "",
    category: initial?.category ?? "",
    departure: initial?.departure ?? "",
  });
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [groupLimit, setGroupLimit] = useState(fieldNumber(initial?.groupLimit || null));
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [scheduledDays, setScheduledDays] = useState(initial?.weekdays ?? []);
  const [options, setOptions] = useState(() => optionFields(initial));
  const [steps, setSteps] = useState<StepInput[]>(() => (
    initial?.program.map((step, index) => ({ ...step, key: index })) ?? []
  ));
  const nextStepKey = useRef(steps.length);
  const [includes, setIncludes] = useState(initial?.includes.join("\n") ?? "");
  const [conditions, setConditions] = useState({
    difficulty: initial?.difficulty ?? "",
    minAge: fieldNumber(initial?.minAge),
    meetingPoint: initial?.meetingPoint ?? "",
    bring: initial?.bring?.join("\n") ?? "",
    excludes: initial?.excludes?.join("\n") ?? "",
    cancellation: initial?.cancellation ?? "",
  });
  const [photos, setPhotos] = useState({ image: initial?.image ?? "", gallery: initial?.gallery ?? [] });
  const [uploading, setUploading] = useState(false);
  const [importingTrack, setImportingTrack] = useState(false);
  const submittingDisabled = pending || uploading || importingTrack;
  const feedback = useRef<HTMLParagraphElement>(null);
  const published = status.publishedRevision !== null;

  useEffect(() => {
    if (status.error) feedback.current?.focus();
  }, [status]);

  function toggleDay(day: number) {
    setScheduledDays((current) => current.includes(day)
      ? current.filter((selected) => selected !== day)
      : [...current, day]);
  }

  function addOption() {
    const id = crypto.randomUUID();
    setOptions((current) => [...current, { id, days: "", pricePerPerson: "", guidePerGroup: "" }]);
  }

  function changeOption(id: string, field: keyof Omit<OptionInput, "id">, value: string) {
    setOptions((current) => current.map((option) => option.id === id ? { ...option, [field]: value } : option));
  }

  function addStep() {
    const key = nextStepKey.current++;
    setSteps((current) => [...current, { key, time: "", title: "", description: "" }]);
  }

  function changeStep(key: number, field: keyof Tour["program"][number], value: string) {
    setSteps((current) => current.map((step) => step.key === key ? { ...step, [field]: value } : step));
  }

  return (
    <form action={submit} className="admin-tour-form" aria-busy={pending} onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="revision" value={status.revision ?? ""} />
      {scheduledDays.map((day) => <input key={day} type="hidden" name="weekdays" value={day} />)}
      {record && (
        <div className="admin-tour-publish-status">
          <span className={published ? "admin-tour-status is-published" : "admin-tour-status"}>
            {published ? "Опубликован" : "Черновик"}
          </span>
          {published && <Link href={`/tours/${record.draft.slug}`}>Открыть тур на сайте</Link>}
          {published && status.publishedRevision !== status.revision && <p>Есть изменения в черновике.</p>}
        </div>
      )}
      <fieldset className="admin-tour-fieldset" disabled={pending}>
        <section className="admin-panel admin-tour-section" aria-labelledby={`${formId}-info`}>
          <h2 id={`${formId}-info`}>Основная информация</h2>
          <div className="admin-grid">
            {textFields.map(({ name, label, limit }) => (
              <label className="admin-field" key={name}>
                <span>{label}</span>
                <input
                  type="text"
                  name={name}
                  required={name === "title"}
                  maxLength={limit}
                  value={fields[name]}
                  onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
                />
              </label>
            ))}
            <div className="admin-field admin-tour-wide">
              <label htmlFor={`${formId}-slug`}>Адрес тура</label>
              <input
                id={`${formId}-slug`}
                name="slug"
                aria-describedby={`${formId}-slug-help`}
                value={slug}
                maxLength={64}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                readOnly={Boolean(record)}
                onChange={(event) => setSlug(event.target.value)}
              />
              <small id={`${formId}-slug-help`}>{record ? `/tours/${record.draft.slug}` : "Строчные латинские буквы, цифры и дефисы. Например, lake-weekend."}</small>
            </div>
            <label className="admin-field admin-tour-wide">
              <span>Краткое описание</span>
              <input name="summary" maxLength={240} value={summary} onChange={(event) => setSummary(event.target.value)} />
            </label>
            <label className="admin-field admin-tour-wide">
              <span>Описание</span>
              <textarea name="description" rows={5} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </div>
        </section>

        <section className="admin-panel admin-tour-section" aria-labelledby={`${formId}-schedule`}>
          <h2 id={`${formId}-schedule`}>График выездов</h2>
          <div className="admin-grid">
            <label className="admin-field">
              <span>Начало выездов</span>
              <input type="date" name="startDate" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="admin-field">
              <span>Окончание выездов</span>
              <input type="date" name="endDate" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <p className="admin-tour-note">Границы периода можно оставить пустыми для регулярных выездов.</p>
          <fieldset className="admin-tour-weekdays">
            <legend>Дни выезда</legend>
            {weekdays.map(([day, label]) => (
              <label key={day} className="admin-tour-weekday">
                <input type="checkbox" checked={scheduledDays.includes(day)} onChange={() => toggleDay(day)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <div className="admin-field admin-tour-group">
            <label htmlFor={`${formId}-group`}>Размер группы</label>
            <input id={`${formId}-group`} type="number" name="groupLimit" min={1} max={100} aria-describedby={`${formId}-group-help`} value={groupLimit} onChange={(event) => setGroupLimit(event.target.value)} />
            <small id={`${formId}-group-help`}>Максимальное число человек в одной заявке.</small>
          </div>
        </section>

        <section className="admin-panel admin-tour-section" aria-labelledby={`${formId}-pricing`}>
          <div className="admin-tour-section-title">
            <h2 id={`${formId}-pricing`}>Варианты и цены</h2>
            <button type="button" className="admin-secondary" onClick={addOption} disabled={options.length >= 12}>
              <Plus size={16} aria-hidden="true" /> Добавить вариант
            </button>
          </div>
          {!options.length && <p>Добавьте длительность поездки и цену за человека.</p>}
          {options.map((option, index) => (
            <fieldset className="admin-tour-repeater" key={option.id}>
              <legend>Вариант {index + 1}</legend>
              <input type="hidden" name="optionIds" value={option.id} />
              <div className="admin-grid admin-tour-prices">
                <label className="admin-field">
                  <span>Длительность в днях</span>
                  <input type="number" name="optionDays" min={1} max={60} value={option.days} onChange={(event) => changeOption(option.id, "days", event.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Цена за человека, сом</span>
                  <input type="number" name="optionPrices" min={1} max={10000000} value={option.pricePerPerson} onChange={(event) => changeOption(option.id, "pricePerPerson", event.target.value)} />
                </label>
                <div className="admin-field">
                  <label htmlFor={`${formId}-guide-${option.id}`}>Доплата за гида на группу, сом</label>
                  <input id={`${formId}-guide-${option.id}`} type="number" name="optionGuides" min={0} max={10000000} aria-describedby={`${formId}-guide-help-${option.id}`} value={option.guidePerGroup} onChange={(event) => changeOption(option.id, "guidePerGroup", event.target.value)} />
                  <small id={`${formId}-guide-help-${option.id}`}>Пустое поле означает, что выбор гида недоступен.</small>
                </div>
              </div>
              <button type="button" aria-label={`Убрать вариант ${index + 1}`} className="admin-secondary admin-tour-remove" onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))}>
                <Trash2 size={16} aria-hidden="true" /> Убрать вариант
              </button>
            </fieldset>
          ))}
        </section>

        <section className="admin-panel admin-tour-section" aria-labelledby={`${formId}-photos`}>
          <h2 id={`${formId}-photos`}>Фотографии</h2>
          <AdminMediaField
            image={photos.image}
            gallery={photos.gallery}
            disabled={pending}
            onBusyChange={setUploading}
            onChange={(image, gallery) => setPhotos({ image, gallery })}
          />
        </section>

        <AdminRouteEditor initialPoints={initial?.routePoints} initialTrack={initial?.routeTrack}
          disabled={pending} onTrackBusyChange={setImportingTrack} />

        <section className="admin-panel admin-tour-section" aria-labelledby={`${formId}-program`}>
          <div className="admin-tour-section-title">
            <h2 id={`${formId}-program`}>Программа</h2>
            <button type="button" className="admin-secondary" onClick={addStep} disabled={steps.length >= 30}>
              <Plus size={16} aria-hidden="true" /> Добавить этап
            </button>
          </div>
          {!steps.length && <p>Добавьте остановки или дни поездки в порядке маршрута.</p>}
          {steps.map((step, index) => (
            <fieldset className="admin-tour-repeater" key={step.key}>
              <legend>Этап {index + 1}</legend>
              <div className="admin-grid">
                <label className="admin-field">
                  <span>Время этапа</span>
                  <input name="stepTimes" maxLength={60} placeholder="09:00 или День 1" value={step.time} onChange={(event) => changeStep(step.key, "time", event.target.value)} />
                </label>
                <label className="admin-field">
                  <span>Название этапа</span>
                  <input name="stepTitles" maxLength={120} value={step.title} onChange={(event) => changeStep(step.key, "title", event.target.value)} />
                </label>
                <label className="admin-field admin-tour-wide">
                  <span>Описание этапа</span>
                  <textarea name="stepDescriptions" maxLength={600} rows={2} value={step.description} onChange={(event) => changeStep(step.key, "description", event.target.value)} />
                </label>
              </div>
              <button type="button" aria-label={`Убрать этап ${index + 1}`} className="admin-secondary admin-tour-remove" onClick={() => setSteps((current) => current.filter((item) => item.key !== step.key))}>
                <Trash2 size={16} aria-hidden="true" /> Убрать этап
              </button>
            </fieldset>
          ))}
          <div className="admin-field">
            <label htmlFor={`${formId}-includes`}>Что включено</label>
            <textarea id={`${formId}-includes`} name="includes" maxLength={4850} rows={4} aria-describedby={`${formId}-includes-help`} value={includes} onChange={(event) => setIncludes(event.target.value)} />
            <small id={`${formId}-includes-help`}>По одной услуге в строке.</small>
          </div>
        </section>

        <section className="admin-panel admin-tour-section" aria-labelledby={`${formId}-conditions`}>
          <h2 id={`${formId}-conditions`}>Условия поездки</h2>
          <p className="admin-tour-note">Необязательные поля. Заполненные поля появятся на странице тура во вкладке «Важно знать».</p>
          <div className="admin-grid">
            <label className="admin-field">
              <span>Сложность</span>
              <select name="difficulty" value={conditions.difficulty} onChange={(event) => setConditions({ ...conditions, difficulty: event.target.value })}>
                <option value="">Не указана</option>
                {Object.entries(tourDifficulties).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="admin-field">
              <span>Минимальный возраст</span>
              <input type="number" name="minAge" min={0} max={99} value={conditions.minAge} onChange={(event) => setConditions({ ...conditions, minAge: event.target.value })} />
            </label>
            <label className="admin-field admin-tour-wide">
              <span>Место встречи</span>
              <input name="meetingPoint" maxLength={200} value={conditions.meetingPoint} onChange={(event) => setConditions({ ...conditions, meetingPoint: event.target.value })} />
            </label>
            <div className="admin-field">
              <label htmlFor={`${formId}-bring`}>Что взять с собой</label>
              <textarea id={`${formId}-bring`} name="bring" rows={4} maxLength={4850} value={conditions.bring} onChange={(event) => setConditions({ ...conditions, bring: event.target.value })} />
              <small>По одному пункту в строке.</small>
            </div>
            <div className="admin-field">
              <label htmlFor={`${formId}-excludes`}>Что не входит в стоимость</label>
              <textarea id={`${formId}-excludes`} name="excludes" rows={4} maxLength={4850} value={conditions.excludes} onChange={(event) => setConditions({ ...conditions, excludes: event.target.value })} />
              <small>По одному пункту в строке.</small>
            </div>
            <label className="admin-field admin-tour-wide">
              <span>Условия отмены</span>
              <textarea name="cancellation" rows={3} maxLength={1500} value={conditions.cancellation} onChange={(event) => setConditions({ ...conditions, cancellation: event.target.value })} />
            </label>
          </div>
        </section>
      </fieldset>

      <div className="admin-panel admin-tour-submit">
        <p className="admin-tour-note">Посетители видят последнюю опубликованную версию. Сохраните черновик, чтобы продолжить позже.</p>
        {status.error && <p ref={feedback} tabIndex={-1} className="admin-error" role="alert">{status.error}</p>}
        {status.notice && <p className="admin-tour-notice" role="status">{status.notice}</p>}
        <div className="admin-actions">
          <button className="admin-secondary" name="intent" value="draft" disabled={submittingDisabled}>Сохранить черновик</button>
          <button className="admin-button" name="intent" value="publish" disabled={submittingDisabled}>Опубликовать</button>
          {published && <button className="admin-secondary" name="intent" value="unpublish" formNoValidate disabled={submittingDisabled}>Снять с публикации</button>}
        </div>
        {pending && <p role="status">Сохраняем…</p>}
      </div>
    </form>
  );
}
