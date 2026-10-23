const http = require('http');
const https = require('https');

function fetchNinja(path) {
    return new Promise((resolve) => {
        const req = https.get({
            hostname: '46.flashscore.ninja',
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
            const data = await fetchNinja(`/46/x/feed/${feed}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, feed, data }));
            return;
        }

        const [mhn, dc] = await Promise.all([
            fetchNinja(`/46/x/feed/df_mhn_1_${id}`),
            fetchNinja(`/46/x/feed/dc_14_${id}`)
        ]);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, matchId: id, mhn, dc }));
    } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
    }
});

server.listen(5050, '127.0.0.1', () => {
    console.log('Flashscore Node Proxy listening on http://127.0.0.1:5050/');
});
