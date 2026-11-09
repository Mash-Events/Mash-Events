# Saves a Supabase personal access token for this project only.
#
# Create the token while signed in to the Mash Supabase account:
#   https://supabase.com/dashboard/account/tokens
# The token is typed hidden, never shown, and written to .env.local
# (git-ignored) as SUPABASE_ACCESS_TOKEN. Other lines in .env.local are kept.
# Usage (from the repo root):  & .\scripts\set-supabase-token.ps1

$ErrorActionPreference = 'Stop'
$envFile = Join-Path (Get-Location) '.env.local'

$secure = Read-Host -Prompt 'Paste the Mash Supabase access token (input hidden)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if (-not $token.StartsWith('sbp_')) {
  Write-Host 'That does not look like a Supabase access token (they start with sbp_). Nothing saved.'
  exit 1
}

$lines = @()
if (Test-Path $envFile) {
  $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^SUPABASE_ACCESS_TOKEN=' }
}
$lines += "SUPABASE_ACCESS_TOKEN=$token"

# UTF-8 without BOM so Node's env-file loader reads the first key correctly.
[IO.File]::WriteAllLines($envFile, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Saved to .env.local (git-ignored). Tell Claude it is done.'
