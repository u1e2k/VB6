// VB reserved words, including intrinsic conversion/type tokens. Contextual names
// remain valid ordinary identifiers. This operates on emitted tokens, never data.
const reserved=new Set(('AddHandler AddressOf Alias And AndAlso As Boolean ByRef Byte ByVal Call Case Catch CBool CByte CChar CDate CDbl CDec Char CInt Class CLng CObj Const Continue CSByte CShort CSng CStr CType CUInt CULng CUShort Date Decimal Declare Default Delegate Dim DirectCast Do Double Each Else ElseIf End EndIf Enum Erase Error Event Exit False Finally For Friend Function Get GetType GetXMLNamespace Global GoSub GoTo Handles If Implements Imports In Inherits Integer Interface Is IsNot Let Lib Like Long Loop Me Mod Module MustInherit MustOverride MyBase MyClass Namespace Narrowing New Next Not Nothing NotInheritable NotOverridable Object Of On Operator Option Optional Or OrElse Out Overloads Overridable Overrides ParamArray Partial Private Property Protected Public RaiseEvent ReadOnly ReDim REM RemoveHandler Resume Return SByte Select Set Shadows Shared Short Single Static Step Stop String Structure Sub SyncLock Then Throw To True Try TryCast TypeOf UInteger ULong UShort Using Variant Wend When While Widening With WithEvents WriteOnly Xor').toLowerCase().split(' '));

export function compactIdentifiers(line){
  let result='',index=0;
  while(index<line.length){
    const char=line[index];
    if(char==="'"){result+=line.slice(index);break;}
    if(char==='"'){
      const start=index++;
      while(index<line.length){if(line[index++]==='"'){if(line[index]==='"'){index++;continue;}break;}}
      result+=line.slice(start,index);continue;
    }
    if(char==='['){
      const end=line.indexOf(']',index+1),name=end<0?'':line.slice(index+1,end);
      if(end>=0&&/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)){
        result+=reserved.has(name.toLowerCase())?'['+name+']':name;index=end+1;continue;
      }
    }
    result+=char;index++;
  }
  return result;
}
