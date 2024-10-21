#### Setup webhook for telegram
$botToken = "7767915896:AAGxdVts4Lp-jboxYsiivChZYeGAKoKkfgo"
$webhookUrl = "https://0796-109-252-87-130.ngrok-free.app/api/Telegram"
$telegramApiUrl = "https://api.telegram.org/bot$botToken/setWebhook"

Invoke-RestMethod -Uri $telegramApiUrl -Method Post -Body @{url = $webhookUrl}

####

#### Setup ngrok

cd C:\ngrok
.\ngrok.exe help
.\ngrok.exe config add-authtoken 2mP2grK6S9gMz4XkLld5r1QTbOa_2EzuhRY85E7bY7sQzPTLH
.\ngrok.exe http https://localhost:7117

####