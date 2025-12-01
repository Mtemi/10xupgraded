$excludeDirs = @('node_modules', '.git', '.next', 'dist', 'build', '.vite', 'remix1.zip', 'compress.ps1')
$items = Get-ChildItem -Path . | Where-Object { $excludeDirs -notcontains $_.Name }
Compress-Archive -Path $items.FullName -DestinationPath 'remix1.zip' -Force
Write-Host "Zip file created: remix1.zip"

