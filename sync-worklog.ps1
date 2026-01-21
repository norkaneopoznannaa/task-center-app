$body = @{
    started = "2026-01-20T15:00:00.000+0300"
    timeSpentSeconds = 1800
    comment = "Статус по проекту РЭМД - обсуждение задач с Ильназом"
} | ConvertTo-Json -Compress

$headers = @{
    "Content-Type" = "application/json"
    "Cookie" = "JSESSIONID=263459A99C6B38A41BED45E4C1B1D135"
}

try {
    $response = Invoke-RestMethod -Uri "https://jira.i-novus.ru/rest/api/2/issue/MEETING-2395/worklog" -Method POST -Headers $headers -Body $body -SkipCertificateCheck
    Write-Host "SUCCESS! Worklog ID:" $response.id
    $response | ConvertTo-Json
} catch {
    Write-Host "Error:" $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $reader.ReadToEnd()
    }
}
