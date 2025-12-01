const WebSocket = require('ws');
const url = 'wss://eu.10xtraders.ai/user/rsistrategymeby1cjnj1d80qt3/api/v1/message/ws?token=88d055c7-b9b1-473d-b69f-797ea3022fd1';
const ws = new WebSocket(url, { headers: { Origin: 'https://eu.10xtraders.ai' } });
ws.on('open', () => ws.send(JSON.stringify({ type:'subscribe', data:['analyzed_df'] })));
ws.on('message', (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.type !== 'analyzed_df') return;
  const df = m.data?.df;
  if (df?.__type__ === 'dataframe') {
    const obj = JSON.parse(df.__value__);
    const last = obj.data[obj.data.length-1];
    console.log('key:', m.data?.key, 'last row:', last);
  } else {
    console.log(m);
  }
});
ws.on('error', console.error);
