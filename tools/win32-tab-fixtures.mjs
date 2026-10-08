/** Real-Windows acceptance fixtures for tab pages and native caption records. */
import {newProject,createControl} from '../src/project/model.js';
const api=`Private Declare Sub ExitProcess Lib "kernel32" (ByVal code As Long)
Private Declare Function GetWindowLong Lib "user32" Alias "GetWindowLongW" (ByVal hwnd As Long, ByVal index As Long) As Long
Private Declare Function GetFocus Lib "user32" () As Long`;
export function tabControlFixtures(){return [false,true].map(layout=>{
 const project=newProject('AotControlTabPages'+(layout?'Layout':'')),f=project.modules[0],tab=createControl('SSTab','Pages'),a=createControl('TextBox','A'),b=createControl('TextBox','B'),shared=createControl('Label','Shared'),checks=[],body=[];
 project.settings.anchoring=layout;
 Object.assign(tab.properties,{Width:6000,Height:4200,Tabs:2,Tab:0,'TabCaption(0)':'One','TabCaption(1)':'日本','Tab(0).Control(0)':'A','Tab(0).ControlCount':1,'Tab(1).Control(0)':'B','Tab(1).ControlCount':1});
 for(const c of [a,b,shared]){c.parent='Pages';Object.assign(c.properties,{Top:600,Left:300,Visible:-1});}
 b.properties.Left=-74700;shared.properties.Top=2100;f.form.controls=[tab,a,b,shared];
 const add=line=>body.push(line),check=(expr,label)=>{checks.push(label);add(`If Not (${expr}) Then ExitProcess ${checks.length}`);};
 add('Dim n As Long, text As String');
 check('(GetWindowLong(A.hWnd,-16) And &H10000000)<>0 And (GetWindowLong(B.hWnd,-16) And &H10000000)=0','initial tab page masks the inactive child');
 check('B.Visible And B.Left=300 And Pages.TabCaption(1)="日本"','logical child visibility and imported tab metadata survive masking');
 add('Me.Show\nA.SetFocus\nPages.Tab=1');
 check('clicks=1 And previousTab=0 And (GetWindowLong(A.hWnd,-16) And &H10000000)=0','programmatic tab change applies pages before Click and supplies PreviousTab');
 check('(GetWindowLong(B.hWnd,-16) And &H10000000)<>0 And GetFocus()=Pages.hWnd','focus moves away from a hidden page');
 add('B.Visible=False\nPages.Tab=0\nPages.Tab=1');
 if(layout)add('Me.PerformLayout');
 check('Not B.Visible And (GetWindowLong(B.hWnd,-16) And &H10000000)=0','explicit hidden state survives tab changes and layout');
 add('B.Visible=True');check('(GetWindowLong(B.hWnd,-16) And &H10000000)<>0 And Shared.Visible','shared and newly visible children retain independent state');
 add('Pages.TabCaption(1)=String$(6000,"x") & "日本"\ntext=Pages.TabCaption(1)');check('Len(text)=6002 And Right$(text,2)="日本"','native Unicode caption reads do not truncate to a fixed buffer');
 add('On Error Resume Next\nErr.Clear\nPages.TabCaption(8)="Invalid"');check('Err.Number=381 And Pages.TabCaption(1)=text','invalid caption index raises a recoverable error without replacement');add('Err.Clear\nOn Error GoTo 0');
 add('Pages.Tabs.Clear');check('Pages.Tabs.Count=0 And (GetWindowLong(B.hWnd,-16) And &H10000000)=0 And Shared.Visible','clearing tabs masks owned pages and leaves shared children intact');
 f.code=`Option Explicit\n${api}\nPrivate clicks As Long\nPrivate previousTab As Long\nPrivate Sub Form_Load()\n${body.join('\n')}\nExitProcess 0\nEnd Sub\nPrivate Sub Pages_Click(PreviousTab As Integer)\nclicks=clicks+1\npreviousTab=PreviousTab\nEnd Sub`;
 return {project,checks};
});}
