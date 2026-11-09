import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendSample} from './collect-traffic.mjs';
import {parseTrafficHistory,trafficWindow} from '../src/utils/traffic-stats.ts';
const at=hour=>new Date(Date.UTC(2026,10,1)+hour*3600_000).toISOString();
test('three windows count only observed growth, not lifetime PV',()=>{
 const history={version:1,startedAt:at(0),samples:Array.from({length:721},(_,i)=>({at:at(i),pv:1000+i*3}))};
 parseTrafficHistory(history);
 for(const hours of [24,168,720]){const result=trafficWindow(history,hours);assert.equal(result.views,hours*3);assert.equal(result.partial,false);assert.equal(result.coveredHours,hours);}
});
test('startup is unknown, short history is partial, zero growth is real zero',()=>{
 let history=appendSample(null,900,at(0));assert.equal(trafficWindow(history,24).views,null);
 history=appendSample(history,900,at(1));assert.equal(trafficWindow(history,24).views,0);assert.equal(trafficWindow(history,720).partial,true);
 history=appendSample(history,910,at(5));const result=trafficWindow(history,24);assert.equal(result.views,10);assert.equal(result.maxGapHours,4);
});
test('window edges do not interpolate or include observations outside range',()=>{
 const history={version:1,startedAt:at(0),samples:[{at:at(0),pv:100},{at:at(2),pv:110},{at:at(25),pv:150}]};
 const result=trafficWindow(history,24);assert.equal(result.views,40);assert.equal(result.coveredHours,23);assert.equal(result.maxGapHours,23);
});
test('counter reset starts a new observable segment; duplicate samples skipped; retention bounded',()=>{
 const first=appendSample(null,500,at(0));assert.equal(appendSample(first,501,at(.1)),first);
 const reset=appendSample(first,2,at(1));assert.equal(reset.resetAt,at(1));assert.equal(reset.samples.length,1);assert.equal(trafficWindow(reset,24).views,null);
 const retained=appendSample(first,700,at(36*24));assert.equal(retained.samples.length,1);
 assert.throws(()=>appendSample(first,-1,at(1)));assert.throws(()=>appendSample(first,600,at(-1)));
 assert.throws(()=>parseTrafficHistory({version:1,startedAt:at(0),samples:[{at:at(0),pv:5},{at:at(1),pv:2}]}));
});
