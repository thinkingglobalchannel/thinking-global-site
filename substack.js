// Vercel Serverless Function — proxy restricted to the Thinking Global Substack.
// Lives at  https://www.thinking-global.org/api/substack?url=<encoded substack url>
// Same origin as the site, so the browser never hits a CORS block.
//
// Quick checks after deploying:
//   /api/substack?ping=1                                   → "substack proxy alive"  (function is deployed)
//   /api/substack?url=https%3A%2F%2Fthinkingglobal.substack.com%2Ffeed   → RSS/XML with your posts

const ALLOWED_HOST = 'thinkingglobal.substack.com';

module.exports = async (req, res) => {
  if (req.query.ping) return res.status(200).send('substack proxy alive');

  const raw = req.query.url;
  if (!raw) return res.status(400).send('Missing url');

  let target;
  try { target = new URL(raw); } catch { return res.status(400).send('Bad url'); }
  if (target.protocol !== 'https:' || target.hostname !== ALLOWED_HOST) {
    return res.status(403).send('Host not allowed');
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ThinkingGlobalSite/1.0; +https://www.thinking-global.org)',
        'Accept': 'application/json, application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const body = await upstream.text();
    if (!upstream.ok) {
      console.error(`Substack answered ${upstream.status} for ${target.pathname}: ${body.slice(0, 200)}`);
      // Don't let the edge cache an error
      res.setHeader('Cache-Control', 'no-store');
    } else {
      // Cache at Vercel's edge for 5 min so Substack isn't hit on every visit
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
    return res.status(upstream.status).send(body);
  } catch (e) {
    console.error('Proxy fetch failed:', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).send('Upstream error: ' + (e && e.message));
  }
};
