$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vcvars = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC\Auxiliary\Build\vcvars64.bat' | Select-Object -First 1
if (-not $vcvars) { throw 'Visual Studio C++ x64 tools are required' }
New-Item -ItemType Directory -Force build/native | Out-Null
& cmd.exe /d /s /c "call `"$vcvars`" && cl /nologo /std:c++20 /EHsc /MT /O2 /D_WIN32_WINNT=0x0A00 native\store-update-check.cpp /Fe:build\native\store-update-check.exe /Fo:build\native\store-update-check.obj windowsapp.lib user32.lib"
if ($LASTEXITCODE -ne 0) { throw 'Native Store helper compilation failed' }
# Hosted CI is unpackaged. This checks a real Windows executable and identity
# boundary, not actual Store update detection for a licensed installed package.
$output = & ./build/native/store-update-check.exe
if ($LASTEXITCODE -ne 0) { throw 'Native Store helper execution failed' }
$result = $output | ConvertFrom-Json
if ($result.protocol -ne 1 -or $result.status -ne 'error' -or $result.code -ne 'no_package_identity') {
  throw 'Unpackaged Windows identity smoke test failed'
}
Write-Output 'Native helper compiled and unpackaged identity rejection passed. Real Store update detection remains untested.'
