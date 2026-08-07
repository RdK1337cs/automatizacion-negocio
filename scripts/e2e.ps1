param()
$env:Path = "C:\Users\rodri\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64;" + ';' + $env:Path
$wd = "C:\workspace\Automatizacion para negocio"
$base = "http://localhost:4000"

$p = Start-Process -FilePath (Get-Command node).Source -ArgumentList "dist/server.js" -WorkingDirectory $wd -PassThru -RedirectStandardError "$wd\data\server-err.log" -RedirectStandardOutput "$wd\data\server-out.log"
Start-Sleep -Seconds 4
$login = Invoke-RestMethod -Uri "$base/login" -Method Post -ContentType "application/json" -Body '{"username":"admin","password":"admin123"}'
$headers = @{ Authorization = "Bearer $($login.token)" }
Write-Output "== FLUJO COMPLETO =="

function Send-WAMsg($from, $text) {
  $payload = @{ entry = @(@{ changes = @(@{ field = "messages"; value = @{ messages = @(@{ from = $from; text = @{ body = $text } }) } }) }) } | ConvertTo-Json -Depth 10
  Invoke-RestMethod -Uri "$base/webhook" -Method Post -ContentType "application/json" -Body $payload | Out-Null
}

foreach ($msg in @("hola", "precio de té", "tenes stock de mate?", "necesito 3 alfajores", "presupuesto de bomba")) {
  Send-WAMsg "5491198765432" $msg
  Start-Sleep -Milliseconds 300
}
Start-Sleep -Seconds 1
Write-Output "--- Conversación WhatsApp (logs) ---"
$all = @(Invoke-RestMethod -Uri "$base/api/logs/messages?limit=10" -Headers $headers)
foreach ($m in $all) {
  $dir = $m.direction.ToUpper()
  $b = $m.body.Replace("`n", " "); if ($b.Length -gt 75) { $b = $b.Substring(0, 75) }
  Write-Output ("  [" + $dir + "] " + $b)
}
Write-Output "--- Pedidos generados ---"
foreach ($o in (Invoke-RestMethod -Uri "$base/api/orders" -Headers $headers)) {
  Write-Output ("   " + $o.order_number + " | " + $o.customer_name + " | " + $o.status + " | " + $o.total)
}
Write-Output "--- Presupuesto + PDF ---"
foreach ($q in (Invoke-RestMethod -Uri "$base/api/quotes" -Headers $headers)) {
  $r = Invoke-WebRequest -Uri "$base/api/quotes/$($q.id)/pdf" -Headers $headers -UseBasicParsing
  Write-Output ("   " + $q.quote_number + " " + $q.status + ": PDF " + $r.RawContentLength + " bytes")
}
Write-Output "--- Stock final ---"
foreach ($pr in (Invoke-RestMethod -Uri "$base/api/products" -Headers $headers | Sort-Object id)) {
  Write-Output ("   " + $pr.name + ": " + $pr.stock)
}
Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue