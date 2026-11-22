$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vcvars = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'VC\Auxiliary\Build\vcvars64.bat' | Select-Object -First 1
if (-not $vcvars) { throw 'Visual Studio C++ x64 tools are required' }
New-Item -ItemType Directory -Force build/native | Out-Null
& cmd.exe /d /s /c "call `"$vcvars`" && cl /nologo /std:c++17 /EHsc /MT /O2 /D_WIN32_WINNT=0x0A00 native\windows-hello.cpp /Fe:build\native\windows-hello.exe /Fo:build\native\windows-hello.obj crypt32.lib user32.lib"
if ($LASTEXITCODE -ne 0) { throw 'Windows Hello helper compilation failed' }
$result = (& ./build/native/windows-hello.exe probe) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $result.protocol -ne 1 -or $null -eq $result.ok) { throw 'Windows Hello probe protocol smoke failed' }
$invalid = (& ./build/native/windows-hello.exe get 0) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $invalid.protocol -ne 1 -or $invalid.ok -ne $false) { throw 'Invalid native window rejection failed' }
Write-Output 'Windows helper compiled; non-interactive capability and invalid-window rejection passed. This does not prove a real Hello PIN or Store-installed session.'
