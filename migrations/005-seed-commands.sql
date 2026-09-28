-- Seed default commands into custom_commands table if empty
INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'PowerShell: Удаление лишних UWP-приложений Windows (Debloat)', 'PowerShell', '# Удаление предустановленных UWP-приложений Windows для всех пользователей
$apps = @(
  "*3dbuilder*", "*bingfinance*", "*bingnews*", "*bingsports*",
  "*bingweather*", "*solitairecollection*", "*getstarted*",
  "*skypeapp*", "*zunevideo*", "*zunemusic*", "*people*",
  "*windowscommunicationsapps*", "*yourphone*", "*xboxapp*"
)
foreach ($app in $apps) {
  Get-AppxPackage -AllUsers $app -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue
  Get-AppxProvisionedPackage -Online | Where-Object DisplayName -like $app | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 0;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'PowerShell: Поиск и удаление установленной программы', 'PowerShell', '# Поиск установленных программ и удаление через winget:
winget list
winget uninstall --name "НазваниеПрограммы"', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 1;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Windows: Сброс сетевого стека, DNS и Winsock', 'PowerShell', 'ipconfig /flushdns
ipconfig /release
ipconfig /renew
netsh winsock reset
netsh int ip reset', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 2;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'PowerShell: Обновление всех программ через Winget', 'PowerShell', 'winget upgrade --all --include-unknown --silent', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 3;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'PowerShell: Поиск процесса, занимающего TCP-порт', 'PowerShell', 'Get-NetTCPConnection -LocalPort 8089 | Select-Object LocalAddress, LocalPort, OwningProcess, State | ForEach-Object { $_; Get-Process -Id $_.OwningProcess }
# Завершить процесс принудительно: Stop-Process -Id <PID> -Force', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 4;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'PowerShell: Проверка и восстановление файлов Windows (SFC / DISM)', 'PowerShell', 'DISM.exe /Online /Cleanup-image /Restorehealth; sfc /scannow', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 5;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Docker: Полная очистка неиспользуемых контейнеров, образов и томов', 'Docker', 'docker system prune -a --volumes -f', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 6;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Docker: Мониторинг потребления ресурсов (CPU, RAM, Сеть)', 'Docker', 'docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 7;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Linux: Полное обновление пакетов и очистка кэша apt', 'Linux', 'sudo apt update && sudo apt upgrade -y && sudo apt autoremove -y && sudo apt clean', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 8;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Linux: Анализ свободного места на диске и тяжелых папок', 'Linux', 'df -h
# Топ 10 самых объемных каталогов:
sudo du -ahx / 2>/dev/null | sort -rh | head -n 10', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 9;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Linux: Найти и завершить процесс по порту', 'Linux', 'sudo lsof -i :8089 || sudo ss -tulpn | grep 8089
# Завершить процесс: sudo kill -9 <PID>', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 10;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Сеть: Узнать внешний IP-адрес через консоль', 'Сеть', 'curl -s https://ifconfig.me/all', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 11;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Caddy: Перезагрузка конфигурации Caddyfile на лету', 'Сеть', 'caddy reload --config /etc/caddy/Caddyfile', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 12;

INSERT INTO custom_commands (title, category, command, created_at)
SELECT 'Git: Жесткий сброс всех локальных изменений к ветке origin/main', 'Git', 'git fetch origin && git reset --hard origin/main && git clean -fd', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE (SELECT COUNT(*) FROM custom_commands) = 13;
