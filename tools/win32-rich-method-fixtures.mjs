/** Actual RichEdit acceptance; the Windows control harness executes each
 * freestanding compiled fixture at O0/O1/O2, not the mocked instruction machine. */
export function richMethodFixture(fixture){
 const {control,add,check,finish}=fixture('AotControlRichMethods');
 control('RichTextBox','Rich',{Text:'Alpha beta ALPHA alphabet',Width:9000,Height:3000});
 add('Dim n As Long\nRich.SelStart=0\nRich.SelLength=Len(Rich.Text)\nRich.SelBold=False\nRich.SelProtected=True');
 check('Rich.SelProtected And Not IsNull(Rich.SelProtected)','protected selection flag and uniform mask round-trip');
 add('Rich.SelProtected=False\nRich.SelBullet=True');
 check('Rich.SelBullet And Not IsNull(Rich.SelBullet)','native paragraph numbering reports a uniform bullet selection');
 add('Rich.SelBullet=False');check('Not Rich.SelBullet','clearing bullet numbering retains the paragraph');
 add('Rich.SelStart=0\nRich.SelLength=5\nRich.SelBold=True\nRich.SelStart=0\nRich.SelLength=10');
 check('IsNull(Rich.SelBold)','mixed formatting can be queried without raising scalar Null conversion');
 add('On Error Resume Next\nErr.Clear\nn=Rich.SelBold');check('Err.Number=94','ordinary mixed getter still reports invalid use of Null');
 add('Err.Clear\nOn Error GoTo 0\nRich.SelStart=0\nRich.SelLength=5');
 check('Not IsNull(Rich.SelBold) And Rich.SelBold','uniform formatting remains scalar after mixed query');
 add('n=Rich.Find("ALPHA",0,-1,4)');check('n=11 And Rich.SelStart=11 And Rich.SelLength=5','case-sensitive Find selects the actual matching character range');
 add('n=Rich.Find("alpha",12,-1,2)');check('n=-1 And Rich.SelStart=11 And Rich.SelLength=5','whole-word rejection does not disturb selection');
 add('n=Rich.Find("alpha",12,-1,8)');check('n=17 And Rich.SelStart=11 And Rich.SelLength=5','no-highlight Find returns the match while preserving selection');
 add('n=Rich.Find("ALPHA",0,5,6)');check('n=-1 And Rich.SelStart=11','bounded case-sensitive search respects its end position');
 add('n=Rich.Find("")');check('n=-1 And Rich.SelStart=11','empty Find is not a zero-width selection mutation');
 add('n=Rich.Find("beta",,,-0)');check('n=6 And Rich.SelLength=4','omitted positional Find options use their defaults');
 add('On Error Resume Next\nErr.Clear\nn=Rich.Find("a",3,2)');check('Err.Number=380 And Rich.SelStart=6','reversed range fails before native mutation');
 add('Err.Clear\nn=Rich.Find("a",0,-1,1)');check('Err.Number=380 And Rich.SelStart=6','unsupported Find flags fail before native mutation');
 add('Err.Clear\nn=Rich.Find("a" & ChrW$(0) & "b")');check('Err.Number=380 And Rich.SelStart=6','embedded NUL does not silently search a prefix');
 add('Err.Clear\nOn Error GoTo 0\nRich.Text="ab" & vbCrLf & "cd"');
 check('Rich.GetLineFromChar(0)=0 And Rich.GetLineFromChar(4)=1','native line lookup distinguishes explicit paragraph breaks');
 add('n=SendValue(Rich.hWnd,&HCD,0,0)\nRich.SelStart=0\nRich.SelLength=0\nRich.SelText="Z"');
 check('Rich.CanUndo()','native insertion is present in the RichEdit undo queue');
 add('Rich.Undo');check('Left$(Rich.Text,2)="ab" And Rich.CanRedo()','Undo restores content and enables Redo');
 add('Rich.Redo');check('Left$(Rich.Text,3)="Zab"','Redo restores the native insertion');
 add('Rich.Text="Unicode " & ChrW$(937) & " " & ChrW$(20013)\nn=Rich.Find(ChrW$(20013),0,-1,4)');
 check('n=10 And Rich.SelLength=1','Find uses UTF-16 instead of an ANSI search buffer');
 return finish();
}
