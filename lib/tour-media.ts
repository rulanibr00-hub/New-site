import { randomBytes } from "node:crypto";
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync } from "node:fs";
import { link, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { assertPrivateDataDirectory, privateDataDirectory } from "@/lib/storage.mjs";

export const maxTourMediaBytes = 8 * 1024 * 1024;

const mediaFilename = /^[0-9a-f]{32}\.webp$/;
const publicPrefix = "/media/";
const readFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export function isTourMediaFilename(value: string) {
  return mediaFilename.test(value);
}

export function isStoredTourMediaPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(publicPrefix)
    && isTourMediaFilename(value.slice(publicPrefix.length));
}

export function isWebp(bytes: Buffer) {
  return bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF"
    && bytes.toString("latin1", 8, 12) === "WEBP";
}

function mediaDirectory(create = false) {
  const root = privateDataDirectory();
  assertPrivateDataDirectory(root);
  if (create) mkdirSync(root, { recursive: true, mode: 0o700 });

  const realRoot = realpathSync(/* turbopackIgnore: true */ root);
  assertPrivateDataDirectory(realRoot);
  const directory = join(realRoot, "tour-media");
  if (create) {
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }

  const info = lstatSync(directory);
  if (!info.isDirectory() || (process.platform !== "win32" && (info.mode & 0o022) !== 0)) {
    throw Object.assign(new Error("Unsafe tour media directory"), { code: "UNSAFE_MEDIA_DIRECTORY" });
  }
  return directory;
}

function hasValidSize(info: { isFile(): boolean; size: number }) {
  return info.isFile() && info.size >= 12 && info.size <= maxTourMediaBytes;
}

export function storedTourMediaExists(path: string) {
  if (!isStoredTourMediaPath(path)) return false;

  let fd: number | undefined;
  try {
    fd = openSync(join(mediaDirectory(), path.slice(publicPrefix.length)), readFlags);
    if (!hasValidSize(fstatSync(fd))) return false;
    const header = Buffer.alloc(12);
    return readSync(fd, header, 0, header.length, 0) === header.length && isWebp(header);
  } catch (error) {
    if (isMissingMedia(error)) return false;
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function isMissingMedia(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP";
}

export async function openTourMedia(filename: string) {
  if (!isTourMediaFilename(filename)) return null;

  let file;
  try {
    file = await open(join(mediaDirectory(), filename), readFlags);
  } catch (error) {
    if (isMissingMedia(error)) return null;
    throw error;
  }

  let isValid = false;
  try {
    const info = await file.stat();
    if (!hasValidSize(info)) return null;
    const header = Buffer.alloc(12);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    isValid = bytesRead === header.length && isWebp(header);
    return isValid ? { file, size: info.size } : null;
  } finally {
    if (!isValid) await file.close();
  }
}

export async function saveTourMedia(bytes: Buffer) {
  if (!isWebp(bytes) || bytes.length > maxTourMediaBytes) throw new Error("Invalid encoded tour media");

  const directory = mediaDirectory(true);
  const key = randomBytes(16).toString("hex");
  const filename = `${key}.webp`;
  const temporary = join(directory, `.${key}.upload`);
  const file = await open(temporary, "wx", 0o600);

  try {
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    // Publish the fully written file without replacing an existing image.
    await link(temporary, join(directory, filename));
  } finally {
    await unlink(temporary);
  }
  return `${publicPrefix}${filename}`;
}
