export type PpFormat = "sqlite" | "access" | "unknown";

const SQLITE_MAGIC = "SQLite format 3\0";
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export function detectFormat(buf: Buffer): PpFormat {
  if (buf.length < 16) return "unknown";
  if (buf.slice(0, 16).toString("binary") === SQLITE_MAGIC) return "sqlite";
  if (OLE_MAGIC.every((b, i) => buf[i] === b)) return "access";
  return "unknown";
}
