import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { setAdminPassword, validAdminPassword } from "../lib/admin-credentials.mjs";
import { closeBookings, storageErrorCode } from "../lib/storage.mjs";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function passwordFromStdin() {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1024) return null;
    chunks.push(chunk);
  }

  const password = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  return password.replace(/\r?\n$/, "");
}

async function passwordFromTerminal() {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    fail("Откройте команду в терминале или передайте пароль через защищённый stdin.");
    return null;
  }

  const hiddenOutput = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const terminal = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });
  const abort = new AbortController();
  terminal.once("SIGINT", () => abort.abort());

  try {
    process.stderr.write("Новый пароль администратора: ");
    const password = await terminal.question("", { signal: abort.signal });
    process.stderr.write("\nПовторите пароль: ");
    const confirmation = await terminal.question("", { signal: abort.signal });
    process.stderr.write("\n");

    if (password !== confirmation) {
      fail("Введённые пароли различаются.");
      return null;
    }
    return password;
  } catch (error) {
    if (error.name !== "AbortError") throw error;
    process.stderr.write("\n");
    fail("Ввод отменён.");
    return null;
  } finally {
    terminal.close();
  }
}

async function run() {
  const [command, option, ...extra] = process.argv.slice(2);
  if (command !== "password" || (option !== undefined && option !== "--stdin") || extra.length) {
    fail("Использование: node scripts/admin.mjs password [--stdin]");
    return;
  }

  const password = await (option === "--stdin" ? passwordFromStdin() : passwordFromTerminal());
  if (password === null && process.exitCode) return;
  if (!validAdminPassword(password)) {
    fail("Укажите пароль длиной от 12 до 160 символов без управляющих символов.");
    return;
  }

  const requireFromNext = createRequire(import.meta.resolve("next/package.json"));
  const { loadEnvConfig } = requireFromNext("@next/env");
  loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development", {
    info() {},
    error() {
      throw Object.assign(new Error("Invalid Next.js environment configuration"), { code: "INVALID_ENV_FILE" });
    },
  });
  await setAdminPassword(password);
  console.log("Пароль администратора сохранён. Предыдущие сеансы завершены.");
}

try {
  await run();
} catch (error) {
  fail(`Не удалось задать пароль администратора (${storageErrorCode(error)}).`);
} finally {
  closeBookings();
}
