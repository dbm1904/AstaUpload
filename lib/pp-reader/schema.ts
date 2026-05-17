// Internal column names for Asta PowerProject SQLite databases.
// Derived from MPXJ (joniles/mpxj, LGPL) FileFormat13004 + AstaReader analysis.
//
// MDB (older .pp) format uses abbreviated names; SQLite (newer) uses readable names.
// This file covers the SQLite format.  The reader falls back to MDB variants when
// a column is absent.

export const MDB_ALIASES: Record<string, string> = {
  // task / expanded_task / milestone - old MDB names → canonical names
  NARE: "NAME",
  STARZ: "LINKABLE_START",
  ENJ: "LINKABLE_FINISH",
  OVERALL_PERCENV_COMPLETE: "OVERALL_PERCENT_COMPLETE",
  CONSTRAINU: "CONSTRAINT_FLAG",
  CALENDAU: "CALENDAR",
  GIVEN_DURATIONHOURS: "DURATIOTHOURS",
  ACTUAL_DURATIONHOURS: "ACTUAL_DURATION",
  NOTET: "NOTES",
  DURATION_TIMJ_UNIT: "DURATION_TIME_UNIT",
  NATURAO_ORDER: "NATURAL_ORDER",
  // bar - old MDB names
  NAMH: "NAME",
  STARV: "BAR_START",
  ENF: "BAR_FINISH",
  // link - old MDB names
  LINKID: "ID",
  START_LAG_TIMEHOURS: "START_LAG_TIME",
  END_LAG_TIMEHOURS: "END_LAG_TIME",
  TYPI: "LINK_KIND",
  // project_summary - old MDB names
  STARU: "PROJECT_START",
  ENE: "PROJECT_END",
  DURATIONHOURS: "DURATION",
};

// Primary key column for each table
export const TABLE_PK: Record<string, string> = {
  task: "TASKID",
  expanded_task: "EXPANDED_TASKID",
  bar: "BARID",
  milestone: "MILESTONEID",
  hammock_task: "HAMMOCK_TASKID",
  link: "LINKID",
  progress_period: "PROGRESS_PERIODID",
  project_summary: "ID",
  baseline_summary: "BASELINE_ID",
  code_library: "CODE_LIBRARYID",
  code_library_entry: "CODE_LIBRARY_ENTRYID",
  code_library_assignabl_codes: "CODE_LIBRARY_ASSIGNABL_CODESID",
  task_completed_section: "TASK_COMPLETED_SECTIONID",
  permanent_schedul_allocation: "PERMANENT_SCHEDUL_ALLOCATIONID",
  permanent_resource: "PERMANENT_RESOURCEID",
};

// Columns expected in the task table (FileFormat13004)
export const TASK_COLS = {
  id: "TASKID",
  name: "NAME",
  start: "LINKABLE_START",
  finish: "LINKABLE_FINISH",
  durationHours: "DURATIOTHOURS",
  actualDuration: "ACTUAL_DURATION",
  percentComplete: "OVERALL_PERCENT_COMPLETE",
  earlyStart: "EARLY_START_DATE",
  lateStart: "LATE_START_DATE",
  earlyFinish: "EARLY_END_DATE_RS",
  lateFinish: "LATE_END_DATE_RS",
  notes: "NOTES",
  uniqueTaskId: "UNIQUE_TASK_ID",
  bar: "BAR",
  calendar: "CALENDAR",
  constraintFlag: "CONSTRAINT_FLAG",
  naturalOrder: "NATURAL_ORDER",
  critical: "CRITICAM",
  longestPath: "LONGEST_PATH",
  bufferTask: "BUFFER_TASK",
  originalStart: "GIVEN_START",
  originalDuration: "GIVEN_DURATION",
  totalFloat: "FREE_FLOAT",
  wbs: "WBS",
  etask: "EXPANDED_TASK",
} as const;

// Columns expected in the expanded_task table
export const EXPANDED_TASK_COLS = {
  id: "EXPANDED_TASKID",
  name: "NAME",
  bar: "BAR",
  naturalOrder: "NATURAL_ORDER",
  percentComplete: "OVERALL_PERCENT_COMPLETE",
  start: "LINKABLE_START",
  finish: "LINKABLE_FINISH",
  notes: "NOTES",
  wbs: "WBS",
  etask: "EXPANDED_TASK",
} as const;

// Columns expected in the bar table
export const BAR_COLS = {
  id: "BARID",
  name: "NAME",
  start: "BAR_START",
  finish: "BAR_FINISH",
  naturalOrder: "NATURAL_ORDER",
  expandedTask: "EXPANDED_TASK",
  percentComplete: "PERCENT_COMPLETE",
  priority: "PRIORITY",
} as const;

// Columns expected in the milestone table
export const MILESTONE_COLS = {
  id: "MILESTONEID",
  name: "NAME",
  date: "GIVEN_DATE_TIME",
  start: "LINKABLE_START",
  finish: "LINKABLE_FINISH",
  earlyStart: "EARLY_START_DATE",
  lateStart: "LATE_START_DATE",
  earlyFinish: "EARLY_END_DATE_RS",
  lateFinish: "LATE_END_DATE_RS",
  uniqueTaskId: "UNIQUE_TASK_ID",
  naturalOrder: "NATURAL_ORDER",
  percentComplete: "OVERALL_PERCENT_COMPLETE",
  bar: "BAR",
  etask: "EXPANDED_TASK",
  notes: "NOTES",
  constraintFlag: "CONSTRAINT_FLAG",
  critical: "CRITICAM",
  longestPath: "LONGEST_PATH",
  bufferTask: "BUFFER_TASK",
  totalFloat: "FREE_FLOAT",
  originalDuration: "GIVEN_DURATION",
} as const;

// Columns expected in the link table
export const LINK_COLS = {
  id: "LINKID",
  startTask: "START_TASK",
  endTask: "END_TASK",
  linkKind: "LINK_KIND",
  startLagHours: "START_LAG_TIMEHOURS",
  endLagHours: "END_LAG_TIMEHOURS",
  slope: "SLOPE",
  comments: "COMMENTS",
  driving: "DRIVING",
  complete: "COMPLETE",
  critical: "CRITICAL",
  onLoop: "ON_LOOP",
  longestPath: "LONGEST_PATH",
  unschedulable: "UNSCHEDULABLE",
} as const;

// Columns expected in project_summary
export const PROJECT_SUMMARY_COLS = {
  projectStart: "PROJECT_START",
  projectEnd: "PROJECT_END",
  shortName: "SHORT_NAME",
  longName: "LONG_NAME",
  shortFileName: "SHORT_FILE_NAME",
  longFileName: "LONG_FILE_NAME",
  projectBy: "PROJECT_BY",
  reportDate: "LAST_EDITED_DATE",
  currentUser: "CURRENT_USER",
  projectGuid: "UNIQUE_ID",
  version: "SCHVER",
} as const;

// Asta internally uses a base date epoch different from Unix.
// Dates in the SQLite format are stored as milliseconds from the Unix epoch
// (confirmed by MPXJ's parseEpochTimestamp / 1000 pattern).
export const EPOCH_THRESHOLD = 1e10; // values > 1e10 are ms, < 1e10 are seconds
export const OLE_EPOCH = new Date("1899-12-30").getTime(); // OLE Automation day 0

export function parseAstaDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw;

  if (typeof raw === "number") {
    if (raw === 0) return null;
    if (raw > EPOCH_THRESHOLD) return new Date(raw);          // milliseconds
    if (raw > 86400 * 365 * 50) return new Date(raw * 1000); // seconds (after 1970)
    // OLE Automation date (days since 1899-12-30)
    return new Date(OLE_EPOCH + raw * 86400 * 1000);
  }

  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    // Try compact YYYYMMDDTHHMMSS
    const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
  }

  return null;
}

export function parseAstaDurationHours(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") { const n = parseFloat(raw); return isNaN(n) ? null : n; }
  return null;
}

export function durationHoursToDays(hours: number | null, workHoursPerDay = 8): number | null {
  if (hours === null) return null;
  return hours / workHoursPerDay;
}
