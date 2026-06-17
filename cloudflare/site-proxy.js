const upstreamOrigin = 'https://portfolovetor.pages.dev';
const crawlerPattern = /bot|crawler|spider|slurp|yandex|google|bing|duckduck|baidu|facebookexternalhit|pinterest/i;

function createLoaderHtml(pathAndQuery) {
  const upstreamUrl = `${upstreamOrigin}${pathAndQuery}`;
  const serializedUrl = JSON.stringify(upstreamUrl);

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Студия дизайна Vetor</title>
  <link rel="icon" href="${upstreamOrigin}/favicon.ico" type="image/x-icon">
  <style>
    html,body{margin:0;min-height:100%;background:#13052d;color:#f7f3ff;font:600 16px/1.5 Inter,Arial,sans-serif}
    body{display:grid;place-items:center}.loader{display:grid;justify-items:center;gap:16px;padding:24px;text-align:center}
    .mark{width:48px;height:48px;border:3px solid #f1ff1a;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
    a{color:#f1ff1a}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.mark{animation:none}}
  </style>
</head>
<body>
  <main class="loader"><span class="mark" aria-hidden="true"></span><span>Загружаем Vetor Studio...</span><noscript><a href="${upstreamUrl}">Открыть сайт</a></noscript></main>
  <script>
    (async()=>{try{const r=await fetch(${serializedUrl},{cache:"no-store"});if(!r.ok)throw new Error(r.status);const h=await r.text();document.open();document.write(h);document.close()}catch(e){document.querySelector(".loader").innerHTML='<strong>Не удалось загрузить сайт</strong><a href="${upstreamUrl}">Открыть напрямую</a>'}})();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamOrigin);
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    const isCrawler = crawlerPattern.test(request.headers.get('user-agent') || '');

    if (request.method === 'GET' && acceptsHtml && !isCrawler) {
      return new Response(createLoaderHtml(`${incomingUrl.pathname}${incomingUrl.search}`), {
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          'x-vetor-origin': 'edge-loader',
        },
      });
    }

    const upstreamRequest = new Request(upstreamUrl, request);
    const upstreamResponse = await fetch(upstreamRequest);
    const responseHeaders = new Headers(upstreamResponse.headers);

    responseHeaders.set('x-vetor-origin', 'pages-proxy');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  },
};
