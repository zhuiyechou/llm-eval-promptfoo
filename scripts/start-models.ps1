# Start two local llama.cpp model servers with OpenAI-compatible API.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\start-models.ps1

$ErrorActionPreference = 'Stop'
$Root   = 'D:\llama.cpp'
$Bin    = Join-Path $Root 'bin'
$Models = Join-Path $Root 'models'

$targets = @(
  @{ File = 'qwen2.5-1.5b-instruct-q4_k_m.gguf'; Port = 8080; Alias = 'qwen2.5-1.5b-instruct' },
  @{ File = 'qwen2.5-3b-instruct-q4_k_m.gguf';   Port = 8081; Alias = 'qwen2.5-3b-instruct' }
)

$exe = Join-Path $Bin 'llama-server.exe'
if (-not (Test-Path $exe)) { throw "llama-server.exe not found at $exe" }

foreach ($t in $targets) {
  $model = Join-Path $Models $t.File
  if (-not (Test-Path $model)) { throw "model file not found: $model" }

  $params = @(
    '-m', $model,
    '--port', $t.Port,
    '--alias', $t.Alias,
    '-c', '16384',
    '-np', '4',
    '-t', '8',
    '--no-webui'
  )
  Write-Host "starting $($t.Alias) on http://127.0.0.1:$($t.Port)"
  Start-Process -FilePath $exe -ArgumentList $params -WindowStyle Hidden
}

$deadline = (Get-Date).AddMinutes(3)
foreach ($t in $targets) {
  $url = "http://127.0.0.1:$($t.Port)/v1/models"
  $ok = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-RestMethod -Uri $url -TimeoutSec 5
      if ($r.data) { $ok = $true; break }
    } catch { Start-Sleep -Seconds 3 }
  }
  if ($ok) { Write-Host "$($t.Alias) ready" } else { throw "$($t.Alias) not ready within 3 minutes" }
}