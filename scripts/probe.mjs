import { ORDERS, COMPLETED, ORGANIZATIONS, ORG_COUNT } from '../src/data/orders.ts';
const by = (rows, f) => rows.reduce((m,r)=>{const k=f(r); if(k===undefined)return m; m[k]=(m[k]||0)+1; return m;},{});
console.log('rows', ORDERS.length, '| completed', COMPLETED.length, '| orgs', ORG_COUNT, '| org defs', ORGANIZATIONS.length);
const months = {};
for (const r of COMPLETED) { const m = r.completedAt.slice(0,7); months[m] ??= {n:0,fee:0}; months[m].n++; months[m].fee += r.clientFee||0; }
const keys = Object.keys(months).sort();
console.log('\nmonth   orders    clientFee');
for (const k of keys.slice(-8)) console.log(k, String(months[k].n).padStart(6), '  $'+Math.round(months[k].fee).toLocaleString());
const jul=months['2026-07'], aug=months['2026-08'];
console.log('\nAug vs Jul: orders', (((aug.n/jul.n)-1)*100).toFixed(1)+'%', '| fees', (((aug.fee/jul.fee)-1)*100).toFixed(1)+'%');
const unc = COMPLETED.filter(r=>!r.requestCategory);
console.log('\nunclassified', unc.length, '=', (unc.length/COMPLETED.length*100).toFixed(1)+'%', '| systemFee $'+Math.round(unc.reduce((a,r)=>a+(r.systemFee||0),0)).toLocaleString());
console.log('\ncommercial share: orders', (COMPLETED.filter(r=>r.requestCategory==='Commercial appraisal').length/COMPLETED.length*100).toFixed(1)+'%',
 '| fees', (COMPLETED.filter(r=>r.requestCategory==='Commercial appraisal').reduce((a,r)=>a+(r.clientFee||0),0)/COMPLETED.reduce((a,r)=>a+(r.clientFee||0),0)*100).toFixed(1)+'%');
console.log('\nSLA — commercial appraisal avg turnaround (target 22):');
for (const k of keys.slice(-5)) { const s=COMPLETED.filter(r=>r.requestCategory==='Commercial appraisal'&&r.completedAt.slice(0,7)===k&&r.turnaroundDays); console.log(' ', k, (s.reduce((a,r)=>a+r.turnaroundDays,0)/s.length).toFixed(1)+'d', 'n='+s.length); }
const oc = by(COMPLETED, r=>r.org); const top = Object.entries(oc).sort((a,b)=>b[1]-a[1]);
console.log('\ntop 5 orgs:', top.slice(0,5).map(([n,c])=>n+' '+c).join(' · '));
console.log('bottom 3 :', top.slice(-3).map(([n,c])=>n+' '+c).join(' · '));
console.log('\nstatuses', JSON.stringify(by(ORDERS,r=>r.status)));
console.log('near-identical:', ORGANIZATIONS.map(o=>o.name).filter(n=>n.startsWith('Meridian')||n.includes('of Ohio')).join(' | '));
console.log('renewals before 2027-01-01:', ORGANIZATIONS.filter(o=>o.contractEnd<'2027-01-01').length, '| declining:', ORGANIZATIONS.filter(o=>o.declining).length);
