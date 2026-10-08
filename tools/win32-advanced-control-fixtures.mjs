/** Real-Windows acceptance programs for the next AOT control increment.
 * These fixtures compile on any host; only the Windows driver can claim native
 * execution. Dialog-state checks deliberately avoid opening interactive UI.
 */
import {nativeTestBitmap,nativeTestIcon,nativeDataUri} from '../tests/support/native-picture-fixtures.mjs';
const icon=nativeDataUri(nativeTestIcon(),'image/x-icon');
const bitmap=nativeDataUri(nativeTestBitmap());
export function advancedNativeControlFixtures(fixture){
 return [selectionFormats(fixture),pictureResources(fixture),imageCollections(fixture),dialogState(fixture)];
}
function selectionFormats(fixture){
 const {control,add,check,finish}=fixture('AotControlSelectionFormats');
 control('RichTextBox','Rich',{Text:'Alpha beta',MultiLine:-1});
 add('Dim n As Long, value As String\nRich.SelStart=0\nRich.SelLength=10\nRich.SelBold=False\nRich.SelItalic=False\nRich.SelUnderline=False\nRich.SelStrikethru=False');
 check('Not Rich.SelBold And Not Rich.SelItalic And Not Rich.SelUnderline And Not Rich.SelStrikethru','uniform unstyled selection exposes native character-format masks');
 add('Rich.SelBold=True\nRich.SelItalic=True\nRich.SelUnderline=True\nRich.SelStrikethru=True');
 check('Rich.SelBold And Rich.SelItalic And Rich.SelUnderline And Rich.SelStrikethru','native emphasis effects round-trip without replacing each other');
 add('Rich.SelItalic=False');check('Rich.SelBold And Not Rich.SelItalic And Rich.SelUnderline And Rich.SelStrikethru','clearing one character effect preserves all other effects');
 add('Rich.SelFontName="Arial"\nRich.SelFontSize=12.75');
 check('Rich.SelFontName="Arial" And Rich.SelFontSize=12.75','face and fractional point size use actual CHARFORMAT2W fields');
 add('Rich.SelColor=&H332211\nRich.SelBackColor=&H665544');
 check('Rich.SelColor=&H332211 And Rich.SelBackColor=&H665544','foreground and background native RGB fields remain independent');
 add('Rich.SelAlignment=2\nRich.SelIndent=240\nRich.SelRightIndent=360\nRich.SelHangingIndent=120');
 check('Rich.SelAlignment=2 And Rich.SelIndent=240 And Rich.SelRightIndent=360 And Rich.SelHangingIndent=120','native paragraph alignment and twip indentation round-trip');
 add('Rich.SelStart=0\nRich.SelLength=5\nRich.SelBold=False\nRich.SelStart=0\nRich.SelLength=10\nOn Error Resume Next\nErr.Clear\nn=Rich.SelBold');
 check('Err.Number=94','heterogeneous character masks report invalid Null use in the scalar AOT ABI');
 add('Err.Clear\nRich.SelAlignment=7');check('Err.Number=380 And Rich.SelAlignment=2','invalid alignment preserves the native paragraph');
 add('Err.Clear\nRich.SelFontName=String$(32,"x")');check('Err.Number=380 And Rich.SelFontName="Arial"','overlong font face fails before changing the native selection');
 add('Err.Clear\nOn Error GoTo 0');
 return finish();
}
function pictureResources(fixture){
 const {form,control,add,check,finish}=fixture('AotControlPictureResources');
 form.form.properties.Icon=icon;
 control('Image','Preview',{Picture:bitmap,Stretch:-1,BackColor:0});
 control('PictureBox','Copy',{Picture:bitmap});
 add('Dim h As Long, n As Long, info As BITMAPINFO, dc As Long, surface As Long, previous As Long, item As DRAWITEM, i As Long, baseline As Long');
 check('Me.Icon.Type=3 And Me.Icon.Handle<>0','authored ICO becomes an owned native HICON');
 check('SendValue(Me.hWnd,&H7F,1,0)=Me.Icon.Handle','WM_GETICON returns the installed large application icon');
 check('FindResourceW(0,1,14)<>0 And FindResourceW(0,1,3)<>0','the executable has linked GROUP_ICON and ICON resources');
 add('h=Preview.Picture.Handle\nn=GetObjectW(h,24,info)');
 check('Preview.Picture.Type=1 And n=24 And info.width=2 And info.height=2','embedded bitmap decodes into a real two-by-two HBITMAP');
 add('Set Copy.Picture=Preview.Picture\nSet Preview.Picture=Nothing');
 check('Copy.Picture.Handle=h','copying Picture retains the same owned decoded image after source clearing');
 add('With Copy.Picture\n Set Copy.Picture=Nothing\n n=.Handle\nEnd With');
 check('n=h','With picture remains alive until the block exits');
 // Explicit check index remains owned by the factory rather than an ad hoc exit.
 check('GetObjectW(h,24,info)=0','last picture reference releases the cached GDI bitmap');
 add(`Set Preview.Picture=LoadPicture("${bitmap}")\ndc=CreateCompatibleDC(0)\nsurface=CreateBitmap(32,32,1,32,0)\nprevious=SelectObject(dc,surface)`);
 check('dc<>0 And surface<>0 And previous<>0','offscreen destination for native picture painting exists');
 add('item.kind=5\nitem.id=GetDlgCtrlID(Preview.hWnd)\nitem.action=1\nitem.hwnd=Preview.hWnd\nitem.dc=dc\nitem.right=32\nitem.bottom=32\nn=SendRecord(Me.hWnd,&H2B,item.id,item)');
 check('GetPixel(dc,16,16)=&HFF','stretched Image renders decoded red pixels through native GDI+');
 add('baseline=GetGuiResources(GetCurrentProcess(),0)');
 add(`For i=1 To 100\n Set Copy.Picture=LoadPicture("${bitmap}")\n h=Copy.Picture.Handle\n Set Copy.Picture=Nothing\nNext`);
 check('GetGuiResources(GetCurrentProcess(),0)<=baseline+1','repeated image replacement releases cached native bitmaps');
 add('n=SelectObject(dc,previous)\nn=DeleteObject(surface)\nn=DeleteDC(dc)');
 return finish(`Private Type BITMAPINFO
 kind As Long
 width As Long
 height As Long
 stride As Long
 planes As Integer
 bits As Integer
 data As Long
End Type
Private Type DRAWITEM
 kind As Long
 id As Long
 item As Long
 action As Long
 state As Long
 hwnd As Long
 dc As Long
 left As Long
 top As Long
 right As Long
 bottom As Long
 data As Long
End Type
Private Declare Function FindResourceW Lib "kernel32" (ByVal instance As Long, ByVal name As Long, ByVal kind As Long) As Long
Private Declare Function GetObjectW Lib "gdi32" (ByVal handle As Long,ByVal size As Long,info As Any) As Long
Private Declare Function CreateCompatibleDC Lib "gdi32" (ByVal dc As Long) As Long
Private Declare Function CreateBitmap Lib "gdi32" (ByVal width As Long,ByVal height As Long,ByVal planes As Long,ByVal bits As Long,ByVal data As Long) As Long
Private Declare Function SelectObject Lib "gdi32" (ByVal dc As Long,ByVal handle As Long) As Long
Private Declare Function DeleteObject Lib "gdi32" (ByVal handle As Long) As Long
Private Declare Function DeleteDC Lib "gdi32" (ByVal handle As Long) As Long
Private Declare Function GetPixel Lib "gdi32" (ByVal dc As Long,ByVal x As Long,ByVal y As Long) As Long
Private Declare Function GetCurrentProcess Lib "kernel32" () As Long
Private Declare Function GetGuiResources Lib "user32" (ByVal process As Long,ByVal flags As Long) As Long`);
}
function imageCollections(fixture){
 const {control,add,check,finish}=fixture('AotControlImageCollections');
 control('ImageList','Icons',{ImageWidth:16,ImageHeight:16,ListImages:[{Key:'one',Tag:'seed',Picture:icon},{Key:'two',Picture:icon}]});
 control('Image','Preview');
 control('TreeView','Tree',{ImageList:'Icons',Nodes:[{Key:'node',Text:'Node',Image:'one'}]});
 control('ListView','Rows',{Icons:'Icons',Items:[{Text:'Row',Icon:'two'}]});
 control('Toolbar','Tools',{ImageList:'Icons',Buttons:[{Caption:'Open',Image:'one'}]});
 control('TabStrip','Tabs',{ImageList:'Icons',Tabs:[{Caption:'First',Image:'two'}]});
 add('Dim n As Long, h As Long, width As Long, height As Long');
 check('Icons.ListImages.Count=2 And ImageList_GetImageCount(Icons.hImageList)=2','saved ListImages populate the actual HIMAGELIST');
 add('n=ImageList_GetIconSize(Icons.hImageList,width,height)');check('n<>0 And width=16 And height=16','native image-list dimensions match authored size');
 check('SendValue(Tree.hWnd,&H1108,0,0)=Icons.hImageList And SendValue(Rows.hWnd,&H1002,0,0)=Icons.hImageList','tree and list-view borrow the native image-list handle');
 check('SendValue(Tools.hWnd,&H431,0,0)=Icons.hImageList And SendValue(Tabs.hWnd,&H1302,0,0)=Icons.hImageList','toolbar and tab control use the saved native image binding');
 check('Icons.ListImages("ONE").Index=1 And Icons.ListImages(2).Key="two"','item lookups preserve one-based identity and case-insensitive keys');
 add(`Icons.ListImages.Add 2,"middle",LoadPicture("${icon}")`);
 check('Icons.ListImages.Count=3 And Icons.ListImages("middle").Index=2 And Icons.ListImages("two").Index=3','ordered native image insertion updates item indices');
 add('Icons.ListImages(2).Key="renamed"\nIcons.ListImages(2).Tag="a" & ChrW$(0) & "b"');check('Icons.ListImages("renamed").Index=2 And Len(Icons.ListImages(2).Tag)=3','item key and counted Tag mutation retain native collection identity');
 add('On Error Resume Next\nErr.Clear\nIcons.ListImages(2).Key="ONE"');check('Err.Number=35602 And Icons.ListImages(2).Key="renamed"','duplicate key assignment is rejected without changing metadata');
 add('Err.Clear\nOn Error GoTo 0\nSet Preview.Picture=Icons.ListImages("renamed").Picture\nh=Preview.Picture.Handle');
 add('With Icons.ListImages(NextIndex())\n Icons.ListImages.Clear\n .Tag="detached"\n n=.Index\nEnd With');
 check('calls=1 And n=0 And Icons.ListImages.Count=0 And ImageList_GetImageCount(Icons.hImageList)=0','With item receiver is captured once and remains valid across collection Clear');
 check('Preview.Picture.Handle=h And Preview.Picture.Type=3','Picture copied out of an image list survives removal of all nodes');
 add('Icons.ImageWidth=24\nIcons.ImageHeight=24\nn=ImageList_GetIconSize(Icons.hImageList,width,height)');check('n<>0 And width=24 And height=24','empty native image list can change its image dimensions');
 add(`Icons.ListImages.Add , ,LoadPicture("${icon}")`);check('Icons.ListImages.Count=1 And ImageList_GetImageCount(Icons.hImageList)=1','omitted optional Add arguments append an unkeyed picture');
 add('Set Tree.ImageList=Nothing');check('SendValue(Tree.hWnd,&H1108,0,0)=0 And ImageList_GetImageCount(Icons.hImageList)=1','detaching a borrower does not destroy the owned image list');
 add('Icons.ListImages.Clear\nSet Preview.Picture=Nothing');
 return finish(`Private calls As Long
Private Declare Function ImageList_GetImageCount Lib "comctl32" (ByVal images As Long) As Long
Private Declare Function ImageList_GetIconSize Lib "comctl32" (ByVal images As Long,width As Long,height As Long) As Long`,
`Private Function NextIndex() As Long
 calls=calls+1
 NextIndex=2
End Function`);
}
function dialogState(fixture){
 const {control,add,check,finish}=fixture('AotControlDialogState');
 control('CommonDialog','Dialog',{FontSize:8.25,FileName:'original.txt',Filter:'Text|*.txt',FontName:'Arial'});
 add('Dim value As Double');
 check('Dialog.FontSize=8.25 And Dialog.FileName="original.txt" And Dialog.hDC=0','nonvisual dialog retains exact initial font size and filename');
 add('Dialog.FontSize=12.75\nDialog.Color=&H332211\nDialog.FontBold=True\nDialog.FontItalic=True');
 check('Dialog.FontSize=12.75 And Dialog.Color=&H332211 And Dialog.FontBold And Dialog.FontItalic','dialog scalar properties preserve authored values without opening UI');
 add('Dialog.Filter="Broken"\nOn Error Resume Next\nErr.Clear\nDialog.ShowOpen');
 check('Err.Number=380 And Dialog.FileName="original.txt"','invalid filter fails before opening a dialog and preserves accepted state');
 add('Err.Clear\nDialog.Filter="Text|*.txt"\nDialog.Flags=8\nDialog.ShowFont');
 check('Err.Number=380 And Dialog.FontSize=12.75 And Dialog.FontName="Arial"','unsupported native font hook flags fail without mutation');
 add('Err.Clear\nDialog.Flags=&H40\nDialog.ShowPrinter');
 check('Err.Number=380 And Dialog.hDC=0','unsupported printer setup flags fail before COM allocation or interactive UI');
 add('Err.Clear\nDialog.Flags=0\nDialog.FontSize=0');
 check('Err.Number=380 And Dialog.FontSize=12.75','invalid point size preserves the last exact Double');
 add('Err.Clear\nDialog.MaxFileSize=1');
 check('Err.Number=380','undersized filename buffer is rejected before any dialog call');
 add('Err.Clear\nOn Error GoTo 0');return finish();
}
