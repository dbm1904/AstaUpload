<#
.SYNOPSIS
  Polls Supabase for Asta PowerProject upload jobs and invokes the PowerProject BI export.

.REQUIREMENTS
  - Windows host with Asta PowerProject Developers' Toolkit / COM automation available.
  - An ODBC driver and DSN/connection string that can write to the Supabase Postgres BI tables.
  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ASTA_BI_ODBC_CONNECTION_STRING environment variables.
#>

[CmdletBinding()]
param(
  [string]$WorkerName = $env:COMPUTERNAME,
  [string]$DownloadDirectory = (Join-Path $PSScriptRoot "downloads"),
  [int]$PollSeconds = 30,
  [string]$AstaUser = "Admin",
  [string]$AstaPassword = "",
  [ValidateSet("All", "None", "PlanningData")]
  [string]$Wipe = "None",
  [switch]$Once
)

$ErrorActionPreference = "Stop"

function Get-RequiredEnv([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Environment variable '$Name' is required."
  }
  return $value.TrimEnd("/")
}

$SupabaseUrl = Get-RequiredEnv "SUPABASE_URL"
$ServiceRoleKey = Get-RequiredEnv "SUPABASE_SERVICE_ROLE_KEY"
$OdbcConnectionString = Get-RequiredEnv "ASTA_BI_ODBC_CONNECTION_STRING"
$Headers = @{
  apikey = $ServiceRoleKey
  Authorization = "Bearer $ServiceRoleKey"
  "Content-Type" = "application/json"
}

New-Item -ItemType Directory -Force -Path $DownloadDirectory | Out-Null

function Invoke-SupabaseRpc([string]$FunctionName, [hashtable]$Body) {
  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/rpc/$FunctionName" -Headers $Headers -Body $json
}

function Get-SignedDownloadUrl([string]$Bucket, [string]$Path) {
  $encodedPath = ($Path -split "/" | ForEach-Object { [uri]::EscapeDataString($_) }) -join "/"
  $body = @{ expiresIn = 600 } | ConvertTo-Json
  $response = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/storage/v1/object/sign/$Bucket/$encodedPath" -Headers $Headers -Body $body
  return "$SupabaseUrl/storage/v1$($response.signedURL)"
}

function Invoke-AstaBiExport([string]$LocalFilePath) {
  $app = New-Object -COMObject Teamplan.Object
  $project = $app.Projects.OpenLocalProject($LocalFilePath, $AstaUser, $AstaPassword)

  $parameters = @{
    dataconnectiontype = "odbc"
    wipe = $Wipe
    parallel = $true
    connection_string = $OdbcConnectionString
  }

  $resultString = $project.PerformBIExport(($parameters | ConvertTo-Json -Depth 10))
  $result = $resultString | ConvertFrom-Json

  if ($result.PSObject.Properties.Name -contains "error") {
    throw ($result.error -replace ";", [Environment]::NewLine)
  }

  return $result
}

function Invoke-OneJob {
  $jobs = Invoke-SupabaseRpc "claim_next_import_job" @{ worker = $WorkerName }
  if ($null -eq $jobs -or $jobs.Count -eq 0) {
    return $false
  }

  $job = @($jobs)[0]
  $safeName = $job.original_file_name -replace '[^a-zA-Z0-9._-]', '_'
  $localPath = Join-Path $DownloadDirectory "$($job.upload_id)-$safeName"

  try {
    Write-Host "Processing job $($job.job_id) for upload $($job.upload_id)..."
    $downloadUrl = Get-SignedDownloadUrl $job.storage_bucket $job.storage_path
    Invoke-WebRequest -Uri $downloadUrl -OutFile $localPath

    $exportResult = Invoke-AstaBiExport $localPath
    Invoke-SupabaseRpc "complete_import_job" @{
      job = $job.job_id
      result = $exportResult
    } | Out-Null
    Write-Host "Completed job $($job.job_id)."
  }
  catch {
    $message = $_.Exception.Message
    Invoke-SupabaseRpc "fail_import_job" @{
      job = $job.job_id
      message = $message
    } | Out-Null
    Write-Error "Failed job $($job.job_id): $message"
  }
  finally {
    if (Test-Path $localPath) {
      Remove-Item $localPath -Force
    }
  }

  return $true
}

do {
  $hadJob = Invoke-OneJob
  if (-not $hadJob -and -not $Once) {
    Start-Sleep -Seconds $PollSeconds
  }
} while (-not $Once)
