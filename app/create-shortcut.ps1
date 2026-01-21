$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Task Center.lnk")
$Shortcut.TargetPath = "$env:USERPROFILE\task-center-app\start-task-center.bat"
$Shortcut.WorkingDirectory = "$env:USERPROFILE\task-center-app"
$Shortcut.WindowStyle = 7
$Shortcut.Description = "Task Center App"
$Shortcut.Save()
Write-Host "Shortcut created successfully!"
