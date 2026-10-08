import {newProject,createControl} from '../src/project/model.js';
/** Extend the existing editing family without replacing its original assertions
 * or changing the native Windows optimization/execution matrix. */
export function extendNativeMetadataFixture(f){
 const {project,form,control,add,check}=f;
 form.form.properties.Tag='form\0seed';
 const secondary=newProject('MetadataSecondary').modules[0];secondary.name='MetaForm';secondary.form.name='MetaForm';secondary.id='metadata-secondary';
 secondary.form.properties.Tag='reload\0seed';secondary.form.controls=[];secondary.code='';
 const clock=createControl('Timer','Clock');Object.assign(clock.properties,{Enabled:0,Tag:'clock\0seed'});secondary.form.controls.push(clock);project.modules.push(secondary);
 control('Timer','TimerTag',{Index:3,Enabled:0,Tag:'three\0tail'});
 control('Timer','TimerTag',{Index:8,Enabled:0,Tag:'eight\0tail'});
 control('TextBox','Tagged',{Tag:'control\0seed',TabStop:0});
 add('Dim metadataText As String, oldStyle As Long');
 check('Me.Name="Form1" And Len(Me.Tag)=9 And Right$(Me.Tag,4)="seed"','form Name and counted design-time Tag are lowered');
 check('Len(Tagged.Tag)=12 And AscW(Mid$(Tagged.Tag,8,1))=0 And Right$(Tagged.Tag,4)="seed"','control design Tag preserves text after embedded NUL');
 add('Tagged.Tag="left" & ChrW(0) & "right"\nmetadataText=Tagged.Tag\nTagged.Tag=Tagged.Tag');
 check('Len(Tagged.Tag)=10 And Tagged.Tag=metadataText','runtime Tag self-assignment preserves a counted owned snapshot');
 add('Tagged.Tag="changed"');check('Len(metadataText)=10 And Right$(metadataText,5)="right"','a Tag getter snapshot survives replacement of its source');
 add('Tagged.Tag=""');check('Len(Tagged.Tag)=0','empty Tag assignment accepts a null BSTR');
 add('Me.Tag=metadataText');check('Me.Tag=metadataText','form Tag has independent counted BSTR ownership');
 add('With Button(8)\n .Tag=metadataText\nEnd With');check('Button(8).Tag=metadataText And Len(Button(3).Tag)=0','indexed HWND Tag state is independent across siblings');
 check('TimerTag(3).Tag="three" & ChrW(0) & "tail" And TimerTag(8).Tag="eight" & ChrW(0) & "tail"','windowless indexed timer design tags use distinct slots');
 add('metadataCalls=0\nWith TimerTag(MetadataIndex())\n .Tag=metadataText\n .Tag=.Tag\nEnd With');
 check('metadataCalls=1 And TimerTag(8).Tag=metadataText And TimerTag(3).Tag="three" & ChrW(0) & "tail"','With-bound timer Index is evaluated once and keeps sibling Tag independent');
 add('metadataCalls=0\nmetadataText=TimerTag(MetadataIndex()).Name');check('metadataCalls=1 And metadataText="TimerTag"','indexed Name evaluates its receiver exactly once');
 add('metadataText=MetaForm.Tag');check('metadataText="reload" & ChrW(0) & "seed" And MetaForm.Clock.Name="Clock"','a form default instance initializes counted metadata on first load');
 check('MetaForm.Clock.Tag="clock" & ChrW(0) & "seed"','scalar windowless Timer Tag retains counted design data');
 add('MetaForm.Tag="discard"\nMetaForm.Clock.Tag="discard"\nUnload MetaForm');
 check('MetaForm.Tag="reload" & ChrW(0) & "seed" And MetaForm.Clock.Tag="clock" & ChrW(0) & "seed"','form unload/reload clears owned metadata and restores design tags');
 add('Unload MetaForm');
 check('Not Tagged.TabStop And Edit.TabStop And VarType(Edit.TabStop)=11','TabStop reads real initial styles and has Boolean type');
 add('oldStyle=MetadataStyle(Edit.hWnd,-16)\nEdit.TabStop=False');
 check('Not Edit.TabStop And MetadataStyle(Edit.hWnd,-16)=(oldStyle And Not &H10000)','TabStop false clears only WS_TABSTOP on the actual HWND');
 add('Edit.TabStop=2');check('Edit.TabStop And MetadataStyle(Edit.hWnd,-16)=oldStyle','nonzero numeric TabStop coerces to true without changing other styles');
 add('oldStyle=MetadataStyle(Tagged.hWnd,-16)\nn=MetadataSetStyle(Tagged.hWnd,-16,oldStyle Or &H10000)');
 check('Tagged.TabStop','TabStop getter observes changes made through external Win32 API');
 add('Tagged.TabStop=False\nWith Button(8)\n .TabStop=False\nEnd With');check('Button(3).TabStop And Not Button(8).TabStop','indexed With TabStop changes only the selected HWND');
 add('Rich.TabStop=False\nEdit.TabStop=False\nButton(8).TabStop=True');
 check('MetadataNextTab(Surface.hWnd,Button(3).hWnd,0)=Button(8).hWnd','native dialog tab traversal includes an enabled tab stop');
 add('Button(8).TabStop=False');check('MetadataNextTab(Surface.hWnd,Button(3).hWnd,0)=Button(3).hWnd','native dialog tab traversal skips a cleared tab stop');
 add('On Error Resume Next\nErr.Clear\nmetadataText=TimerTag(7).Name');check('Err.Number=340','indexed Name checks missing element instead of returning a constant');
 add('Err.Clear\nTimerTag(7).Tag="bad"');check('Err.Number=340','windowless timer Tag rejects absent indices');
 add('Err.Clear\nOn Error GoTo 0\nFor i=1 To 1000\nMe.Tag="form" & ChrW(0) & CStr(i)\nTimerTag(3).Tag=Me.Tag\nEdit.Tag=TimerTag(3).Tag\nNext');
 check('Len(Edit.Tag)=9 And Edit.Tag="form" & ChrW(0) & "1000"','repeated form/timer/control Tag replacements retain ownership and counted data');
 return {declarations:`Private metadataCalls As Long
Private Declare Function MetadataStyle Lib "user32" Alias "GetWindowLongW" (ByVal hwnd As Long, ByVal index As Long) As Long
Private Declare Function MetadataSetStyle Lib "user32" Alias "SetWindowLongW" (ByVal hwnd As Long, ByVal index As Long, ByVal value As Long) As Long
Private Declare Function MetadataNextTab Lib "user32" Alias "GetNextDlgTabItem" (ByVal hwnd As Long, ByVal previous As Long, ByVal reverse As Long) As Long`,handlers:`Private Function MetadataIndex() As Integer
 metadataCalls=metadataCalls+1
 MetadataIndex=8
End Function`};
}
