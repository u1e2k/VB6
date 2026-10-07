/** Redirect only verified assembler-tagged branches through pure JMP chains.
 * Keep labels, calls, data pointers, nonzero addends and cycles unchanged. The
 * bounded walk avoids quadratic behavior on maliciously long branch chains.
 */
export function threadNativeBranches(section,plans) {
  const jumps=new Map(plans.filter(p=>p.fixup.branch===0xeb&&p.fixup.addend===0).map(p=>[p.start,p.fixup]));
  const redirects=[];
  for(const plan of plans){
    if(plan.fixup.addend!==0)continue;
    const seen=new Set([plan.start]);let label=plan.fixup.label,complete=false;
    for(let depth=0;depth<256;depth++){
      const offset=section.labels.get(label);
      if(offset===undefined||seen.has(offset))break;
      seen.add(offset);const next=jumps.get(offset);
      if(!next){complete=true;break;}
      label=next.label;
    }
    if(complete&&section.labels.get(label)!==section.labels.get(plan.fixup.label))redirects.push([plan.fixup,label]);
  }
  // Analyze original edges first, so iteration order cannot change cycles.
  for(const [fixup,label]of redirects)fixup.label=label;
  return redirects.length;
}
