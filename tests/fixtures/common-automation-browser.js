import {XML_TREE_PROGRAM,XML_BINARY_PROGRAM} from './common-xml-programs.js';
/** End-to-end VB programs use real fetch against the test server, not fabricated COM results. */
export async function validateCommonAutomationBrowser(api,base){
  const checks=[];
  const equal=(a,b,name)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error(name+': '+JSON.stringify(a)+' != '+JSON.stringify(b));checks.push(name);};
  async function run(code,options={},project={}){
    const program=api.compileProject({name:'CommonBrowser',startup:'Sub Main',...project,modules:[{name:'M',kind:'module',code:'Option Explicit\nSub Main()\n'+code+'\nEnd Sub'}]});
    if(program.diagnostics.length)throw Error(JSON.stringify(program.diagnostics));const output=[],vm=new api.VirtualMachine(program,{...options,print:text=>output.push(text)});
    try{await vm.start();return {output,vm};}finally{vm.stop();await Promise.all([vm.dataClose,vm.automationClose]);}
  }
  equal(!!api.CommonAutomation,true,'public common Automation bundle API');
  const fs=new api.VirtualFileSystem();
  const http=await run(`Dim h As Object, s As Object, b() As Byte
Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
h.setTimeouts 3000, 3000, 5000, 5000
h.Open "GET", "${base}/api/topstories.json", False
h.send
Debug.Print h.status, h.responseText, VarType(h.status)
h.Open "GET", "${base}/api/text", False
h.send
b = h.responseBody
Set s = CreateObject("ADODB.Stream")
s.Type = adTypeBinary
s.Open
s.Write b
s.Position = 0
s.Type = adTypeText
s.Charset = "utf-8"
Debug.Print s.ReadText
s.SaveToFile "/download.txt", adSaveCreateOverWrite
s.Close`,{fs});
  equal(http.output,['200 [101,102] 3','Żółć'],'ServerXMLHTTP -> Byte array -> Stream -> UTF-8');
  equal(new TextDecoder().decode(fs.readBytes('/download.txt')),'Żółć','shared virtual filesystem receives downloaded bytes');
  const data=await run(`Dim ids As Object, item As Object
Set ids = DataEnvironment.GetTopStoryIds()
Do While Not ids.EOF
Set item = DataEnvironment.GetStoryById(CLng(ids.Fields(0).Value))
Debug.Print item.Fields("title").Value
item.Close
ids.MoveNext
Loop
ids.Close`,{}, {dataSources:{version:1,connections:[{name:'News',provider:'rest',baseUrl:base+'/api/'}],commands:[{name:'GetTopStoryIds',connection:'News',path:'topstories.json',response:'json'},{name:'GetStoryById',connection:'News',path:'item/{id}.json',response:'json',parameters:[{name:'id',type:'integer',required:true}]}]}});
  equal(data.output,['Story 101','Story 102'],'transcript DataEnvironment ID-list/detail sequence uses real HTTP');
  const xml=await run(XML_TREE_PROGRAM);
  equal(xml.output,['True','items 2','Second 2 True','3 Third True','First','Second','Third','2','False','True True','False','True'],'opaque MSXML node identity, XPath, live children, editing and parse errors');
  const typed=await run(XML_BINARY_PROGRAM+`n.text = "nothex"
On Error Resume Next
b = n.nodeTypedValue
Debug.Print Err.Number
Err.Clear
d.resolveExternals = True
Debug.Print Err.Number`);
  equal(typed.output,['Value','8209 0 255','000102ff','13','70'],'XPath namespace selection and typed XML binary conversion');
  const response=await run(`Dim h As Object, d As Object
Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
h.Open "GET", "${base}/api/document.xml", False
h.send
Set d = h.responseXML
Debug.Print d.documentElement.nodeName, d.selectSingleNode("//title").text
d.save "/document.xml"
Set d = CreateObject("MSXML2.DOMDocument.6.0")
d.async = False
Debug.Print d.load("/document.xml")
Debug.Print d.selectSingleNode("//title").text
h.Open "POST", "${base}/api/echo", False
h.send d
Debug.Print h.responseText = d.xml`,{fs});
  equal(response.output,['news XML story','True','XML story','True'],'responseXML, virtual-file DOM persistence and XML POST body');
  const denied=await run(`Dim h As Object
Set h = CreateObject("WinHttp.WinHttpRequest.5.1")
h.Open "GET", "${base}/api/text", False
On Error Resume Next
h.send
Debug.Print Err.Number`,{dataHttpAuthorize:()=>false});
  equal(denied.output,['70'],'trusted VM host policy applies to COM requests');
  const active=new api.CommonAutomation.HttpTransport(),h=new api.CommonAutomation.HttpRequest({transport:active});
  try{await h.open('GET',base+'/api/slow',true);h.send();const pending=h.pending;active.close();let number;try{await pending;}catch(e){number=e.number;}equal(number,-2147467260,'closing shared transport cancels in-flight HTTP');}finally{h.dispose();active.close();}
  return checks;
}
