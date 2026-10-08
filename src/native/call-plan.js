/** Pure native argument binding, independent of compiler emitters. */
const key=value=>String(value).toLowerCase().replace(/[$%&!#@]$/, '');

/** Pure binding; validates the complete list before emitting any argument code. */
export function planNativeArguments(signature,args,fail=message=>{throw new Error(message);}) {
  const params=signature.params, paramArray=params.findIndex(p=>p.paramArray);
  if(paramArray!==-1) {
    if(paramArray!==params.length-1||params.some(p=>p.optional)||params[paramArray].bounds?.length!==0||key(params[paramArray].type)!=='variant')
      fail('Native ParamArray must be the final unsized Variant array without Optional parameters');
    if(args.some(a=>a?.kind==='named'))fail('Native ParamArray procedures require positional arguments: '+signature.name);
    const prefix=planNativeArguments({...signature,params:params.slice(0,paramArray)},args.slice(0,paramArray),fail);
    const entry={index:paramArray,node:{kind:'nativeParamArray',args:args.slice(paramArray)},omitted:false};
    return {slots:[...prefix.slots,entry],order:[...prefix.order,entry]};
  }
  const slots=new Array(params.length), order=[];
  const names=new Map(params.map((p,i)=>[key(p.name),i]));
  let positional=0,named=false;
  for(const argument of args) {
    let index,node=argument;
    if(argument.kind==='named') {
      named=true;index=names.get(key(argument.name));node=argument.expr;
      if(index===undefined)fail('Unknown native named argument: '+argument.name+' in '+signature.name);
    }else {
      if(named)fail('Positional argument cannot follow a named argument: '+signature.name);
      index=positional++;
      if(index>=params.length)fail('Too many native arguments: '+signature.name);
    }
    if(slots[index]!==undefined)fail('Duplicate native argument: '+params[index].name);
    if(!node||node.kind==='missing') {
      if(!params[index].optional)fail('Native argument is not optional: '+params[index].name);
      slots[index]={index,omitted:true};
    }else {const entry={index,node,omitted:false};slots[index]=entry;order.push(entry);}
  }
  params.forEach((p,index)=>{
    if(slots[index]===undefined) {
      if(!p.optional)fail('Missing required native argument: '+p.name+' in '+signature.name);
      slots[index]={index,omitted:true};
    }
  });
  // Omitted defaults have already been bound and checked in declaration scope;
  // they are not expressions that can execute inside the caller's lexical scope.
  return {slots,order:[...order,...slots.filter(s=>s.omitted)]};
}

/** InStr has a leading optional argument, unlike ordinary project procedures.
 * Only the two-positional-argument spelling elides it implicitly. Named calls
 * use the documented formal names and retain their original evaluation order.
 */
export function planNativeInStrArguments(args,fail=message=>{throw new Error(message);}) {
  const shorthand=args.length===2&&args.every(a=>a.kind!=='named'&&a.kind!=='missing');
  const plan=planNativeArguments({name:'InStr',params:[
    {name:'start',optional:true},{name:'string1'},{name:'string2'},{name:'compare',optional:true}
  ]},shorthand?[{kind:'missing'},...args]:args,fail);
  if(!plan.slots[3].omitted&&plan.slots[0].omitted)fail('InStr compare requires an explicit start argument');
  return plan;
}

