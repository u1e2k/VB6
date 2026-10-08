/** Adds actual PE32 assertions to the retained String-library execution family. */
export function extendNativeStringArrayFixture({add,check}){
 add('Dim parts() As String, selected() As String, source(-2 To 0) As String, matrix(0 To 1,0 To 1) As String, absent() As String');
 add('parts=Split("a,,b,",",")');check('LBound(parts)=0 And UBound(parts)=3 And parts(0)="a" And parts(1)="" And parts(2)="b" And parts(3)=""','Split creates a zero-based String SAFEARRAY including empty trailing items');
 check('Join(parts,"|")="a||b|"','Join retains empty items and delimiter positions');
 add('parts=Split("a,b,c",",",2)');check('UBound(parts)=1 And parts(1)="b,c"','Split limit leaves the unprocessed suffix in its final element');
 add('parts=Split("abc","",-1)');check('UBound(parts)=0 And parts(0)="abc"','empty delimiter produces one complete string');
 add('parts=Split("",",")');check('LBound(parts)=0 And UBound(parts)=-1 And Join(parts,",")=""','empty expression produces an allocated empty array');
 add('parts=Split("abc",",",0)');check('UBound(parts)=-1','zero Split limit produces an empty array');
 add('parts=Split("a b c",,2,)');check('Join(parts,"|")="a|b c"','Split omitted delimiter and comparison bind defaults');
 add('parts=Split("aaa","aa")');check('UBound(parts)=1 And parts(0)="" And parts(1)="a"','Split matches do not overlap');
 add('parts=Split("aXbxc","x",-1,0)');check('Join(parts,"|")="aXb|c"','Split binary comparison preserves case');
 add('parts=Split("aXbxc","x",-1,1)');check('Join(parts,"|")="a|b|c"','Split text comparison uses installed Windows NLS');
 add('s="a" & ChrW(0) & "b" & ChrW(0) & "c"\nparts=Split(s,ChrW(0))');check('UBound(parts)=2 And Join(parts,ChrW(0))=s And Len(Join(parts,ChrW(0)))=5','Split and Join preserve embedded NUL code units');
 add('s="a" & ChrW(&HD800) & "b"\nparts=Split(s,ChrW(&HD800))');check('Join(parts,ChrW(&HD800))=s','binary array strings retain unpaired UTF-16 code units');
 add('source(-2)="alpha"\nsource(-1)="Beta"\nsource(0)="ALPHA"');check('Join(source,"|")="alpha|Beta|ALPHA"','Join reads fixed arrays with negative lower bounds');
 add('selected=Filter(source,"a",True,0)');check('LBound(selected)=0 And UBound(selected)=1 And Join(selected,"|")="alpha|Beta"','Filter includes binary matches and rebases fixed source arrays');
 add('selected=Filter(source,"a",False,0)');check('Join(selected)="ALPHA"','Filter excludes matches when include is false');
 add('selected=Filter(source,"a",True,1)');check('Join(selected,"|")="alpha|Beta|ALPHA"','Filter text matching includes case-folded Windows matches');
 add('selected=Filter(source,"",False)');check('UBound(selected)=-1','Filter empty needle exclusion yields zero matches');
 add('selected=Filter(source,"",True)');check('UBound(selected)=2','Filter empty needle inclusion retains all source elements');
 add('selected=Filter(source,"missing")');check('UBound(selected)=-1 And Join(selected)=""','Filter no-match output is an empty String array');
 check('Join(Filter(Split("one,two,three",","),"o"),"|")="one|two"','nested Split Filter and Join use owned anonymous arrays');
 check('Split("left,right",",")(1)="right" And Filter(Split("one,two",","),"o")(0)="one"','temporary array results support immediate indexed access');
 check('LBound(Split("a,b",","))=0 And UBound(Filter(Split("a,b",","),"a"))=0','LBound and UBound accept nested anonymous String arrays');
 add('arraySequence=0\nparts=Split(limit:=ArrayNumber(2),delimiter:=ArrayText(",",3),expression:=ArrayText("a,b,c",1))');check('arraySequence=231 And Join(parts,"|")="a|b,c"','named array-string arguments execute once in authored order');
 add('parts=Split("old,value",",")\ns=Join(parts,ArrayMutateDelimiter(parts))');check('s="old-value" And parts(0)="changed"','Join snapshots earlier array arguments before later ByRef mutations');
 add('parts=Split("old,value",",")\nparts=Filter(parts,ArrayMutateNeedle(parts))');check('Join(parts)="old"','Filter supports self-assignment and retains its evaluated input snapshot');
 add('parts=Split("a,b",",")\nselected=parts\nparts(0)="changed"');check('selected(0)="a"','Split results retain deep whole-array copy semantics');
 add('ReDim Preserve parts(0 To 3)');check('parts(0)="changed" And parts(1)="b" And parts(2)="" And UBound(parts)=3','Split result descriptors permit ReDim Preserve');
 add('Erase parts\nReDim parts(0 To 0)\nparts(0)="kept"\nOn Error Resume Next\nErr.Clear\nparts=Split("x",",",-2)');check('Err.Number=5 And parts(0)="kept"','invalid Split limit leaves the previous array unchanged');
 add('Err.Clear\nparts=Filter(parts,"x",True,2)');check('Err.Number=5 And parts(0)="kept"','invalid Filter mode preserves the previous destination');
 add('Err.Clear\ns="kept"\ns=Join(absent)');check('Err.Number=9 And s="kept"','Join rejects unallocated sources without assigning');
 add('Err.Clear\ns=Join(matrix)');check('Err.Number=13 And s="kept"','Join rejects multidimensional sources');
 add('Err.Clear\ns=Split("x",",")(1)');check('Err.Number=9 And s="kept"','anonymous String-array indexing reports recoverable error 9');
 add('Err.Clear\nArrayLocked parts(0),parts');check('Err.Number=10 And parts(0)="kept"','array publication detects a ByRef-pinned destination and preserves it');
 add('Err.Clear\nOn Error GoTo 0\nReDim Preserve parts(0 To 1)\nparts(0)=String$(524288,"a")\nparts(1)=String$(524288,"b")');check('Len(Join(parts,""))=1048576','Join accepts the exact native output string budget');
 add('On Error Resume Next\nErr.Clear\ns="kept"\ns=Join(parts,"|")');check('Err.Number=7 And s="kept"','Join rejects output beyond the counted BSTR budget before assignment');
 add('Err.Clear\nOn Error GoTo 0\nFor i=1 To 1000\nparts=Split("a,b,c",",")\nparts=Filter(parts,"b",False)\ns=Join(parts,"|")\nNext');check('s="a|c"','repeated allocating array pipelines retain ownership');
 check('ArrayTextPolicy()="a|b|c:0"','array-string comparison follows caller Option Compare and Split ignores Option Base');
 return {declarations:'Private arraySequence As Long',handlers:`Private Function ArrayText(ByVal value As String, ByVal marker As Long) As String
 arraySequence=arraySequence*10+marker
 ArrayText=value
End Function
Private Function ArrayNumber(ByVal value As Long) As Long
 arraySequence=arraySequence*10+value
 ArrayNumber=value
End Function
Private Function ArrayMutateDelimiter(ByRef value() As String) As String
 value(0)="changed"
 ArrayMutateDelimiter="-"
End Function
Private Function ArrayMutateNeedle(ByRef value() As String) As String
 value(0)="changed"
 ArrayMutateNeedle="old"
End Function
Private Sub ArrayLocked(ByRef element As String, ByRef target() As String)
 target=Split("replacement",",")
End Sub`};
}
export const nativeStringArrayPolicyModule={id:'array-policy',name:'ArrayPolicyModule',kind:'module',code:`Option Explicit
Option Compare Text
Option Base 1
Public Function ArrayTextPolicy() As String
 Dim values() As String
 values=Split("aXbxc","x",,vbUseCompareOption)
 ArrayTextPolicy=Join(Filter(values,"",True),"|") & ":" & CStr(LBound(values))
End Function`};
