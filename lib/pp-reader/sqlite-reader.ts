import initSqlJs from "sql.js";
import type { Database } from "sql.js";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  MDB_ALIASES,
  BAR_COLS,
  EXPANDED_TASK_COLS,
  LINK_COLS,
  MILESTONE_COLS,
  PROJECT_SUMMARY_COLS,
  TASK_COLS,
  parseAstaDate,
  parseAstaDurationHours,
  durationHoursToDays,
} from "./schema";
import type { PpExportData } from "./types";

// ─── sql.js initialisation ───────────────────────────────────────────────────

const _require = createRequire(import.meta.url);
const _wasmBinary = readFileSync(join(dirname(_require.resolve("sql.js")), "sql-wasm.wasm"));

let _sqlInstance: Awaited<ReturnType<typeof initSqlJs>> | null = null;
async function getSql() {
  if (!_sqlInstance) _sqlInstance = await initSqlJs({ wasmBinary: _wasmBinary });
  return _sqlInstance;
}

// ─── helpers ────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function normalise(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[MDB_ALIASES[k] ?? k] = v;
  return out;
}

function col(row: Row, canonical: string): unknown {
  return row[canonical] ?? null;
}

function listTables(db: Database): string[] {
  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  return res.length ? (res[0].values.map((r) => r[0] as string)) : [];
}

function getRows(db: Database, table: string): Row[] {
  if (!listTables(db).includes(table)) return [];
  const res = db.exec(`SELECT * FROM "${table}"`);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values
    .map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as Row)
    .map(normalise);
}

// ─── project-level metadata ──────────────────────────────────────────────────

function readProjectSummary(db: Database): {
  guid: string;
  version: number;
  baselineId: number;
  author: string | null;
  shortName: string | null;
  longName: string | null;
  shortFileName: string | null;
  longFileName: string | null;
  reportDate: Date | null;
  currentUser: string | null;
} {
  const rows = getRows(db, "project_summary");
  const ps = rows[0] ?? {};

  const guid =
    (col(ps, "UNIQUE_ID") as string) ??
    (col(ps, "GUID") as string) ??
    (col(ps, PROJECT_SUMMARY_COLS.projectGuid) as string) ??
    crypto.randomUUID();

  let version = 0;
  try {
    const sv = db.exec('SELECT SCHVER FROM "dodschem"');
    if (sv.length && sv[0].values.length) version = Number(sv[0].values[0][0]);
  } catch { /* dodschem may not exist in older files */ }

  return {
    guid: String(guid),
    version,
    baselineId: 0,
    author: col(ps, PROJECT_SUMMARY_COLS.projectBy) as string | null,
    shortName: col(ps, PROJECT_SUMMARY_COLS.shortName) as string | null,
    longName: col(ps, PROJECT_SUMMARY_COLS.longName) as string | null,
    shortFileName: col(ps, PROJECT_SUMMARY_COLS.shortFileName) as string | null,
    longFileName: col(ps, PROJECT_SUMMARY_COLS.longFileName) as string | null,
    reportDate: parseAstaDate(col(ps, PROJECT_SUMMARY_COLS.reportDate)),
    currentUser: col(ps, PROJECT_SUMMARY_COLS.currentUser) as string | null,
  };
}

// ─── hierarchy helpers ───────────────────────────────────────────────────────

function buildBarMap(bars: Row[]): Map<number, Row> {
  return new Map(bars.map((b) => [Number(col(b, BAR_COLS.id)), b]));
}

// ─── main export function ────────────────────────────────────────────────────

export async function readSqlitePpFile(buffer: Buffer): Promise<PpExportData> {
  const SQL = await getSql();
  const db = new SQL.Database(buffer);

  const runDate = new Date();
  const runNumber = 1;
  const ps = readProjectSummary(db);
  const planningDataId = ps.guid;
  const planningDataVersion = ps.version;
  const baselineId = ps.baselineId;

  // ── PlanningData ────────────────────────────────────────────────────────
  const planningData = [
    {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      Author: ps.author,
      ShortName: ps.shortName,
      LongName: ps.longName,
      ShortFileName: ps.shortFileName,
      LongFileName: ps.longFileName,
      ReportDate: ps.reportDate,
      CurrentUserName: ps.currentUser,
      CurrentBaselineID: baselineId,
    },
  ];

  // ── ProgressPeriod ──────────────────────────────────────────────────────
  const ppRows = getRows(db, "progress_period");
  const progressPeriods = ppRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, "PROGRESS_PERIODID") ?? col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    PathName: col(r, "PATHNAME") as string | null,
    FullName: (col(r, "FULLNAME") ?? col(r, "NAME")) as string | null,
    Reportdate: parseAstaDate(col(r, "REPORT_DATE")),
  }));

  // ── CodeLibrary ─────────────────────────────────────────────────────────
  const clRows = getRows(db, "code_library");
  const codeLibraries = clRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, "CODE_LIBRARYID") ?? col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    SingleSelect: col(r, "SINGLESELECT") != null ? Number(col(r, "SINGLESELECT")) : null,
  }));

  // ── CodeLibraryEntry ────────────────────────────────────────────────────
  const cleRows = getRows(db, "code_library_entry");
  const codeLibraryEntries = cleRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, "CODE_LIBRARY_ENTRYID") ?? col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    Lineage: String(col(r, "PARENTS") ?? col(r, "LINEAGE") ?? ""),
    OrderString: String(col(r, "ORDERSTRING") ?? col(r, "SORT_ORDER") ?? ""),
    ShortName: String(col(r, "SHORT_NAME") ?? col(r, "NAME") ?? ""),
    PathName: String(col(r, "PATHNAME") ?? col(r, "NAME") ?? ""),
    FullName: String(col(r, "FULLNAME") ?? col(r, "NAME") ?? ""),
    ParentName: String(col(r, "PARENTNAME") ?? ""),
    LibraryName: String(col(r, "CODE_LIBRARY_NAME") ?? col(r, "LIBRARYNAME") ?? ""),
    LibraryID: col(r, "CODE_LIBRARY") != null ? Number(col(r, "CODE_LIBRARY")) : null,
    SortOrder: Number(col(r, "SORT_ORDER") ?? col(r, "SORTORDER") ?? 0),
  }));

  // ── Bar ─────────────────────────────────────────────────────────────────
  const barRows = getRows(db, "bar");
  const barMap = buildBarMap(barRows);
  const bars = barRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, BAR_COLS.id) ?? 0),
    ProjectID: Number(col(r, "PROJECT") ?? 0),
    PathName: col(r, "PATHNAME") as string | null,
    Name: col(r, BAR_COLS.name) as string | null,
    Lineage: col(r, "PARENTS") as string | null,
    ParentName: col(r, "PARENTNAME") as string | null,
    ParentId: col(r, BAR_COLS.expandedTask) != null ? Number(col(r, BAR_COLS.expandedTask)) : null,
    BarNaturalOrder: col(r, BAR_COLS.naturalOrder) != null ? Number(col(r, BAR_COLS.naturalOrder)) : null,
    NaturalOrder: col(r, BAR_COLS.naturalOrder) != null ? Number(col(r, BAR_COLS.naturalOrder)) : null,
    StartDate: parseAstaDate(col(r, BAR_COLS.start)),
    Finish: parseAstaDate(col(r, BAR_COLS.finish)),
    ActualStart: parseAstaDate(col(r, "ACTUAL_START")),
    ActualFinish: parseAstaDate(col(r, "ACTUAL_FINISH")),
    BaselineStart: null as Date | null,
    BaselineFinish: null as Date | null,
    PercentComplete: col(r, BAR_COLS.percentComplete) != null ? Number(col(r, BAR_COLS.percentComplete)) : null,
    DurationPercentComplete: null as number | null,
    BaselineEarlyStart: null as Date | null,
    BaselineEarlyFinish: null as Date | null,
    BaselineLateStart: null as Date | null,
    BaselineLateFinish: null as Date | null,
  }));

  // ── Expanded (expanded_task) ─────────────────────────────────────────────
  const etRows = getRows(db, "expanded_task");
  const expanded = etRows.map((r) => {
    const barId = col(r, EXPANDED_TASK_COLS.bar) != null ? Number(col(r, EXPANDED_TASK_COLS.bar)) : null;
    const barRow = barId != null ? barMap.get(barId) : null;
    const durationH = parseAstaDurationHours(col(r, TASK_COLS.durationHours));
    return {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      ID: Number(col(r, EXPANDED_TASK_COLS.id) ?? 0),
      ProjectID: Number(col(r, "PROJECT") ?? 0),
      Name: col(r, EXPANDED_TASK_COLS.name) as string | null,
      PathName: col(r, "PATHNAME") as string | null,
      ParentContainer: col(r, EXPANDED_TASK_COLS.etask) != null ? Number(col(r, EXPANDED_TASK_COLS.etask)) : null,
      Lineage: col(r, "PARENTS") as string | null,
      Type: col(r, "TYPE") as string | null,
      TaskOID: null as number | null,
      BarID: barId,
      BarNaturalOrder: barRow ? (col(barRow, BAR_COLS.naturalOrder) != null ? Number(col(barRow, BAR_COLS.naturalOrder)) : null) : null,
      NaturalOrder: col(r, EXPANDED_TASK_COLS.naturalOrder) != null ? Number(col(r, EXPANDED_TASK_COLS.naturalOrder)) : null,
      UniqueTaskID: null as string | null,
      Notes: col(r, EXPANDED_TASK_COLS.notes) as string | null,
      StartDate: parseAstaDate(col(r, EXPANDED_TASK_COLS.start)),
      Finish: parseAstaDate(col(r, EXPANDED_TASK_COLS.finish)),
      DurationDays: durationHoursToDays(durationH),
      DurationHours: durationH,
      ActualStart: parseAstaDate(col(r, "ACTUAL_START")),
      ActualFinish: parseAstaDate(col(r, "ACTUAL_FINISH")),
      BaselineStart: null as Date | null,
      BaselineFinish: null as Date | null,
      PercentComplete: col(r, EXPANDED_TASK_COLS.percentComplete) != null ? Number(col(r, EXPANDED_TASK_COLS.percentComplete)) : null,
      CalendarId: col(r, "CALENDAR") != null ? Number(col(r, "CALENDAR")) : null,
      Calendar: null as string | null,
      DurationPercentComplete: null as number | null,
      PlannedPercentComplete: null as number | null,
      OverallPercentComplete: col(r, EXPANDED_TASK_COLS.percentComplete) != null ? Number(col(r, EXPANDED_TASK_COLS.percentComplete)) : null,
      TotalFloat: null as number | null,
      OriginalDuration: null as number | null,
      ConstraintFlag: null as string | null,
      Predecessors: null as string | null,
      Successors: null as string | null,
      Critical: null as number | null,
      NearlyCritical: null as number | null,
      LongestPath: null as number | null,
      EarlyStart: null as Date | null,
      EarlyFinish: null as Date | null,
      LateStart: null as Date | null,
      LateFinish: null as Date | null,
      BaselineEarlyStart: null as Date | null,
      BaselineEarlyFinish: null as Date | null,
      BaselineLateStart: null as Date | null,
      BaselineLateFinish: null as Date | null,
      BaselineEffort: null as number | null,
    };
  });

  // ── Project ──────────────────────────────────────────────────────────────
  const projects = expanded
    .filter((e) => e.ParentContainer === null || e.ParentContainer === 0)
    .map((e) => ({
      RunDate: e.RunDate,
      RunNumber: e.RunNumber,
      PlanningDataID: e.PlanningDataID,
      PlanningDataVersion: e.PlanningDataVersion,
      ID: e.ID,
      Name: e.Name,
      ShortName: ps.shortName,
      LongName: ps.longName,
      ShortFileName: ps.shortFileName,
      LongFileName: ps.longFileName,
      ProjectName: e.Name,
      ProjectFullName: e.PathName ?? e.Name,
    }));

  // ── Task ─────────────────────────────────────────────────────────────────
  const taskRows = getRows(db, "task");
  const tasks = taskRows.map((r) => {
    const durationH = parseAstaDurationHours(col(r, TASK_COLS.durationHours));
    const origDurationH = parseAstaDurationHours(col(r, TASK_COLS.originalDuration) ?? col(r, "GIVEN_DURATIONHOURS"));
    const totalFloatH = parseAstaDurationHours(col(r, TASK_COLS.totalFloat) ?? col(r, "TOTAL_FLOAT_HOURS"));
    const barId = col(r, TASK_COLS.bar) != null ? Number(col(r, TASK_COLS.bar)) : null;
    const barRow = barId != null ? barMap.get(barId) : null;
    return {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      ID: Number(col(r, TASK_COLS.id) ?? 0),
      ProjectID: Number(col(r, "PROJECT") ?? 0),
      PathName: col(r, "PATHNAME") as string | null,
      ParentContainer: col(r, TASK_COLS.etask) != null ? Number(col(r, TASK_COLS.etask)) : null,
      Lineage: col(r, "PARENTS") as string | null,
      Name: col(r, TASK_COLS.name) as string | null,
      BaselineStart: null as Date | null,
      BaselineFinish: null as Date | null,
      PlannedPercentComplete: null as number | null,
      OriginalStart: parseAstaDate(col(r, TASK_COLS.originalStart)),
      OriginalFinish: null as Date | null,
      Notes: col(r, TASK_COLS.notes) as string | null,
      Type: null as string | null,
      TaskOID: Number(col(r, TASK_COLS.id) ?? 0),
      BarID: barId,
      BarNaturalOrder: barRow ? (col(barRow, BAR_COLS.naturalOrder) != null ? Number(col(barRow, BAR_COLS.naturalOrder)) : null) : null,
      NaturalOrder: col(r, TASK_COLS.naturalOrder) != null ? Number(col(r, TASK_COLS.naturalOrder)) : null,
      UniqueTaskID: col(r, TASK_COLS.uniqueTaskId) as string | null,
      Critical: col(r, TASK_COLS.critical) != null ? Number(col(r, TASK_COLS.critical)) : null,
      EarlyStart: parseAstaDate(col(r, TASK_COLS.earlyStart)),
      EarlyFinish: parseAstaDate(col(r, TASK_COLS.earlyFinish)),
      LateStart: parseAstaDate(col(r, TASK_COLS.lateStart)),
      LateFinish: parseAstaDate(col(r, TASK_COLS.lateFinish)),
      TotalFloat: totalFloatH,
      OriginalDuration: origDurationH,
      LongestPath: col(r, TASK_COLS.longestPath) != null ? Number(col(r, TASK_COLS.longestPath)) : null,
      NearlyCritical: null as number | null,
      StartDate: parseAstaDate(col(r, TASK_COLS.start)),
      Finish: parseAstaDate(col(r, TASK_COLS.finish)),
      DurationHours: durationH,
      DurationDays: durationHoursToDays(durationH),
      CalendarId: col(r, TASK_COLS.calendar) != null ? Number(col(r, TASK_COLS.calendar)) : null,
      Calendar: null as string | null,
      DurationPercentComplete: null as number | null,
      ActualStart: null as Date | null,
      ActualFinish: null as Date | null,
      PercentComplete: col(r, TASK_COLS.percentComplete) != null ? Number(col(r, TASK_COLS.percentComplete)) : null,
      OverallPercentComplete: col(r, TASK_COLS.percentComplete) != null ? Number(col(r, TASK_COLS.percentComplete)) : null,
      Predecessors: null as string | null,
      Successors: null as string | null,
      ConstraintFlag: col(r, TASK_COLS.constraintFlag) as string | null,
      BaselineEarlyStart: null as Date | null,
      BaselineEarlyFinish: null as Date | null,
      BaselineLateStart: null as Date | null,
      BaselineLateFinish: null as Date | null,
      BaselineEffort: null as number | null,
      BufferTask: col(r, TASK_COLS.bufferTask) != null ? Number(col(r, TASK_COLS.bufferTask)) : null,
    };
  });

  // ── Milestone ────────────────────────────────────────────────────────────
  const msRows = getRows(db, "milestone");
  const milestones = msRows.map((r) => {
    const barId = col(r, MILESTONE_COLS.bar) != null ? Number(col(r, MILESTONE_COLS.bar)) : null;
    const barRow = barId != null ? barMap.get(barId) : null;
    const date = parseAstaDate(col(r, MILESTONE_COLS.date)) ?? parseAstaDate(col(r, MILESTONE_COLS.start));
    return {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      ID: Number(col(r, MILESTONE_COLS.id) ?? 0),
      ProjectID: Number(col(r, "PROJECT") ?? 0),
      PathName: col(r, "PATHNAME") as string | null,
      ParentContainer: col(r, MILESTONE_COLS.etask) != null ? Number(col(r, MILESTONE_COLS.etask)) : null,
      Lineage: col(r, "PARENTS") as string | null,
      Name: col(r, MILESTONE_COLS.name) as string | null,
      Notes: col(r, MILESTONE_COLS.notes) as string | null,
      Type: null as string | null,
      TaskOID: Number(col(r, MILESTONE_COLS.id) ?? 0),
      BarID: barId,
      BarNaturalOrder: barRow ? (col(barRow, BAR_COLS.naturalOrder) != null ? Number(col(barRow, BAR_COLS.naturalOrder)) : null) : null,
      NaturalOrder: col(r, MILESTONE_COLS.naturalOrder) != null ? Number(col(r, MILESTONE_COLS.naturalOrder)) : null,
      UniqueTaskID: col(r, MILESTONE_COLS.uniqueTaskId) as string | null,
      StartDate: date,
      Finish: date,
      DurationHours: 0,
      DurationDays: 0,
      CalendarId: null as number | null,
      Calendar: null as string | null,
      DurationPercentComplete: null as number | null,
      ActualStart: null as Date | null,
      ActualFinish: null as Date | null,
      PercentComplete: col(r, MILESTONE_COLS.percentComplete) != null ? Number(col(r, MILESTONE_COLS.percentComplete)) : null,
      BaselineStart: null as Date | null,
      BaselineFinish: null as Date | null,
      Critical: col(r, MILESTONE_COLS.critical) != null ? Number(col(r, MILESTONE_COLS.critical)) : null,
      EarlyStart: parseAstaDate(col(r, MILESTONE_COLS.earlyStart)),
      EarlyFinish: parseAstaDate(col(r, MILESTONE_COLS.earlyFinish)),
      TotalFloat: parseAstaDurationHours(col(r, MILESTONE_COLS.totalFloat)),
      OriginalDuration: null as number | null,
      LongestPath: col(r, MILESTONE_COLS.longestPath) != null ? Number(col(r, MILESTONE_COLS.longestPath)) : null,
      NearlyCritical: null as number | null,
      OverallPercentComplete: col(r, MILESTONE_COLS.percentComplete) != null ? Number(col(r, MILESTONE_COLS.percentComplete)) : null,
      Predecessors: null as string | null,
      Successors: null as string | null,
      ConstraintFlag: col(r, MILESTONE_COLS.constraintFlag) as string | null,
      PlannedPercentComplete: null as number | null,
      OriginalStart: null as Date | null,
      OriginalFinish: null as Date | null,
      LateStart: parseAstaDate(col(r, MILESTONE_COLS.lateStart)),
      LateFinish: parseAstaDate(col(r, MILESTONE_COLS.lateFinish)),
      BaselineEarlyStart: null as Date | null,
      BaselineEarlyFinish: null as Date | null,
      BaselineLateStart: null as Date | null,
      BaselineLateFinish: null as Date | null,
      BaselineEffort: null as number | null,
      BufferTask: col(r, MILESTONE_COLS.bufferTask) != null ? Number(col(r, MILESTONE_COLS.bufferTask)) : null,
    };
  });

  // ── TaskCompletedSection ─────────────────────────────────────────────────
  const tcsRows = getRows(db, "task_completed_section");
  const taskCompletedSections = tcsRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    ID: Number(col(r, "TASK_COMPLETED_SECTIONID") ?? col(r, "ID") ?? 0),
    ProjectID: Number(col(r, "PROJECT") ?? 0),
    Parent: col(r, "TASK") != null ? Number(col(r, "TASK")) : null,
    ParentName: null as string | null,
    PeriodID: col(r, "LATEST_PROGRESS_PERIOD") != null ? Number(col(r, "LATEST_PROGRESS_PERIOD")) : null,
    ActStart: parseAstaDate(col(r, "ACTUAL_START")),
    ActFinish: parseAstaDate(col(r, "ACTUAL_END") ?? col(r, "ACTUAL_FINISH")),
    OPC: col(r, "OVERALL_PERCENT_COMPLETE") != null ? Number(col(r, "OVERALL_PERCENT_COMPLETE")) : null,
  }));

  // ── Link ─────────────────────────────────────────────────────────────────
  const linkRows = getRows(db, "link");
  const links = linkRows.map((r) => {
    const startLagH = parseAstaDurationHours(col(r, LINK_COLS.startLagHours) ?? col(r, "START_LAG_TIME"));
    const endLagH = parseAstaDurationHours(col(r, LINK_COLS.endLagHours) ?? col(r, "END_LAG_TIME"));
    return {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      ID: Number(col(r, "LINKID") ?? col(r, "ID") ?? 0),
      ShortName: ps.shortName,
      LongName: ps.longName,
      ShortFileName: ps.shortFileName,
      LongFileName: ps.longFileName,
      StartID: col(r, LINK_COLS.startTask) != null ? Number(col(r, LINK_COLS.startTask)) : null,
      StartFullName: null as string | null,
      StartUTID: null as string | null,
      EndID: col(r, LINK_COLS.endTask) != null ? Number(col(r, LINK_COLS.endTask)) : null,
      EndFullName: null as string | null,
      EndUTID: null as string | null,
      Type: col(r, LINK_COLS.linkKind) as string | null,
      Category: null as string | null,
      Slope: col(r, LINK_COLS.slope) != null ? Number(col(r, LINK_COLS.slope)) : null,
      TotalLeadLag: startLagH != null && endLagH != null ? startLagH + endLagH : (startLagH ?? endLagH),
      StartLeadLag: startLagH,
      EndLeadLag: endLagH,
      Comments: col(r, LINK_COLS.comments) as string | null,
      Unschedulable: col(r, LINK_COLS.unschedulable) != null ? Number(col(r, LINK_COLS.unschedulable)) : null,
      Driving: col(r, LINK_COLS.driving) != null ? Number(col(r, LINK_COLS.driving)) : null,
      Complete: col(r, LINK_COLS.complete) != null ? Number(col(r, LINK_COLS.complete)) : null,
      Critical: col(r, LINK_COLS.critical) != null ? Number(col(r, LINK_COLS.critical)) : null,
      OnLoop: col(r, LINK_COLS.onLoop) != null ? Number(col(r, LINK_COLS.onLoop)) : null,
      LongestPath: col(r, LINK_COLS.longestPath) != null ? Number(col(r, LINK_COLS.longestPath)) : null,
    };
  });

  // ── Bsln (baseline_summary) ──────────────────────────────────────────────
  const bslnRows = getRows(db, "baseline_summary");
  const bsln = bslnRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineIDNumber: Number(col(r, "BASELINE_ID") ?? col(r, "ID") ?? 0),
    ObjectID: Number(col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    PathName: col(r, "PATHNAME") as string | null,
    BaselineProjectId: col(r, "BASELINE_PROJECT_ID") != null ? Number(col(r, "BASELINE_PROJECT_ID")) : null,
    Active: col(r, "ACTIVE") != null ? Number(col(r, "ACTIVE")) : null,
    CreationDate: parseAstaDate(col(r, "CREATION_DATE")),
    LastEditedDate: parseAstaDate(col(r, "UPDATE_DATE") ?? col(r, "LAST_EDITED_DATE")),
  }));

  // ── AllAssignedCodes ─────────────────────────────────────────────────────
  const codesRows = getRows(db, "code_library_assignabl_codes");
  const allAssignedCodes = codesRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    ID: Number(col(r, "ASSIGNED_TO") ?? col(r, "ID") ?? 0),
    Allcodes: col(r, "CODES") as string | null,
    ObjectType: col(r, "OBJECT_TYPE") as string | null,
  }));

  // ── AllocationTimephased ─────────────────────────────────────────────────
  const allocRows = getRows(db, "permanent_schedul_allocation");
  const allocationTimephased = allocRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    TimephaseStart: parseAstaDate(col(r, "LINKABLE_START") ?? col(r, "START_DATE")),
    TimephaseEnd: parseAstaDate(col(r, "LINKABLE_FINISH") ?? col(r, "END_DATE")),
    ID: Number(col(r, "PERMANENT_SCHEDUL_ALLOCATIONID") ?? col(r, "ID") ?? 0),
    ResourceName: null as string | null,
    ResourceFullName: null as string | null,
    UniqueTaskID: null as string | null,
    ActivityID: Number(col(r, "ALLOCATION_OF") ?? col(r, "ALLOCATED_TO") ?? 0),
    BaselineEffort: null as number | null,
    Effort: parseAstaDurationHours(col(r, "EFFORT")),
    ActualEffort: parseAstaDurationHours(col(r, "ACTUAL_EFFORT") ?? col(r, "GIVEN_ALLOCATION")),
  }));

  db.close();

  return {
    planningData,
    projects,
    progressPeriods,
    codeLibraries,
    codeLibraryEntries,
    expanded,
    bars,
    milestones,
    taskCompletedSections,
    taskDurationSlices: [],
    tasks,
    allAssignedCodes,
    bsln,
    links,
    allocationTimephased,
  };
}
