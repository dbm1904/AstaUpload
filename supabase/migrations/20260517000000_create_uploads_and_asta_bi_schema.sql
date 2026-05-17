-- Application intake schema for Vercel uploads and Windows BI export jobs.
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'asta-powerproject-uploads') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('asta-powerproject-uploads', 'asta-powerproject-uploads', false, 52428800);
  end if;
end $$;

create table if not exists public.project_uploads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text not null,
  project_name text not null,
  project_reference text,
  project_summary text,
  original_file_name text not null,
  storage_bucket text not null default 'asta-powerproject-uploads',
  storage_path text not null,
  file_size_bytes bigint not null,
  content_type text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'import_job_status' and typnamespace = 'public'::regnamespace) then
    create type public.import_job_status as enum ('pending', 'processing', 'completed', 'failed');
  end if;
end $$;

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.project_uploads(id) on delete cascade,
  status public.import_job_status not null default 'pending',
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempts integer not null default 0,
  worker_name text,
  asta_result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_jobs_status_created_at_idx on public.import_jobs(status, created_at);
create index if not exists import_jobs_upload_id_idx on public.import_jobs(upload_id);

create or replace function public.touch_import_job_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_import_job_updated_at on public.import_jobs;
create trigger touch_import_job_updated_at
before update on public.import_jobs
for each row execute function public.touch_import_job_updated_at();

create or replace function public.claim_next_import_job(worker text)
returns table (
  job_id uuid,
  upload_id uuid,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  customer_name text,
  customer_email text,
  project_name text,
  project_reference text,
  project_summary text
)
language plpgsql
security definer
as $$
begin
  return query
  with next_job as (
    select ij.id
    from public.import_jobs ij
    where ij.status = 'pending'
    order by ij.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.import_jobs ij
    set status = 'processing',
        locked_at = now(),
        started_at = coalesce(ij.started_at, now()),
        attempts = ij.attempts + 1,
        worker_name = worker,
        error_message = null
    from next_job
    where ij.id = next_job.id
    returning ij.id, ij.upload_id
  )
  select claimed.id,
         pu.id,
         pu.storage_bucket,
         pu.storage_path,
         pu.original_file_name,
         pu.customer_name,
         pu.customer_email,
         pu.project_name,
         pu.project_reference,
         pu.project_summary
  from claimed
  join public.project_uploads pu on pu.id = claimed.upload_id;
end;
$$;

create or replace function public.complete_import_job(job uuid, result jsonb)
returns void language plpgsql security definer as $$
begin
  update public.import_jobs
  set status = 'completed', completed_at = now(), asta_result = result, error_message = null
  where id = job;
end;
$$;

create or replace function public.fail_import_job(job uuid, message text)
returns void language plpgsql security definer as $$
begin
  update public.import_jobs
  set status = 'failed', completed_at = now(), error_message = message
  where id = job;
end;
$$;

alter table public.project_uploads enable row level security;
alter table public.import_jobs enable row level security;



-- Asta PowerProject Business Intelligence schema converted from the SQL Server DDL in this repository.
drop table if exists public."PlanningData" cascade;
create table public."PlanningData" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "Author" text,
  "ShortName" text,
  "LongName" text,
  "ShortFileName" text,
  "LongFileName" text,
  "ReportDate" timestamptz,
  "CurrentUserName" text,
  "CurrentBaselineID" integer
);

drop table if exists public."Project" cascade;
create table public."Project" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "ID" integer not null,
  "Name" text,
  "ShortName" text,
  "LongName" text,
  "ShortFileName" text,
  "LongFileName" text,
  "ProjectName" text,
  "ProjectFullName" text
);

drop table if exists public."ProgressPeriod" cascade;
create table public."ProgressPeriod" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "Name" text,
  "PathName" text,
  "FullName" text,
  "Reportdate" timestamptz
);

drop table if exists public."CodeLibrary" cascade;
create table public."CodeLibrary" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "Name" text,
  "SingleSelect" integer
);

drop table if exists public."CodeLibraryEntry" cascade;
create table public."CodeLibraryEntry" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "Name" text,
  "Lineage" text not null,
  "OrderString" text not null,
  "ShortName" text not null,
  "PathName" text not null,
  "FullName" text not null,
  "ParentName" text not null,
  "LibraryName" text not null,
  "LibraryID" integer,
  "SortOrder" integer not null
);

drop table if exists public."Expanded" cascade;
create table public."Expanded" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "ProjectID" integer not null,
  "Name" text,
  "PathName" text,
  "ParentContainer" integer,
  "Lineage" text,
  "Type" text,
  "TaskOID" integer,
  "BarID" integer,
  "BarNaturalOrder" integer,
  "NaturalOrder" integer,
  "UniqueTaskID" text,
  "Notes" text,
  "StartDate" timestamptz,
  "Finish" timestamptz,
  "DurationDays" double precision,
  "DurationHours" double precision,
  "ActualStart" timestamptz,
  "ActualFinish" timestamptz,
  "BaselineStart" timestamptz,
  "BaselineFinish" timestamptz,
  "PercentComplete" double precision,
  "CalendarId" integer,
  "Calendar" text,
  "DurationPercentComplete" double precision,
  "PlannedPercentComplete" double precision,
  "OverallPercentComplete" double precision,
  "TotalFloat" double precision,
  "OriginalDuration" double precision,
  "ConstraintFlag" text,
  "Predecessors" text,
  "Successors" text,
  "Critical" integer,
  "NearlyCritical" integer,
  "LongestPath" integer,
  "EarlyStart" timestamptz,
  "EarlyFinish" timestamptz,
  "LateStart" timestamptz,
  "LateFinish" timestamptz,
  "BaselineEarlyStart" timestamptz,
  "BaselineEarlyFinish" timestamptz,
  "BaselineLateStart" timestamptz,
  "BaselineLateFinish" timestamptz,
  "BaselineEffort" double precision
);

drop table if exists public."Bar" cascade;
create table public."Bar" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "ProjectID" integer not null,
  "PathName" text,
  "Name" text,
  "Lineage" text,
  "ParentName" text,
  "ParentId" integer,
  "BarNaturalOrder" integer,
  "NaturalOrder" integer,
  "StartDate" timestamptz,
  "Finish" timestamptz,
  "ActualStart" timestamptz,
  "ActualFinish" timestamptz,
  "BaselineStart" timestamptz,
  "BaselineFinish" timestamptz,
  "PercentComplete" double precision,
  "DurationPercentComplete" double precision,
  "BaselineEarlyStart" timestamptz,
  "BaselineEarlyFinish" timestamptz,
  "BaselineLateStart" timestamptz,
  "BaselineLateFinish" timestamptz
);

drop table if exists public."Milestone" cascade;
create table public."Milestone" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "ProjectID" integer not null,
  "PathName" text,
  "ParentContainer" integer,
  "Lineage" text,
  "Name" text,
  "Notes" text,
  "Type" text,
  "TaskOID" integer,
  "BarID" integer,
  "BarNaturalOrder" integer,
  "NaturalOrder" integer,
  "UniqueTaskID" text,
  "StartDate" timestamptz,
  "Finish" timestamptz,
  "DurationHours" double precision,
  "DurationDays" double precision,
  "CalendarId" integer,
  "Calendar" text,
  "DurationPercentComplete" double precision,
  "ActualStart" timestamptz,
  "ActualFinish" timestamptz,
  "PercentComplete" double precision,
  "BaselineStart" timestamptz,
  "BaselineFinish" timestamptz,
  "Critical" integer,
  "EarlyStart" timestamptz,
  "EarlyFinish" timestamptz,
  "TotalFloat" double precision,
  "OriginalDuration" double precision,
  "LongestPath" integer,
  "NearlyCritical" integer,
  "OverallPercentComplete" double precision,
  "Predecessors" text,
  "Successors" text,
  "ConstraintFlag" text,
  "PlannedPercentComplete" double precision,
  "OriginalStart" timestamptz,
  "OriginalFinish" timestamptz,
  "LateStart" timestamptz,
  "LateFinish" timestamptz,
  "BaselineEarlyStart" timestamptz,
  "BaselineEarlyFinish" timestamptz,
  "BaselineLateStart" timestamptz,
  "BaselineLateFinish" timestamptz,
  "BaselineEffort" double precision,
  "BufferTask" integer
);

drop table if exists public."TaskCompletedSection" cascade;
create table public."TaskCompletedSection" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "ID" integer not null,
  "ProjectID" integer not null,
  "Parent" integer,
  "ParentName" text,
  "PeriodID" integer,
  "ActStart" timestamptz,
  "ActFinish" timestamptz,
  "OPC" double precision
);

drop table if exists public."TaskDurationSlice" cascade;
create table public."TaskDurationSlice" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "StartDate" timestamptz,
  "FinishDate" timestamptz,
  "TimephaseStart" timestamptz,
  "TimephaseEnd" timestamptz,
  "LiveDuration" double precision,
  "PlannedDuration" double precision,
  "ActualDuration" double precision,
  "PseudoEarnedDuration" double precision,
  "PPC" double precision
);

drop table if exists public."Task" cascade;
create table public."Task" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "ProjectID" integer not null,
  "PathName" text,
  "ParentContainer" integer,
  "Lineage" text,
  "Name" text,
  "BaselineStart" timestamptz,
  "BaselineFinish" timestamptz,
  "PlannedPercentComplete" double precision,
  "OriginalStart" timestamptz,
  "OriginalFinish" timestamptz,
  "Notes" text,
  "Type" text,
  "TaskOID" integer,
  "BarID" integer,
  "BarNaturalOrder" integer,
  "NaturalOrder" integer,
  "UniqueTaskID" text,
  "Critical" integer,
  "EarlyStart" timestamptz,
  "EarlyFinish" timestamptz,
  "LateStart" timestamptz,
  "LateFinish" timestamptz,
  "TotalFloat" double precision,
  "OriginalDuration" double precision,
  "LongestPath" integer,
  "NearlyCritical" integer,
  "StartDate" timestamptz,
  "Finish" timestamptz,
  "DurationHours" double precision,
  "DurationDays" double precision,
  "CalendarId" integer,
  "Calendar" text,
  "DurationPercentComplete" double precision,
  "ActualStart" timestamptz,
  "ActualFinish" timestamptz,
  "PercentComplete" double precision,
  "OverallPercentComplete" double precision,
  "Predecessors" text,
  "Successors" text,
  "ConstraintFlag" text,
  "BaselineEarlyStart" timestamptz,
  "BaselineEarlyFinish" timestamptz,
  "BaselineLateStart" timestamptz,
  "BaselineLateFinish" timestamptz,
  "BaselineEffort" double precision,
  "BufferTask" integer
);

drop table if exists public."AllAssignedCodes" cascade;
create table public."AllAssignedCodes" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "ID" integer not null,
  "Allcodes" text,
  "ObjectType" text
);

drop table if exists public."Bsln" cascade;
create table public."Bsln" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineIDNumber" integer not null,
  "ObjectID" integer not null,
  "Name" text,
  "PathName" text,
  "BaselineProjectId" integer,
  "Active" integer,
  "CreationDate" timestamptz,
  "LastEditedDate" timestamptz
);

drop table if exists public."Link" cascade;
create table public."Link" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "ID" integer not null,
  "ShortName" text,
  "LongName" text,
  "ShortFileName" text,
  "LongFileName" text,
  "StartID" integer,
  "StartFullName" text,
  "StartUTID" text,
  "EndID" integer,
  "EndFullName" text,
  "EndUTID" text,
  "Type" text,
  "Category" text,
  "Slope" double precision,
  "TotalLeadLag" double precision,
  "StartLeadLag" double precision,
  "EndLeadLag" double precision,
  "Comments" text,
  "Unschedulable" integer,
  "Driving" integer,
  "Complete" integer,
  "Critical" integer,
  "OnLoop" integer,
  "LongestPath" integer
);

drop table if exists public."AllocationTimephased" cascade;
create table public."AllocationTimephased" (
  "RunDate" timestamptz,
  "RunNumber" integer,
  "PlanningDataID" uuid not null,
  "PlanningDataVersion" integer not null,
  "BaselineID" integer not null,
  "TimephaseStart" timestamptz,
  "TimephaseEnd" timestamptz,
  "ID" integer not null,
  "ResourceName" text,
  "ResourceFullName" text,
  "UniqueTaskID" text,
  "ActivityID" integer not null,
  "BaselineEffort" double precision,
  "Effort" double precision,
  "ActualEffort" double precision
);
