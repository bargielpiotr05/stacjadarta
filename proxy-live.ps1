$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:5050/")
$listener.Start()
Write-Output "Flashscore Local Proxy started on http://127.0.0.1:5050/"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, OPTIONS")
        $response.Headers.Add("Access-Control-Allow-Headers", "*")
        $response.Headers.Add("Cache-Control", "no-store")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $id = $request.QueryString["id"]
        if (-not $id) { $id = "I78ccYfE" }

        $wc = New-Object System.Net.WebClient
        $wc.Encoding = [System.Text.Encoding]::UTF8
        $wc.Headers.Add("x-fsign", "SW9D1eZo")
        
        $mhn = ""
        $dc = ""
        try {
            $mhn = $wc.DownloadString("https://46.flashscore.ninja/46/x/feed/df_mhn_1_$id")
        } catch {}
        try {
            $dc = $wc.DownloadString("https://46.flashscore.ninja/46/x/feed/dc_14_$id")
        } catch {}

        $obj = @{
            ok = $true
            matchId = $id
            mhn = $mhn
            dc = $dc
        }
        $json = $obj | ConvertTo-Json -Compress
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
        $response.ContentType = "application/json; charset=utf-8"
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
    } catch {
        # pętla działa dalej
    }
}
