/** Extend, never replace, the existing Variant Windows execution assertions. */
export const VARIANT_DIVISION_CHECKS=44;
export function appendVariantDivisionChecks(add,check){
 const typed=[['Byte','CByte'],['Integer','CInt'],['Long','CLng'],['Single','CSng'],['Double','CDbl'],['Currency','CCur'],['Date','CDate'],['Decimal','CDec']];
 const failure=(left,right,number,label)=>{
  add(`Err.Clear\nv="retained" & ChrW(0) & "value"\nv=${left}/${right}`);
  check(`Err.Number=${number} And VarType(v)=8 And v="retained" & ChrW(0) & "value"`,label);
 };
 add('On Error Resume Next');
 for(const [name,convert]of typed){
  failure(`CVar(${convert}(1))`,`CVar(${convert}(0))`,11,`${name} nonzero / zero maps to division by zero`);
  failure(`CVar(${convert}(0))`,`CVar(${convert}(0))`,name==='Decimal'?11:6,`${name} zero / zero keeps its effective-type error`);
 }
 failure('CVar(True)','CVar(False)',11,'Boolean nonzero / zero');
 failure('CVar(False)','CVar(False)',6,'Boolean zero / zero overflows');
 failure('CVar("1")','CVar("0")',11,'String numeric nonzero / zero');
 failure('CVar("0")','CVar("0")',6,'String numeric zero / zero overflows');
 for(const [name,convert]of typed)failure(`CVar(${convert}(0))`,'Empty',['Single','Double','Date','Decimal'].includes(name)?11:6,`${name} zero / Empty preserves the original subtype rule`);
 failure('CVar("0")','Empty',11,'String zero / Empty is division by zero');
 failure('Empty','Empty',6,'Empty / Empty overflows');
 for(const [name,convert]of [['Single','CSng'],['Double','CDbl'],['Currency','CCur'],['Date','CDate']]){
  failure('CDec(0)',`CVar(${convert}(0))`,name==='Single'?11:6,`Decimal / ${name} zero follows the effective type`);
  failure(`CVar(${convert}(0))`,'CDec(0)',name==='Single'?11:6,`${name} / Decimal zero follows the effective type`);
 }
 failure('CVar(1#)','CVar(-0#)',11,'negative zero divisor is classified as zero');
 failure('CVar(1E+308)','CVar(1E-308)',6,'nonzero divisor with genuine overflow remains overflow');
 failure('CVar("invalid")','CVar(0)',13,'invalid String operand preserves type mismatch');
 failure('CVErr(7)','CVar(0)',13,'Error operand preserves type mismatch');
 add('Err.Clear\nOn Error GoTo Unexpected\nv=Null/CVar(0)');
 check('IsNull(v) And Err.Number=0','Null division stays Null without an arithmetic error');
 add('v=CVar(7)/CVar(2)');check('v=3.5 And Err.Number=0','successful division is unchanged');
}
