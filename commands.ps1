#### Setup webhook for telegram
$botToken = "__BOT_TOKEN__"
$webhookUrl = "https://185.105.91.233/api/Telegram"
$telegramApiUrl = "https://api.telegram.org/bot$botToken/setWebhook"

Invoke-RestMethod -Uri $telegramApiUrl -Method Post -Body @{url = $webhookUrl}

####

#### Setup ngrok

cd C:\ngrok
.\ngrok.exe help
.\ngrok.exe config add-authtoken __NGROK_AUTHTOKEN__
.\ngrok.exe http https://localhost:7117

####