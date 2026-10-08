/** Original self-checking binary-double chart fixture; execute on Windows. */
import {newProject,createControl} from '../src/project/model.js';
export function chartControlFixture(){
 const project=newProject('AotControlChart'),form=project.modules[0],chart=createControl('MSChart','Plot'),checks=[],code=[];
 Object.assign(chart.properties,{RowCount:3,ColumnCount:2,GridData:[[12.25,3],[-4.5,7],[1.125,9]],RowLabels:['First','Second','Third'],ColumnLabels:['One','Two']});form.form.controls=[chart];
 const add=s=>code.push(s),check=(s,label)=>{checks.push(label);add(`If Not (${s}) Then ExitProcess ${checks.length}`);};
 add('Dim n As Long, value As Double, text As String');check('Plot.Data=12.25 And Plot.RowLabel="First"','binary-double persisted chart data and labels');
 add('Plot.Row=2\nPlot.Column=1');check('Plot.Data=-4.5','negative chart value at a one-based row/column');
 add('Plot.Column=2\nPlot.Data=3.141592653589793\nvalue=Plot.Data\nPlot.RowLabel="日本" & vbNullChar & "row"');check('value=3.141592653589793 And Len(Plot.RowLabel)=6','Double precision and counted Unicode labels');
 add('Plot.RowCount=5\nPlot.ColumnCount=3');check('Plot.Data=value And Plot.ColumnLabel="Two"','atomic chart resize retains values and label identity');
 add('Plot.ChartType=3');check('Plot.ChartType=3','native line plot selection');
 add('On Error Resume Next\nErr.Clear\nPlot.ChartType=2');check('Err.Number=380 And Plot.ChartType=3','unsupported plot type fails instead of drawing a substitute');
 add('Err.Clear\nPlot.RowCount=10001');check('Err.Number=380 And Plot.RowCount=5 And Plot.Data=value','invalid resize leaves chart data unchanged');add('Err.Clear\nOn Error GoTo 0');
 add('Plot.ColumnCount=0');check('Plot.ColumnCount=0','zero-column chart is supported');
 add('On Error Resume Next\nvalue=Plot.Data');check('Err.Number=381','empty chart has no selectable data cell');add('Err.Clear\nOn Error GoTo 0');
 form.code=`Option Explicit\nPrivate Declare Sub ExitProcess Lib "kernel32" (ByVal code As Long)\nPrivate Sub Form_Load()\n${code.join('\n')}\nExitProcess 0\nEnd Sub`;
 return {project,checks};
}
