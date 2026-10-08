/** Owned array values and indexed Variant l-values in the real PE32 matrix. */
export function appendVariantArrayChecks(add,check){
 add('Dim aLong(1 To 3) As Long, longs() As Long, texts() As String, bytes(0 To 2) As Byte, words(0 To 2) As Integer, flags(0 To 2) As Boolean\nDim singles(0 To 2) As Single, doubles(0 To 2) As Double, currencies(0 To 2) As Currency, dates(0 To 2) As Date\nDim matrix(-1 To 1,3 To 4) As String');
 add('v=Array()');check('IsArray(v) And VarType(v)=8204 And TypeName(v)="Variant()" And LBound(v)=0 And UBound(v)=-1','Array() is an empty owned zero-based Variant array');
 add('v=Array(1,"text",Null,Empty,CVErr(7),CDec("0.0000000000000000000000000001"))');check('v(0)=1 And v(1)="text" And IsNull(v(2)) And IsEmpty(v(3)) And IsError(v(4)) And v(5)=CDec("0.0000000000000000000000000001")','Array preserves scalar tags, Null, Empty, Error and Decimal');
 add('v=Array(7,,9)');check('IsMissing(v(1)) And v(0)=7 And v(2)=9','Array comma omission remains distinguishable from Empty');
 add('w="before"\nv=Array(w,Mutate(w))');check('v(0)="before" And v(1)="changed" And w="changed"','Array snapshots each argument before evaluating later actuals');
 add('sequence=0\nv=Array(Mark(1),Mark(2),Mark(3))');check('sequence=123 And v(0)=1 And v(2)=3','Array evaluates positional values left to right exactly once');
 add('aLong(1)=7\naLong(2)=8\naLong(3)=9\nv=aLong\naLong(1)=99');check('IsArray(v) And VarType(v)=8195 And TypeName(v)="Long()" And LBound(v)=1 And UBound(v)=3 And v(1)=7','typed fixed array boxes as an independent correctly tagged value array');
 add('v(2)=21');check('v(2)=21 And aLong(2)=8','typed Variant-contained array writes do not alias the original typed source');
 add('w=v\nv(1)=50');check('w(1)=7 And v(1)=50','copying a Variant array duplicates element storage');
 add('v=v');check('v(1)=50 And v(2)=21','Variant array self assignment retains its complete value');
 add('ReDim Preserve v(1 To 5)');check('UBound(v)=5 And v(1)=50 And v(5)=0 And VarType(v)=8195','a value copy of a fixed array is independently resizable');
 add('longs=v\nv(1)=51');check('longs(1)=50 And UBound(longs)=5','typed dynamic array assignment from a Variant array owns an independent descriptor');
 add('v="A" & ChrW(0) & ChrW(&HD800) & "B"\nReDim texts(2 To 3)\ntexts(2)=v\ntexts(3)="second"\nw=texts\ntexts(2)="source"');check('w(2)=v And Len(CStr(w(2)))=4 And VarType(w)=8200 And TypeName(w)="String()"','String array value copies retain counted BSTR contents');
 add('w(3)="target" & ChrW(0)\ntexts=w\nw(2)="later"');check('texts(2)=v And texts(3)="target" & ChrW(0)','String array writes and extraction preserve BSTR ownership');
 add('bytes(0)=17\nbytes(1)=255\nbytes(2)=19\nv=bytes\nv(1)=12');check('VarType(v(1))=17 And v(0)=17 And v(1)=12 And v(2)=19 And bytes(1)=255','Variant Byte element writes touch one byte without neighbor corruption');
 add('words(0)=100\nwords(1)=-32768\nwords(2)=300\nv=words\nv(1)=32767');check('VarType(v(1))=2 And v(0)=100 And v(1)=32767 And v(2)=300','Variant Integer element writes touch exactly two signed bytes');
 add('flags(0)=True\nflags(1)=False\nflags(2)=True\nv=flags\nv(1)=2');check('VarType(v(1))=11 And v(0) And v(1) And v(2)','Variant Boolean element assignment uses Boolean coercion and correct width');
 add('singles(1)=1.25!\nv=singles\nv(1)=2.5#');check('VarType(v(1))=4 And v(1)=2.5!','Variant Single array element uses R4 rather than R8 storage');
 add('doubles(1)=16777217#\nv=doubles\nv(1)=16777219#');check('VarType(v(1))=5 And v(1)=16777219#','Variant Double element retains all R8 payload bits');
 add('currencies(1)=922337203685477.5807@\nv=currencies\nv(1)=-922337203685477.5808@');check('VarType(v(1))=6 And v(1)=-922337203685477.5808@','Variant Currency array element retains exact 64-bit scaled storage');
 add('dates(1)=CDate(7.25)\nv=dates\nv(1)=CDate(9.5)');check('VarType(v(1))=7 And CDbl(v(1))=9.5#','Variant Date array elements retain their subtype');
 add('matrix(-1,3)="first"\nmatrix(1,4)="last"\nv=matrix\nv(0,4)="middle"');check('LBound(v,1)=-1 And UBound(v,1)=1 And LBound(v,2)=3 And UBound(v,2)=4 And v(-1,3)="first" And v(0,4)="middle" And v(1,4)="last"','multidimensional Variant array indexing and bounds retain declaration order');
 add('v=Array(Array(1,"inner"),Array(CDec("1.25"),Null))\nv(0)(1)="edited"\nw=v\nv(1)(0)=CDec("2.5")');check('v(0)(1)="edited" And w(0)(1)="edited" And v(1)(0)=CDec("2.5") And w(1)(0)=CDec("1.25") And IsNull(v(1)(1))','nested Variant array copies and dependent element pins retain deep ownership');
 check('Array(Array(5,6))(0)(1)=6 And VAResult()(1)="result"','temporary array expressions and Variant function results can be indexed');
 add('v=Array("caller",Array(7))\nw=VAByVal(v)');check('v(0)="caller" And v(1)(0)=7 And w(0)="private" And w(1)(0)=8','ByVal Variant array calls isolate nested values and return owned arrays');
 add('v=Array("one","two")\nChangeByRef v(1)');check('v(0)="one" And v(1)="updated"','Variant-array l-values pass directly to ByRef Variant parameters');
 add('v=aLong\nVASetNumber v(2)');check('v(2)=321 And aLong(2)=8','typed elements passed ByRef Variant preserve their original element type');
 add('v=Array("outer")\nw=PAValue(0,v)\nw(0)="packed"');check('v(0)="outer" And w(0)="packed"','ParamArray can contain whole array values with independent ownership');
 add('sequence=0\nv=Array("zero","one")\nv(VAIndex())="once"');check('sequence=1 And v(1)="once"','Variant array assignment evaluates a side-effecting index exactly once');
 add('q=Empty\nReDim q(-2 To 0)\nq(-2)="allocated"\nReDim Preserve q(-2 To 3)');check('VarType(q)=8204 And LBound(q)=-2 And UBound(q)=3 And q(-2)="allocated" And IsEmpty(q(3))','ReDim of Empty creates a Variant-element array and Preserve retains data');
 add('ReDim q(1 To 2) As String\nq(1)="typed"\nReDim Preserve q(1 To 4)');check('VarType(q)=8200 And q(1)="typed" And q(4)=""','non-preserving ReDim changes Variant array element type and subsequent implicit Preserve retains it');
 add('Erase q');check('IsArray(q) And VarType(q)=8200 And TypeName(q)="String()"','Erase Variant arrays retains their array subtype with unallocated storage');
 add('ReDim q(2 To 3)\nq(2)="reallocated"');check('VarType(q)=8200 And q(2)="reallocated"','Erased Variant arrays can be reallocated with the previous element type');
 add('On Error Resume Next\nErr.Clear\nv=bytes\nv(1)=256');check('Err.Number=6 And v(1)=255 And v(0)=17 And v(2)=19','overflowing narrow element assignment leaves the entire array unchanged');
 add('Err.Clear\nv(1)=Null');check('Err.Number=94 And v(1)=255','Null cannot overwrite a typed element');
 add('Err.Clear\nv(1)="bad"');check('Err.Number=13 And v(1)=255','failed implicit numeric conversion preserves the old typed array element');
 add('Err.Clear\nv(5)=1');check('Err.Number=9 And v(1)=255','out-of-bounds Variant array assignment raises error 9');
 add('Err.Clear\nw=v(0,1)');check('Err.Number=9','Variant array rank mismatch raises error 9');
 add('Err.Clear\nw=UBound(v,2)');check('Err.Number=9','invalid Variant array bound dimension raises error 9');
 add('Err.Clear\nv=7\nw=v(0)');check('Err.Number=13 And v=7','indexing a non-array Variant raises type mismatch');
 add('Err.Clear\nErase v');check('Err.Number=13 And v=7','Erase does not silently discard a non-array Variant');
 add('Err.Clear\nReDim v(2)');check('Err.Number=13 And v=7','ReDim does not silently overwrite an already initialized scalar Variant');
 add('Err.Clear\nv=aLong\nReDim Preserve v(0 To 3)');check('Err.Number=9 And LBound(v)=1 And UBound(v)=3','Preserve rejects changing a lower bound without destroying data');
 add('Err.Clear\nReDim Preserve v(1 To 4) As String');check('Err.Number=13 And VarType(v)=8195 And UBound(v)=3','Preserve rejects changing the array element subtype');
 add('Err.Clear\nlongs=v\nlongs=Array("wrong type")');check('Err.Number=13 And longs(1)=99','Variant extraction into a typed array requires the exact declared element subtype');
 add('Err.Clear\nv=Array("retained")\nw=VALockedResize(v,v(0))');check('w=10 And v(0)="retained" And UBound(v)=0','a ByRef element prevents reallocating its containing Variant array');
 add('Err.Clear\nw=VALockedReplace(v,v(0))');check('w=10 And v(0)="retained"','a ByRef element prevents clearing/replacing its containing Variant array');
 add('Err.Clear\nv=Array(Array("retained"))\nw=VALockedReplace(v,v(0)(0))');check('w=10 And v(0)(0)="retained"','nested ByRef elements retain every containing array pin');
 add('Err.Clear\nw=VALockedInner(v,v(0)(0))');check('w=10 And v(0)(0)="retained"','nested ByRef elements prevent replacing their immediate inner owner');
 add('Err.Clear\nOn Error GoTo Unexpected');check('VAOptionBases()','Array honors Option Base while VBA.Array remains zero-based');
 add('For i=1 To 300\n v=Array(Array("a" & CStr(i)),Array(i,CDec("1.25")))\n w=VAByVal(v)\nNext');check('v(0)(0)="a300" And v(1)(0)=300 And w(1)(0)=8','repeated nested arrays and function returns retain only current statement ownership');
}
export const NATIVE_VARIANT_ARRAY_PROCEDURES=`
Private Function VAResult() As Variant
 VAResult=Array(7,"result")
End Function
Private Function VAByVal(ByVal value As Variant) As Variant
 value(0)="private"
 value(1)(0)=8
 VAByVal=value
End Function
Private Sub VASetNumber(ByRef value As Variant)
 value=321
End Sub
Private Function VAIndex() As Long
 sequence=sequence+1
 VAIndex=1
End Function
Private Function VALockedResize(ByRef value As Variant,ByRef element As Variant) As Long
 On Error Resume Next
 ReDim value(2)
 VALockedResize=Err.Number
 Err.Clear
End Function
Private Function VALockedReplace(ByRef value As Variant,ByRef element As Variant) As Long
 On Error Resume Next
 value=Array("replacement")
 VALockedReplace=Err.Number
 Err.Clear
End Function
Private Function VALockedInner(ByRef value As Variant,ByRef element As Variant) As Long
 On Error Resume Next
 value(0)=Array("replacement")
 VALockedInner=Err.Number
 Err.Clear
End Function
`;
export const NATIVE_VARIANT_ARRAY_BASE_MODULE={id:'variant-array-base',name:'VariantArrayBase',kind:'module',code:`Option Explicit
Option Base 1
Public Function VAOptionBases() As Boolean
 Dim value As Variant, zeroBased As Variant
 value=Array("a","b")
 zeroBased=VBA.Array("c","d")
 VAOptionBases=LBound(value)=1 And UBound(value)=2 And value(1)="a" And LBound(zeroBased)=0 And UBound(zeroBased)=1 And zeroBased(0)="c"
End Function`};
