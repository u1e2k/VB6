/** Native typed-reference acceptance; the caller observes mutations immediately. */
export function appendVariantReferenceChecks(add,check){
 add('Dim rb As Byte, ri As Integer, rl As Long, rf As Single, rd As Double, rc As Currency, rt As Date, rbool As Boolean, rs As String\nDim refvalues() As Long');
 const rows=[['rb',17,'CByte(255)','255'],['ri',2,'CInt(-32768)','-32768'],['rl',3,'CLng(2147483647)','2147483647'],['rf',4,'16777217#','16777216!'],['rd',5,'12.25#','12.25#'],['rc',6,'123.4567@','123.4567@'],['rt',7,'CDate(123.25)','CDate(123.25)'],['rbool',11,'True','True'],['rs',8,'"A" & ChrW(0) & "B"','"A" & ChrW(0) & "B"']];
 for(const [name,vt,value,expected]of rows){
  add(`RefSet ${name},${value}`);check(`${name}=${expected} And RefTag(${name})=${vt}`,`ByRef Variant assignment preserves ${name} storage and subtype`);
 }
 add('rl=7\nv=RefAliases(rl,rl)');check('v=42 And rl=42','two typed Variant references observe immediate writes to one referent');
 add('RefForward rl');check('rl=11','forwarded typed Variant reference keeps its referent');
 add('rl=19\nRefSet (rl),22');check('rl=19','parenthesized typed l-value binds an isolated Variant temporary');
 add('rs="same" & ChrW(0)\nRefSet rs,rs');check('rs="same" & ChrW(0)','String self-assignment snapshots before releasing old BSTR');
 add('RefAppend rs');check('rs="same" & ChrW(0) & "!"','read-modify-write through a String reference retains counted text');
 add('On Error Resume Next\nErr.Clear\nri=123\nRefSet ri,32768');check('Err.Number=6 And ri=123','typed Integer reference rejects overflow without changing caller storage');
 add('Err.Clear\nrb=12\nRefSet rb,-1');check('Err.Number=6 And rb=12','typed Byte reference keeps unsigned range checks');
 add('Err.Clear\nrl=73\nRefSet rl,"bad"');check('Err.Number=13 And rl=73','typed reference conversion failure preserves caller value');
 add('Err.Clear\nRefSet rl,Null');check('Err.Number=94 And rl=73','Null-to-typed-reference assignment raises error 94');
 add('Err.Clear\nRefSet rl,CVErr(7)');check('Err.Number=13 And rl=73','Error-to-typed-reference assignment remains implicit type mismatch');
 add('Err.Clear\nRefSetThenFail rl');check('Err.Number=6 And rl=9','completed ByRef writes survive a later callee error');
 add('Err.Clear\nOn Error GoTo Unexpected\nrl=0\nRefSet rl,2.5#');check('rl=2','typed ByRef conversion uses banker rounding');
 add('RefSet rl,3.5#');check('rl=4','typed ByRef odd midpoint rounds to the even integer');
 add('RefSet rbool,7');check('rbool And CInt(rbool)=-1','Boolean reference writes canonical VB True');
 add('v="old"\nRefSet v,CDec("1.25")');check('VarType(v)=14 And v=CDec("1.25")','untyped Variant reference can replace its owned subtype');
 add('ReDim refvalues(-2 To 0)\nRefSet refvalues(-2),99');check('refvalues(-2)=99 And RefTag(refvalues(-2))=3','typed array element binds its true storage through Variant');
 add('sequence=0\nRefSet refvalues(IndexOnce()),77');check('sequence=1 And refvalues(-2)=77','typed referenced array index is evaluated once');
 add('v=RefLockedResize(refvalues,refvalues(-2))');check('v=10 And refvalues(-2)=77 And UBound(refvalues)=0','typed reference pins its array while the callee attempts resizing');
 add('ReDim Preserve refvalues(-2 To 1)');check('refvalues(-2)=77 And UBound(refvalues)=1','call completion releases typed-reference array pins');
 add('On Error Resume Next\nErr.Clear\nRefSet refvalues(-2),RefFail()');check('Err.Number=6 And refvalues(-2)=77','later failing argument leaves a typed referent unchanged');
 add('Err.Clear\nOn Error GoTo Unexpected\nReDim Preserve refvalues(-2 To 2)');check('UBound(refvalues)=2','error dispatch releases an earlier argument array pin');
 add('For i=1 To 300\n RefSet rs,"text" & CStr(i)\n RefAppend rs\nNext');check('rs="text300!"','repeated BSTR writes through borrowed Variants retain ownership');
}
export const NATIVE_VARIANT_REFERENCE_PROCEDURES=`
Private Sub RefSet(ByRef target As Variant, ByVal value As Variant)
 target=value
End Sub
Private Function RefTag(ByRef value As Variant) As Long
 RefTag=VarType(value)
End Function
Private Function RefAliases(ByRef a As Variant, ByRef b As Variant) As Variant
 a=41
 If b<>41 Then Err.Raise 5
 b=b+1
 RefAliases=a
End Function
Private Sub RefForward(ByRef value As Variant)
 RefSet value,11
End Sub
Private Sub RefAppend(ByRef value As Variant)
 value=value & "!"
End Sub
Private Sub RefSetThenFail(ByRef value As Variant)
 value=9
 Err.Raise 6
End Sub
Private Function RefFail() As Variant
 Err.Raise 6
End Function
Private Function RefLockedResize(ByRef values() As Long, ByRef value As Variant) As Variant
 On Error Resume Next
 ReDim Preserve values(-2 To 4)
 RefLockedResize=Err.Number
 Err.Clear
End Function
`;
