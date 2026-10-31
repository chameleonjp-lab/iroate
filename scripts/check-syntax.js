import {readdir,readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
export async function filesUnder(root) {
  const files=[];
  for(const entry of await readdir(root,{withFileTypes:true})) {
    const path=join(root,entry.name);
    if(entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}
const files = ['playwright.config.js',...(await Promise.all(['js','scripts','test'].map(filesUnder))).flat()].filter(p=>p.endsWith('.js'));
for(const path of files) {
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(result.status!==0) throw new Error(`${path}: ${result.stderr}`);
}
const scratch=await mkdtemp(join(tmpdir(),'iroate-syntax-'));
try {
  const html=await readFile('index.html','utf8');
  let n=0;
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if(/\bsrc=/.test(script[1])) continue;
    const path=join(scratch,`inline-${n++}.${script[1].includes('module')?'mjs':'cjs'}`);
    await writeFile(path,script[2]);
    const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    if(result.status!==0) throw new Error(result.stderr);
  }
  console.log(`Syntax checked ${files.length} JavaScript files and ${n} inline scripts.`);
} finally {await rm(scratch,{recursive:true,force:true});}
