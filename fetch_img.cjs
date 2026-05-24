const https = require('https');
https.get('https://kommodo.ai/i/MVQzOoGi4sCDyhKzfhaM', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const urls = data.match(/https?:\/\/[^"'\s>]+?\.(?:png|jpg|jpeg|gif|webp)/g) || [];
    const metaImgs = data.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i);
    if(metaImgs) console.log("Meta Image:", metaImgs[1]);
    console.log("All matching image URLs:", [...new Set(urls)].join('\n'));
  });
});
