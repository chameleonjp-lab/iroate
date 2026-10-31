import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
const root = resolve(process.env.SERVE_DIR || 'dist');
const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
http.createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const relative = decodeURIComponent(pathname.replace(/^\/iroate\//,''));
  const path = resolve(root,relative || 'index.html');
  if (!path.startsWith(root+'/')) {res.writeHead(403).end();return;}
  try {const data=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream'}).end(data);}
  catch {res.writeHead(404).end();}
}).listen(Number(process.env.IROATE_TEST_PORT || 4173),'127.0.0.1');
