import { detectFormat } from "./detect";
import { readSqlitePpFile } from "./sqlite-reader";
import { readMdbPpFile } from "./mdb-reader";
import type { PpExportData } from "./types";

export type { PpExportData } from "./types";
export { detectFormat } from "./detect";

/**
 * Parse a .pp file buffer and return the full BI export data set.
 *
 * The file format (SQLite or Access/MDB) is detected automatically from the
 * magic bytes.  No Asta Developers' Toolkit or Windows host is required.
 */
export async function parsePpFile(buffer: Buffer): Promise<PpExportData> {
  const format = detectFormat(buffer);

  if (format === "sqlite") {
    return readSqlitePpFile(buffer);
  }

  if (format === "access") {
    return readMdbPpFile(buffer);
  }

  throw new Error(
    `Unrecognised .pp file format (first bytes: ${[...buffer.subarray(0, 8)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")}).  Expected SQLite or Access/MDB magic.`
  );
}
