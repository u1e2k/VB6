// The opt-in compute target owns these names. They are not ordinary VB6 globals.
const fn=(name,type,params=[])=>Object.freeze({name,type,params:Object.freeze(params)});
export const COMPUTE_SYMBOLS=Object.freeze([
  Object.freeze({name:'Me',type:'Object',readOnly:true}), // synthetic graphics receiver, never a native Form
  ...['Index','Count','Width','Height','LocalIndex','GroupIndex','GroupCount','WorkgroupSize','SharedLength'].map(n=>fn('Compute'+n,'Long')),
  fn('ComputeTime','Single'),
  ...['Long','Single'].flatMap(t=>[fn('ComputeLoad'+t,t,['ByVal index As Long']),fn('ComputeStore'+t,'Void',['ByVal index As Long','ByVal value As '+t])]),
  ...['Add','Sub','Exchange','And','Or','Xor'].map(n=>fn('ComputeAtomic'+n,'Long',['ByVal index As Long','ByVal value As Long'])),
  fn('ComputeAtomicCompareExchange','Long',['ByVal index As Long','ByVal compare As Long','ByVal value As Long']),
  ...['Sin','Cos','Tan','Atan','Sqrt','Exp','Log'].map(n=>fn('Compute'+n,'Single',['ByVal value As Single'])),
  ...['Min','Max'].map(n=>fn('Compute'+n,'Single',['ByVal a As Single','ByVal b As Single'])),
  fn('ComputeClear','Void',['ByVal color As Long']),
  fn('ComputeRect','Void',['ByVal x As Single','ByVal y As Single','ByVal width As Single','ByVal height As Single','ByVal color As Long']),
  fn('ComputeLine','Void',['ByVal x1 As Single','ByVal y1 As Single','ByVal x2 As Single','ByVal y2 As Single','ByVal width As Single','ByVal color As Long']),
  fn('ComputeCircle','Void',['ByVal x As Single','ByVal y As Single','ByVal radius As Single','ByVal color As Long'])
]);
export function computeSymbolProject(project) {
  return {...project,externalSymbols:[...(project.externalSymbols||[]),...COMPUTE_SYMBOLS]};
}
