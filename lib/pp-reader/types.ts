// Mirrors the Supabase BI tables defined in the migration.
// Each row type matches one INSERT into the corresponding table.

export interface PlanningDataRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  Author: string | null;
  ShortName: string | null;
  LongName: string | null;
  ShortFileName: string | null;
  LongFileName: string | null;
  ReportDate: Date | null;
  CurrentUserName: string | null;
  CurrentBaselineID: number | null;
}

export interface ProjectRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  ID: number;
  Name: string | null;
  ShortName: string | null;
  LongName: string | null;
  ShortFileName: string | null;
  LongFileName: string | null;
  ProjectName: string | null;
  ProjectFullName: string | null;
}

export interface ProgressPeriodRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  Name: string | null;
  PathName: string | null;
  FullName: string | null;
  Reportdate: Date | null;
}

export interface CodeLibraryRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  Name: string | null;
  SingleSelect: number | null;
}

export interface CodeLibraryEntryRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  Name: string | null;
  Lineage: string;
  OrderString: string;
  ShortName: string;
  PathName: string;
  FullName: string;
  ParentName: string;
  LibraryName: string;
  LibraryID: number | null;
  SortOrder: number;
}

export interface ExpandedRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  ProjectID: number;
  Name: string | null;
  PathName: string | null;
  ParentContainer: number | null;
  Lineage: string | null;
  Type: string | null;
  TaskOID: number | null;
  BarID: number | null;
  BarNaturalOrder: number | null;
  NaturalOrder: number | null;
  UniqueTaskID: string | null;
  Notes: string | null;
  StartDate: Date | null;
  Finish: Date | null;
  DurationDays: number | null;
  DurationHours: number | null;
  ActualStart: Date | null;
  ActualFinish: Date | null;
  BaselineStart: Date | null;
  BaselineFinish: Date | null;
  PercentComplete: number | null;
  CalendarId: number | null;
  Calendar: string | null;
  DurationPercentComplete: number | null;
  PlannedPercentComplete: number | null;
  OverallPercentComplete: number | null;
  TotalFloat: number | null;
  OriginalDuration: number | null;
  ConstraintFlag: string | null;
  Predecessors: string | null;
  Successors: string | null;
  Critical: number | null;
  NearlyCritical: number | null;
  LongestPath: number | null;
  EarlyStart: Date | null;
  EarlyFinish: Date | null;
  LateStart: Date | null;
  LateFinish: Date | null;
  BaselineEarlyStart: Date | null;
  BaselineEarlyFinish: Date | null;
  BaselineLateStart: Date | null;
  BaselineLateFinish: Date | null;
  BaselineEffort: number | null;
}

export interface BarRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  ProjectID: number;
  PathName: string | null;
  Name: string | null;
  Lineage: string | null;
  ParentName: string | null;
  ParentId: number | null;
  BarNaturalOrder: number | null;
  NaturalOrder: number | null;
  StartDate: Date | null;
  Finish: Date | null;
  ActualStart: Date | null;
  ActualFinish: Date | null;
  BaselineStart: Date | null;
  BaselineFinish: Date | null;
  PercentComplete: number | null;
  DurationPercentComplete: number | null;
  BaselineEarlyStart: Date | null;
  BaselineEarlyFinish: Date | null;
  BaselineLateStart: Date | null;
  BaselineLateFinish: Date | null;
}

export interface MilestoneRow extends Omit<ExpandedRow, "DurationDays" | "DurationHours"> {
  DurationHours: number | null;
  DurationDays: number | null;
  OriginalStart: Date | null;
  OriginalFinish: Date | null;
  BufferTask: number | null;
}

export interface TaskCompletedSectionRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  ID: number;
  ProjectID: number;
  Parent: number | null;
  ParentName: string | null;
  PeriodID: number | null;
  ActStart: Date | null;
  ActFinish: Date | null;
  OPC: number | null;
}

export interface TaskDurationSliceRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  StartDate: Date | null;
  FinishDate: Date | null;
  TimephaseStart: Date | null;
  TimephaseEnd: Date | null;
  LiveDuration: number | null;
  PlannedDuration: number | null;
  ActualDuration: number | null;
  PseudoEarnedDuration: number | null;
  PPC: number | null;
}

export interface TaskRow extends ExpandedRow {
  OriginalStart: Date | null;
  OriginalFinish: Date | null;
  BufferTask: number | null;
}

export interface AllAssignedCodesRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  ID: number;
  Allcodes: string | null;
  ObjectType: string | null;
}

export interface BslnRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineIDNumber: number;
  ObjectID: number;
  Name: string | null;
  PathName: string | null;
  BaselineProjectId: number | null;
  Active: number | null;
  CreationDate: Date | null;
  LastEditedDate: Date | null;
}

export interface LinkRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  ID: number;
  ShortName: string | null;
  LongName: string | null;
  ShortFileName: string | null;
  LongFileName: string | null;
  StartID: number | null;
  StartFullName: string | null;
  StartUTID: string | null;
  EndID: number | null;
  EndFullName: string | null;
  EndUTID: string | null;
  Type: string | null;
  Category: string | null;
  Slope: number | null;
  TotalLeadLag: number | null;
  StartLeadLag: number | null;
  EndLeadLag: number | null;
  Comments: string | null;
  Unschedulable: number | null;
  Driving: number | null;
  Complete: number | null;
  Critical: number | null;
  OnLoop: number | null;
  LongestPath: number | null;
}

export interface AllocationTimephasedRow {
  RunDate: Date | null;
  RunNumber: number | null;
  PlanningDataID: string;
  PlanningDataVersion: number;
  BaselineID: number;
  TimephaseStart: Date | null;
  TimephaseEnd: Date | null;
  ID: number;
  ResourceName: string | null;
  ResourceFullName: string | null;
  UniqueTaskID: string | null;
  ActivityID: number;
  BaselineEffort: number | null;
  Effort: number | null;
  ActualEffort: number | null;
}

export interface PpExportData {
  planningData: PlanningDataRow[];
  projects: ProjectRow[];
  progressPeriods: ProgressPeriodRow[];
  codeLibraries: CodeLibraryRow[];
  codeLibraryEntries: CodeLibraryEntryRow[];
  expanded: ExpandedRow[];
  bars: BarRow[];
  milestones: MilestoneRow[];
  taskCompletedSections: TaskCompletedSectionRow[];
  taskDurationSlices: TaskDurationSliceRow[];
  tasks: TaskRow[];
  allAssignedCodes: AllAssignedCodesRow[];
  bsln: BslnRow[];
  links: LinkRow[];
  allocationTimephased: AllocationTimephasedRow[];
}
