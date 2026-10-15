# Execute como administrador no servidor Windows.
# Não abre portas nem altera o compartilhamento existente.
#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$ConfigSource = Read-Host 'Caminho do arquivo adverse-pastas-config.json baixado do Adverse OS'
$config = Get-Content -LiteralPath $ConfigSource -Raw | ConvertFrom-Json
$share = @(Get-SmbShare -Name 'PROJETOS_ATIVOS' -ErrorAction Stop)
if ($share.Count -ne 1) { throw 'Não foi possível identificar o compartilhamento PROJETOS_ATIVOS. Nada foi instalado.' }
$root = $share[0].Path
Write-Host ('Destino fixo: PROJETOS_ATIVOS (' + $root + ')')
$template = Read-Host 'Caminho LOCAL do modelo (ex.: D:\PROJETOS_ATIVOS\_. Database 2026\Estrutura de pastas)'
if (!(Test-Path -LiteralPath $root -PathType Container) -or !(Test-Path -LiteralPath $template -PathType Container)) { throw 'Pastas não encontradas. Nada foi instalado.' }
if ($root.StartsWith('\\')) { throw 'Use o caminho local no servidor, não o endereço de rede.' }
$python = & py -3 -c 'import sys; print(sys.executable)'
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $python -PathType Leaf)) { throw 'Instale Python 3 para todos os usuários pelo instalador oficial python.org e tente novamente.' }
$destination = Join-Path $env:ProgramData 'AdverseOS\Pastas'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
# Protege código e token do serviço contra alterações de usuários comuns.
& icacls $destination /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível proteger a configuração.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'worker.py') -Destination (Join-Path $destination 'worker.py') -Force
$config | Add-Member -NotePropertyName root -NotePropertyValue $root -Force
$config | Add-Member -NotePropertyName template -NotePropertyValue $template -Force
$configPath = Join-Path $destination 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
$action = New-ScheduledTaskAction -Execute $python -Argument ('"' + (Join-Path $destination 'worker.py') + '" --config "' + $configPath + '"')
$triggers = @((New-ScheduledTaskTrigger -AtStartup), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)))
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 8)
Register-ScheduledTask -TaskName 'Adverse OS - Pastas' -Action $action -Trigger $triggers -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'Adverse OS - Pastas'
Write-Host 'Instalado. Confira o indicador Servidor conectado no Adverse OS. Proteja ou remova a cópia baixada da configuração, pois contém a chave deste conector.'
