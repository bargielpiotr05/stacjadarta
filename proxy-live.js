const http = require('http');
const https = require('https');

function fetchNinja(path) {
    return new Promise((resolve) => {
        const req = https.get({
            hostname: '2.flashscore.ninja',
            path: path,
            headers: {
                'x-fsign': 'SW9D1eZo',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 6000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', () => resolve(''));
        req.on('timeout', () => { req.destroy(); resolve(''); });
    });
}

function fetchJsonLsApp(path) {
    return new Promise((resolve) => {
        const req = https.get({
            hostname: '3.ds.lsapp.eu',
            path: path,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://www.flashscore.pl',
                'Referer': 'https://www.flashscore.pl/'
            },
            timeout: 6000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    try {
        const parsedUrl = new URL(req.url, 'http://127.0.0.1:5050');
        const feed = parsedUrl.searchParams.get('feed');
        const id = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('matchId') || 'tvPx1evh';

        if (feed) {
            const data = await fetchNinja(`/2/x/feed/${feed}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, feed, data }));
            return;
        }

        const now = Date.now();
        const [mhn, mhsn, stn, dc, sui, hh, stats, statsMeta] = await Promise.all([
            fetchNinja(`/2/x/feed/df_mhn_1_${id}?_t=${now}`),
            fetchNinja(`/2/x/feed/df_mhsn_1_${id}?_t=${now}`),
            fetchNinja(`/2/x/feed/df_stn_1_${id}?_t=${now}`),
            fetchNinja(`/2/x/feed/dc_14_${id}?_t=${now}`),
            fetchNinja(`/2/x/feed/df_sui_1_${id}?_t=${now}`),
            fetchNinja(`/2/x/feed/df_hh_14_${id}?_t=${now}`),
            fetchJsonLsApp(`/pq_graphql?_hash=dts&eventId=${id}&providerId=7&_t=${now}`),
            fetchJsonLsApp(`/pq_graphql?_hash=dtsse&eventId=${id}&projectId=3&_t=${now}`)
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, matchId: id, mhn, mhsn, stn, dc, sui, hh, stats, statsMeta }));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
    }
});

server.listen(5050, '127.0.0.1', () => {
    console.log('Flashscore Node Proxy listening on http://127.0.0.1:5050/');
});
