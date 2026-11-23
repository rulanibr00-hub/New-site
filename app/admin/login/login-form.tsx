"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, null);

  return (
    <form action={action} className="admin-login-form">
      <label className="admin-field">
        Пароль
        <input name="password" type="password" autoComplete="current-password" required maxLength={320}
          aria-invalid={Boolean(error)} aria-describedby={error ? "admin-login-error" : undefined} />
      </label>
      {error && <p id="admin-login-error" className="admin-error" role="alert">{error}</p>}
      <button className="admin-button" type="submit" disabled={pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
    </form>
  );
}
