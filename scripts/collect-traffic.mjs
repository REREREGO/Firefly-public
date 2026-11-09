import {pathToFileURL} from 'node:url';
import path from 'node:path';

export function appendSample(history, pv, at) {
  if(!Number.isSafeInteger(pv)||pv<0||!Number.isFinite(Date.parse(at)))throw new Error('Invalid counter response');
  if(history){
    if(history.version!==1||!Number.isFinite(Date.parse(history.startedAt))||!Array.isArray(history.samples))throw new Error('Invalid stored history');
    let previousTime=-Infinity,previousCount=-1;
    for(const sample of history.samples){const time=Date.parse(sample.at);if(!Number.isFinite(time)||time<=previousTime||!Number.isSafeInteger(sample.pv)||sample.pv<previousCount)throw new Error('Invalid stored samples');previousTime=time;previousCount=sample.pv;}
  }
  const last=history?.samples?.at(-1);
  if(last&&Date.parse(at)<=Date.parse(last.at))throw new Error('Non-increasing sample time');
  if(last&&pv<last.pv)return {version:1,startedAt:at,resetAt:at,samples:[{at,pv}]};
  if(last&&Date.parse(at)-Date.parse(last.at)<30*60_000)return history;
  const cutoff=Date.parse(at)-35*24*3600_000;
  return {version:1,startedAt:history?.startedAt||at,...(history?.resetAt?{resetAt:history.resetAt}:{}),samples:[...(history?.samples||[]).filter(sample=>Date.parse(sample.at)>=cutoff),{at,pv}]};
}
async function collect() {
  const token=process.env.GH_TOKEN;
  if(!token)throw new Error('GH_TOKEN is required');
  const repo=process.env.GITHUB_REPOSITORY||'REREREGO/Firefly-public';
  if(repo!=='REREREGO/Firefly-public')throw new Error('Unexpected analytics destination');
  const endpoint=`https://api.github.com/repos/${repo}/contents/history.json`;
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const stored=await fetch(`${endpoint}?ref=main`,{headers,signal:AbortSignal.timeout(15000)});
  if(!stored.ok)throw new Error(`History read failed: ${stored.status}`);
  const file=await stored.json();
  const history=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
  const response=await fetch('https://bsz.iirose.cn/api',{method:'GET',headers:{'x-bsz-referer':'https://rererego.github.io/Firefly/'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`Counter read failed: ${response.status}`);
  const result=await response.json();
  if(!result.success)throw new Error('Counter unavailable');
  const next=appendSample(history,result.data?.site_pv,new Date().toISOString());
  if(next===history){console.log('A recent snapshot already exists; skipped.');return;}
  const saved=await fetch(endpoint,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'chore: record hourly traffic snapshot',branch:'main',sha:file.sha,content:Buffer.from(JSON.stringify(next,null,2)+'\n').toString('base64')}),signal:AbortSignal.timeout(15000)});
  if(!saved.ok)throw new Error(`Snapshot write failed: ${saved.status}; no overwrite attempted`);
  console.log(`Recorded ${result.data.site_pv} cumulative views; ${next.samples.length} samples retained.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await collect();
