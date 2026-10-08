import {newProject,createControl} from '../../src/project/model.js';
/** Same saved definitions and real controls in the host and both export formats. */
export function commonBoundProject(base){
  const project=newProject('CommonDataBinding');project.id='common-data-binding';
  project.settings.renderer='canvas2d';const form=project.modules[0];
  const control=(type,name,left,top,extra={})=>{const c=createControl(type,name,left,top);Object.assign(c.properties,extra);return c;};
  form.form.controls=[control('DataGrid','Grid1',300,300,{Width:6000,Height:2700}),control('TextBox','Title1',300,3300,{Width:4800,Locked:-1}),control('CommandButton','cmdNext',300,4000,{Caption:'Next row'}),control('CommandButton','cmdRefresh',2100,4000,{Caption:'Refresh'}),control('Label','Status1',300,4700,{Width:6000,Caption:'Loading'})];
  project.dataSources={version:1,connections:[{name:'News',provider:'rest',baseUrl:base+'/api/'}],commands:[{name:'Stories',connection:'News',path:'binding/{round}.json',response:'json',parameters:[{name:'round',type:'integer',required:true}]}]};
  form.code=`Option Explicit
Private selected As Object
Private Sub Form_Load()
Set selected = DataEnvironment.rsStories
Title1.DataField = "title"
Set Title1.DataSource = selected
Grid1.DataMember = "Stories"
Set Grid1.DataSource = DataEnvironment
DataEnvironment.Stories 1
Status1.Caption = CStr(selected.RecordCount) & " rows"
End Sub
Private Sub cmdNext_Click()
selected.MoveNext
End Sub
Private Sub cmdRefresh_Click()
DataEnvironment.Stories 2
Status1.Caption = CStr(selected.RecordCount) & " refreshed rows"
End Sub`;
  return project;
}
