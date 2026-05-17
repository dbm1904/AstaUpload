// Reads older Asta PowerProject files that use the Microsoft Access (Jet/MDB)
// format.  These are .pp files where the first 8 bytes are the OLE Compound
// Document magic D0 CF 11 E0 A1 B1 1A E1.
//
// Uses the 'mdb-reader' npm package (pure JavaScript — no native bindings).
// Column names follow the MDB abbreviated naming conventions from MPXJ's
// FileFormat8020 and are normalised via MDB_ALIASES before being mapped.

import MDBReader from "mdb-reader";
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

type Row = Record<string, unknown>;

function normalise(row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    out[MDB_ALIASES[k] ?? k] = v;
  }
  return out;
}

function col(row: Row, name: string): unknown {
  return row[name] ?? null;
}

function getRows(reader: MDBReader, table: string): Row[] {
  const names = reader.getTableNames();
  if (!names.includes(table)) return [];
  try {
    return reader.getTable(table).getData().map(normalise);
  } catch {
    return [];
  }
}

export async function readMdbPpFile(buffer: Buffer): Promise<PpExportData> {
  const reader = new MDBReader(buffer);

  const runDate = new Date();
  const runNumber = 1;

  const psRows = getRows(reader, "project_summary");
  const ps = psRows[0] ?? {};

  const guid = String(
    col(ps, PROJECT_SUMMARY_COLS.projectGuid) ?? col(ps, "UNIQUE_ID") ?? crypto.randomUUID()
  );

  const planningDataId = guid;
  const planningDataVersion = 0;
  const baselineId = 0;

  const planningData = [
    {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      Author: col(ps, PROJECT_SUMMARY_COLS.projectBy) as string | null,
      ShortName: col(ps, PROJECT_SUMMARY_COLS.shortName) as string | null,
      LongName: col(ps, PROJECT_SUMMARY_COLS.longName) as string | null,
      ShortFileName: col(ps, PROJECT_SUMMARY_COLS.shortFileName) as string | null,
      LongFileName: col(ps, PROJECT_SUMMARY_COLS.longFileName) as string | null,
      ReportDate: parseAstaDate(col(ps, PROJECT_SUMMARY_COLS.reportDate)),
      CurrentUserName: col(ps, PROJECT_SUMMARY_COLS.currentUser) as string | null,
      CurrentBaselineID: baselineId,
    },
  ];

  const ppRows = getRows(reader, "progress_period");
  const progressPeriods = ppRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, "PROGRESS_PERIODID") ?? col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    PathName: col(r, "PATHNAME") as string | null,
    FullName: col(r, "FULLNAME") ?? col(r, "NAME") as string | null,
    Reportdate: parseAstaDate(col(r, "REPORT_DATE")),
  }));

  const clRows = getRows(reader, "code_library");
  const codeLibraries = clRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, "CODE_LIBRARYID") ?? col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    SingleSelect: null as number | null,
  }));

  const cleRows = getRows(reader, "code_library_entry");
  const codeLibraryEntries = cleRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, "CODE_LIBRARY_ENTRYID") ?? col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    Lineage: String(col(r, "PARENTS") ?? ""),
    OrderString: String(col(r, "SORT_ORDER") ?? ""),
    ShortName: String(col(r, "SHORT_NAME") ?? col(r, "NAME") ?? ""),
    PathName: String(col(r, "PATHNAME") ?? col(r, "NAME") ?? ""),
    FullName: String(col(r, "FULLNAME") ?? col(r, "NAME") ?? ""),
    ParentName: String(col(r, "PARENTNAME") ?? ""),
    LibraryName: String(col(r, "CODE_LIBRARY_NAME") ?? ""),
    LibraryID: col(r, "CODE_LIBRARY") != null ? Number(col(r, "CODE_LIBRARY")) : null,
    SortOrder: Number(col(r, "SORT_ORDER") ?? 0),
  }));

  const barRowsRaw = getRows(reader, "bar");
  const barMap = new Map<number, Row>(barRowsRaw.map((b) => [Number(col(b, BAR_COLS.id)), b]));

  const bars = barRowsRaw.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, BAR_COLS.id) ?? 0),
    ProjectID: 0,
    PathName: col(r, "PATHNAME") as string | null,
    Name: col(r, BAR_COLS.name) as string | null,
    Lineage: col(r, "PARENTS") as string | null,
    ParentName: null as string | null,
    ParentId: col(r, BAR_COLS.expandedTask) != null ? Number(col(r, BAR_COLS.expandedTask)) : null,
    BarNaturalOrder: col(r, BAR_COLS.naturalOrder) != null ? Number(col(r, BAR_COLS.naturalOrder)) : null,
    NaturalOrder: col(r, BAR_COLS.naturalOrder) != null ? Number(col(r, BAR_COLS.naturalOrder)) : null,
    StartDate: parseAstaDate(col(r, BAR_COLS.start)),
    Finish: parseAstaDate(col(r, BAR_COLS.finish)),
    ActualStart: null as Date | null,
    ActualFinish: null as Date | null,
    BaselineStart: null as Date | null,
    BaselineFinish: null as Date | null,
    PercentComplete: null as number | null,
    DurationPercentComplete: null as number | null,
    BaselineEarlyStart: null as Date | null,
    BaselineEarlyFinish: null as Date | null,
    BaselineLateStart: null as Date | null,
    BaselineLateFinish: null as Date | null,
  }));

  const etRows = getRows(reader, "expanded_task");
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
      ProjectID: 0,
      Name: col(r, EXPANDED_TASK_COLS.name) as string | null,
      PathName: col(r, "PATHNAME") as string | null,
      ParentContainer: col(r, EXPANDED_TASK_COLS.etask) != null ? Number(col(r, EXPANDED_TASK_COLS.etask)) : null,
      Lineage: col(r, "PARENTS") as string | null,
      Type: null as string | null,
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
      ActualStart: null as Date | null,
      ActualFinish: null as Date | null,
      BaselineStart: null as Date | null,
      BaselineFinish: null as Date | null,
      PercentComplete: col(r, EXPANDED_TASK_COLS.percentComplete) != null ? Number(col(r, EXPANDED_TASK_COLS.percentComplete)) : null,
      CalendarId: null as number | null,
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

  const projects = expanded
    .filter((e) => e.ParentContainer === null || e.ParentContainer === 0)
    .map((e) => ({
      RunDate: e.RunDate,
      RunNumber: e.RunNumber,
      PlanningDataID: e.PlanningDataID,
      PlanningDataVersion: e.PlanningDataVersion,
      ID: e.ID,
      Name: e.Name,
      ShortName: col(ps, PROJECT_SUMMARY_COLS.shortName) as string | null,
      LongName: col(ps, PROJECT_SUMMARY_COLS.longName) as string | null,
      ShortFileName: col(ps, PROJECT_SUMMARY_COLS.shortFileName) as string | null,
      LongFileName: col(ps, PROJECT_SUMMARY_COLS.longFileName) as string | null,
      ProjectName: e.Name,
      ProjectFullName: e.PathName ?? e.Name,
    }));

  const taskRowsRaw = getRows(reader, "task");
  const tasks = taskRowsRaw.map((r) => {
    const durationH = parseAstaDurationHours(col(r, TASK_COLS.durationHours));
    const barId = col(r, TASK_COLS.bar) != null ? Number(col(r, TASK_COLS.bar)) : null;
    const barRow = barId != null ? barMap.get(barId) : null;
    return {
      RunDate: runDate,
      RunNumber: runNumber,
      PlanningDataID: planningDataId,
      PlanningDataVersion: planningDataVersion,
      BaselineID: baselineId,
      ID: Number(col(r, TASK_COLS.id) ?? 0),
      ProjectID: 0,
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
      TotalFloat: parseAstaDurationHours(col(r, TASK_COLS.totalFloat)),
      OriginalDuration: parseAstaDurationHours(col(r, TASK_COLS.originalDuration)),
      LongestPath: col(r, TASK_COLS.longestPath) != null ? Number(col(r, TASK_COLS.longestPath)) : null,
      NearlyCritical: null as number | null,
      StartDate: parseAstaDate(col(r, TASK_COLS.start)),
      Finish: parseAstaDate(col(r, TASK_COLS.finish)),
      DurationHours: durationH,
      DurationDays: durationHoursToDays(durationH),
      CalendarId: null as number | null,
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

  const msRowsRaw = getRows(reader, "milestone");
  const milestones = msRowsRaw.map((r) => {
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
      ProjectID: 0,
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
      TotalFloat: null as number | null,
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
      LateStart: null as Date | null,
      LateFinish: null as Date | null,
      BaselineEarlyStart: null as Date | null,
      BaselineEarlyFinish: null as Date | null,
      BaselineLateStart: null as Date | null,
      BaselineLateFinish: null as Date | null,
      BaselineEffort: null as number | null,
      BufferTask: null as number | null,
    };
  });

  const tcsRows = getRows(reader, "task_completed_section");
  const taskCompletedSections = tcsRows.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    ID: Number(col(r, "TASK_COMPLETED_SECTIONID") ?? col(r, "ID") ?? 0),
    ProjectID: 0,
    Parent: col(r, "TASK") != null ? Number(col(r, "TASK")) : null,
    ParentName: null as string | null,
    PeriodID: null as number | null,
    ActStart: parseAstaDate(col(r, "ACTUAL_START")),
    ActFinish: parseAstaDate(col(r, "ACTUAL_END") ?? col(r, "ACTUAL_FINISH")),
    OPC: col(r, "OVERALL_PERCENT_COMPLETE") != null ? Number(col(r, "OVERALL_PERCENT_COMPLETE")) : null,
  }));

  const linkRowsRaw = getRows(reader, "link");
  const links = linkRowsRaw.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineID: baselineId,
    ID: Number(col(r, LINK_COLS.id) ?? 0),
    ShortName: null as string | null,
    LongName: null as string | null,
    ShortFileName: null as string | null,
    LongFileName: null as string | null,
    StartID: col(r, LINK_COLS.startTask) != null ? Number(col(r, LINK_COLS.startTask)) : null,
    StartFullName: null as string | null,
    StartUTID: null as string | null,
    EndID: col(r, LINK_COLS.endTask) != null ? Number(col(r, LINK_COLS.endTask)) : null,
    EndFullName: null as string | null,
    EndUTID: null as string | null,
    Type: col(r, LINK_COLS.linkKind) as string | null,
    Category: null as string | null,
    Slope: null as number | null,
    TotalLeadLag: parseAstaDurationHours(col(r, LINK_COLS.startLagHours)),
    StartLeadLag: parseAstaDurationHours(col(r, LINK_COLS.startLagHours)),
    EndLeadLag: parseAstaDurationHours(col(r, LINK_COLS.endLagHours)),
    Comments: null as string | null,
    Unschedulable: null as number | null,
    Driving: null as number | null,
    Complete: null as number | null,
    Critical: null as number | null,
    OnLoop: null as number | null,
    LongestPath: null as number | null,
  }));

  const bslnRowsRaw = getRows(reader, "baseline_summary");
  const bsln = bslnRowsRaw.map((r) => ({
    RunDate: runDate,
    RunNumber: runNumber,
    PlanningDataID: planningDataId,
    PlanningDataVersion: planningDataVersion,
    BaselineIDNumber: Number(col(r, "BASELINE_ID") ?? col(r, "ID") ?? 0),
    ObjectID: Number(col(r, "ID") ?? 0),
    Name: col(r, "NAME") as string | null,
    PathName: null as string | null,
    BaselineProjectId: null as number | null,
    Active: null as number | null,
    CreationDate: parseAstaDate(col(r, "CREATION_DATE")),
    LastEditedDate: parseAstaDate(col(r, "UPDATE_DATE")),
  }));

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
    allAssignedCodes: [],
    bsln,
    links,
    allocationTimephased: [],
  };
}
