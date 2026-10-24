const fs = require('node:fs');
const base = 'http://[::1]:6767';
const pending = new Map();
let endpoint, resolveEndpoint, id = 0;
const endpointReady = new Promise(r => resolveEndpoint = r);
const abort = new AbortController();
async function listen() {
  const response = await fetch(base + '/sse', {signal: abort.signal});
  if (!response.ok) throw new Error('SSE: ' + response.status);
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += new TextDecoder().decode(chunk);
    buffer = buffer.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      const data = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
      if (event.includes('event: endpoint')) { endpoint = new URL(data, base).href; resolveEndpoint(); }
      else if (data) {
        const result = JSON.parse(data);
        if (pending.has(result.id)) { pending.get(result.id)(result); pending.delete(result.id); }
      }
    }
  }
}
async function request(method, params) {
  const requestId = ++id;
  const reply = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {pending.delete(requestId); reject(new Error('MCP timeout'));}, 20000);
    pending.set(requestId, value => {clearTimeout(timer); value.error ? reject(new Error(JSON.stringify(value.error))) : resolve(value.result);});
  });
  const res = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
  if (!res.ok) throw new Error('POST: ' + res.status);
  return reply;
}
async function main() {
  listen().catch(e => {if (!abort.signal.aborted) console.error(e.message);});
  await endpointReady;
  await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'Codex',version:'1.0'}});
  await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
  const mode = process.argv[2];
  if (mode === 'execute_script' || mode === 'read_sdk_documentation_topic') {
    await request('tools/call',{name:'read_sdk_documentation_topic',arguments:{filename:'preamble'}});
  }
  if (mode === 'list') {
    const result = await request('tools/list',{});
    fs.writeFileSync('work/affinity-tools.json',JSON.stringify(result,null,2));
    console.log(result.tools.map(t => ({name:t.name,description:t.description,inputSchema:t.inputSchema})));
  } else {
    const args = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
    const result = await request('tools/call',{name:mode,arguments:args});
    console.log(JSON.stringify(result));
  }
  abort.abort();
}
main().catch(e => {console.error(e);abort.abort();process.exitCode=1;});
