/** Explicit link dependencies of authored support units. This is not a scan of
 * generated application text. Build-time extraction validates every named unit. */
export const RUNTIME_CATALOG = Object.freeze({
  'VbNativeArrays.Index': {dependencies:[]},
  'VbNativeArrays.Bound': {dependencies:[]},
  VbCurrency: {file:'VbCurrency.vb', dependencies:[]},
  IVbValue: {file:'VbArray.vb', type:'Interface', dependencies:[]},
  IVbArray: {file:'VbArray.vb', type:'Interface', dependencies:[]},
  VbArrayBounds: {file:'VbArrayBounds.vb', dependencies:[]},
  VbArray: {file:'VbArray.vb', type:'Class', dependencies:['IVbValue','IVbArray','VbArrayBounds','VbArrays','VbRuntime.CopyValue']},
  VbArrays: {file:'VbArrays.vb', dependencies:['VbArray','IVbValue','IVbArray','VbArrayBounds','VbCurrency','VbRuntime.CopyValue','VbRuntime.IsArray','VbRuntime.IsObject']},
  VbMissing: {file:'VbRuntime.vb', type:'Enum', dependencies:[]},
  'VbRuntime.CopyValue': {dependencies:['IVbValue','VbArrays']},
  'VbRuntime.AutoNew': {dependencies:[]},
  'VbRuntime.IsNull': {dependencies:[]},
  'VbRuntime.IsEmpty': {dependencies:[]},
  'VbRuntime.IsMissing': {dependencies:['VbMissing']},
  'VbRuntime.IsArray': {dependencies:['IVbArray']},
  'VbRuntime.IsObject': {dependencies:['VbRuntime.IsArray','VbRuntime.IsNull']},
  'VbRuntime.Array': {dependencies:['VbArray']},
  'VbRuntime.LBound': {dependencies:['IVbArray']},
  'VbRuntime.UBound': {dependencies:['IVbArray']},
  'VbRuntime.Split': {dependencies:['VbArray']},
  'VbRuntime.Filter': {dependencies:['VbArray','VbRuntime.Enumerate']},
  'VbRuntime.Join': {dependencies:['VbRuntime.Enumerate']},
  'VbRuntime.Enumerate': {dependencies:['IVbArray']},
  'VbRuntime.TypeName': {dependencies:['VbCurrency','IVbArray','VbRuntime.TypeNameFromType']},
  'VbRuntime.TypeNameFromType': {dependencies:['VbCurrency']},
  'VbRuntime.VarType': {dependencies:['VbCurrency','IVbArray']},
  'VbRuntime.Len': {dependencies:['VbCurrency']},
  'VbRuntime.LenB': {dependencies:['VbRuntime.Len']},
  'VbRuntime.Abs': {dependencies:['VbCurrency']},
  'VbRuntime.Sgn': {dependencies:['VbCurrency']},
  'VbRuntime.Round': {dependencies:['VbCurrency']},
  'VbRuntime.FixedString': {dependencies:[]},
  'VbRuntime.Align': {dependencies:[]},
  'VbRuntime.MidAssign': {dependencies:[]},
  'VbRuntime.BranchIndex': {dependencies:[]},
  'VbRuntime.UnsupportedPointer': {dependencies:[]},
  'VbVariant.Scalar': {dependencies:['VbCurrency']},
  'VbVariant.Truth': {dependencies:['VbVariant.Scalar']},
  'VbVariant.Unary': {dependencies:['VbVariant.Scalar']},
  'VbVariant.Binary': {dependencies:['VbVariant.Scalar','VbCurrency']},
  'VbForms.GetInstance': {windows:true, fields:['<ThreadStatic> Private _instances As Dictionary(Of Type, Form)','<ThreadStatic> Private _constructing As HashSet(Of Type)'], dependencies:[]},
  'VbForms.Show': {windows:true, dependencies:[]},
  'VbForms.DoEvents': {windows:true, dependencies:[]},
  'VbForms.TwipsToPixels': {windows:true, dependencies:[]},
  'VbForms.PixelsToTwips': {windows:true, dependencies:[]},
  'VbForms.Move': {windows:true, dependencies:['VbForms.TwipsToPixels']},
  'VbForms.RunOpenForms': {windows:true, dependencies:[]},
  'VbForms.ShiftState': {windows:true, dependencies:[]},
  'VbForms.MouseButton': {windows:true, dependencies:[]},
  'VbForms.LoadPicture': {windows:true, dependencies:[]},
  'VbForms.AddItem': {windows:true, dependencies:[]},
  'VbForms.OleColor': {windows:true, dependencies:[]},
  VbApp: {windows:true, file:'VbForms.vb', type:'Module', dependencies:[]}
});

export function runtimeFeature(symbol) {
  if(Object.hasOwn(RUNTIME_CATALOG,symbol))return symbol;
  const type=symbol.split('.')[0];
  if(Object.hasOwn(RUNTIME_CATALOG,type))return type;
  throw new TypeError('Unknown compatibility feature: '+symbol);
}
export function runtimeClosure(roots) {
  const result=new Set();
  const visit=symbol=>{
    const feature=runtimeFeature(symbol);if(result.has(feature))return;
    result.add(feature);for(const dependency of RUNTIME_CATALOG[feature].dependencies)visit(dependency);
  };
  for(const root of roots)visit(root);
  return [...result].sort();
}
