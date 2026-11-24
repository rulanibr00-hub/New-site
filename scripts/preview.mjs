import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const controller = new AbortController();
const port = Number(process.env.TOO_TURY_PREVIEW_PORT ?? "3001");
const dataDir = resolve(".data");
const dependencyStamp = resolve(dataDir, "preview-dependencies");
const npm = process.env.npm_execpath;
const dependencyFiles = ["package.json", "package-lock.json"];
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
let server;
let warning;

function notify(message) {
  if (!controller.signal.aborted && warning !== message) console.log(message);
  warning = message;
}

async function git(...args) {
  const { stdout } = await exec("git", args, {
    env: gitEnv, timeout: 20_000, signal: controller.signal, windowsHide: true,
  });
  return stdout.trim();
}

async function startServer() {
  const manifests = await Promise.all(dependencyFiles.map((file) => readFile(file)));
  const hash = createHash("sha256").update(`${process.version} ${process.platform} ${process.arch}`);
  for (const manifest of manifests) hash.update(manifest);
  const fingerprint = hash.digest("hex");
  let installed = await readFile(dependencyStamp, "utf8").catch(() => "");
  if (installed === fingerprint) {
    try {
      require.resolve("next/dist/bin/next");
    } catch {
      installed = "";
    }
  }
  if (installed !== fingerprint) {
    console.log("Устанавливаем зависимости для предпросмотра.");
    await new Promise((done, reject) => {
      const install = spawn(process.execPath, [npm, "ci"], { stdio: "inherit", signal: controller.signal });
      install.once("error", reject);
      install.once("close", (code) => code === 0 ? done() : reject(new Error("npm ci failed")));
    });
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await writeFile(dependencyStamp, fingerprint, { mode: 0o600 });
  }

  if (controller.signal.aborted) return;
  const next = require.resolve("next/dist/bin/next");
  const running = spawn(process.execPath, [next, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: "inherit",
    env: { ...process.env, TOO_TURY_DATA_DIR: dataDir, TOO_TURY_TELEGRAM_PAUSED: "1" },
  });
  server = running;
  running.once("error", () => notify("Не удалось запустить сервер предпросмотра. Повторим попытку."));
  running.once("close", () => {
    if (server !== running) return;
    server = undefined;
    notify("Сервер предпросмотра остановился. Повторим запуск.");
  });
}

async function stopServer() {
  const running = server;
  server = undefined;
  if (!running?.pid || running.exitCode !== null || running.signalCode !== null) return;
  const stopped = new Promise((done) => running.once("close", done));
  if (process.platform === "win32") {
    await exec("taskkill.exe", ["/pid", String(running.pid), "/t", "/f"], {
      timeout: 10_000, windowsHide: true,
    }).catch(() => running.kill());
  } else {
    running.kill("SIGTERM");
  }
  await stopped;
}

async function synchronize() {
  await git("fetch", "--quiet", "--no-tags");
  const [current, latest] = (await git("rev-parse", "HEAD", "@{upstream}")).split(/\r?\n/);
  if (current === latest) {
    warning = undefined;
    return;
  }
  if (await git("status", "--porcelain")) {
    notify("Обновление приостановлено. В папке есть локальные правки.");
    return;
  }
  try {
    await git("merge-base", "--is-ancestor", current, latest);
  } catch (error) {
    if (error.code !== 1) throw error;
    notify("Обновление приостановлено. В папке есть собственные коммиты.");
    return;
  }

  if (await git("diff", "--name-only", current, latest, "--", ...dependencyFiles)) await stopServer();
  await git("merge", "--ff-only", latest);
  warning = undefined;
  console.log("Получены обновления из GitHub.");
}

process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

try {
  if (!npm) throw new Error("Запустите npm run preview из папки проекта.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Проверьте порт предпросмотра.");
  await git("rev-parse", "--verify", "@{upstream}")
    .catch(() => { throw new Error("Для предпросмотра откройте Git-копию проекта с подключённой веткой GitHub."); });
  console.log(`Предпросмотр доступен после запуска по адресу http://127.0.0.1:${port}.`);

  while (!controller.signal.aborted) {
    try {
      await synchronize();
    } catch {
      notify("GitHub пока недоступен или не удалось применить обновление. Повторим попытку.");
    }
    if (!server && !controller.signal.aborted) {
      try {
        await startServer();
      } catch {
        notify("Не удалось подготовить предпросмотр. Повторим попытку.");
      }
    }
    await delay(10_000, undefined, { signal: controller.signal }).catch(() => {});
  }
} catch (error) {
  if (!controller.signal.aborted) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  await stopServer();
}
