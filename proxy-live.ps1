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

        $feed = $request.QueryString["feed"]
        $id = $request.QueryString["id"]
        if (-not $id -and -not $feed) { $id = "tvPx1evh" }

        $wc = New-Object System.Net.WebClient
        $wc.Encoding = [System.Text.Encoding]::UTF8
        $wc.Headers.Add("x-fsign", "SW9D1eZo")
        $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

        if ($feed) {
            $feedData = ""
            try {
                $feedData = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/$feed")
            } catch {}
            $obj = @{
                ok = $true
                feed = $feed
                data = $feedData
            }
        } else {
            $mhn = ""
            $mhsn = ""
            $stn = ""
            $dc = ""
            $sui = ""
            $hh = ""
            $statsJson = $null
            $statsMetaJson = $null
            try {
                $mhn = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/df_mhn_1_$id")
            } catch {}
            try {
                $mhsn = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/df_mhsn_1_$id")
            } catch {}
            try {
                $stn = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/df_stn_1_$id")
            } catch {}
            try {
                $dc = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/dc_14_$id")
            } catch {}
            try {
                $sui = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/df_sui_1_$id")
            } catch {}
            try {
                $hh = $wc.DownloadString("https://2.flashscore.ninja/2/x/feed/df_hh_14_$id")
            } catch {}

            $wcGql = New-Object System.Net.WebClient
            $wcGql.Encoding = [System.Text.Encoding]::UTF8
            $wcGql.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            $wcGql.Headers.Add("Origin", "https://www.flashscore.pl")
            $wcGql.Headers.Add("Referer", "https://www.flashscore.pl/")

            try {
                $statsRaw = $wcGql.DownloadString("https://3.ds.lsapp.eu/pq_graphql?_hash=dts&eventId=$id&providerId=7")
                $statsJson = $statsRaw | ConvertFrom-Json
            } catch {}
            try {
                $metaRaw = $wcGql.DownloadString("https://3.ds.lsapp.eu/pq_graphql?_hash=dtsse&eventId=$id&projectId=3")
                $statsMetaJson = $metaRaw | ConvertFrom-Json
            } catch {}

            $obj = @{
                ok = $true
                matchId = $id
                mhn = $mhn
                mhsn = $mhsn
                stn = $stn
                dc = $dc
                sui = $sui
                hh = $hh
                stats = $statsJson
                statsMeta = $statsMetaJson
            }
        }

        $json = $obj | ConvertTo-Json -Compress -Depth 10
        $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
        $response.ContentType = "application/json; charset=utf-8"
        $response.ContentLength64 = $buffer.Length
        $response.OutputStream.Write($buffer, 0, $buffer.Length)
        $response.Close()
    } catch {
        # Kontynuacja pętli w razie błędu
    }
}
