// Native AppKit widgets and the VB property/event boundary. MIT.
#include "appkit.hpp"
#include <cfloat>

namespace vb6 {
NSString* ns(const Text& value) {
  return [[NSString alloc] initWithCharacters:reinterpret_cast<const unichar*>(value.data()) length:value.size()];
}
Text text(NSString* value) {
  if(!value)return {};Text result([value length],u'\0');
  if(!result.empty())[value getCharacters:reinterpret_cast<unichar*>(result.data()) range:NSMakeRange(0,result.size())];
  return result;
}
NSColor* color(int64_t value) {
  const auto n=static_cast<uint32_t>(value);
  if(n&0x80000000u){
    switch(n&255u){
      case 0:return NSColor.scrollBarColor;case 1:return NSColor.windowBackgroundColor;
      case 2:case 9:return NSColor.windowFrameTextColor;case 3:return NSColor.disabledControlTextColor;
      case 4:return NSColor.controlBackgroundColor;case 5:return NSColor.textBackgroundColor;
      case 6:case 18:return NSColor.windowFrameColor;case 7:return NSColor.labelColor;
      case 8:return NSColor.textColor;case 10:case 11:case 12:return NSColor.separatorColor;
      case 13:return NSColor.selectedContentBackgroundColor;case 14:return NSColor.selectedTextColor;
      case 15:return NSColor.controlColor;case 16:return NSColor.shadowColor;case 17:return NSColor.disabledControlTextColor;
      case 20:return NSColor.highlightColor;case 21:return NSColor.darkGrayColor;
      case 22:return NSColor.lightGrayColor;case 23:return NSColor.textColor;case 24:return NSColor.controlBackgroundColor;
      default:return NSColor.controlColor;
    }
  }
  return [NSColor colorWithSRGBRed:(n&255)/255.0 green:((n>>8)&255)/255.0 blue:((n>>16)&255)/255.0 alpha:1];
}
int32_t colorValue(NSColor* value){
  NSColor*c=[value colorUsingColorSpace:NSColorSpace.sRGBColorSpace];if(!c)return 0;
  auto channel=[](CGFloat n){return uint32_t(std::lround(std::clamp(double(n),0.0,1.0)*255));};
  return int32_t(channel(c.redComponent)|(channel(c.greenComponent)<<8)|(channel(c.blueComponent)<<16));
}
Text captionText(const Text& value){Text out;for(size_t i=0;i<value.size();i++){if(value[i]==u'&'){if(i+1<value.size()&&value[i+1]==u'&')++i;else continue;}out.push_back(value[i]);}return out;}
Value MacImage::get(Runtime&,const std::string&raw){auto n=lower(raw);if(n=="handle")return Value::integer(handle);if(n=="type")return Value::integer(image?1:0,Type::Integer);if(n=="width")return Value::integer(image?bankers(image.size.width*2540.0/96.0):0);if(n=="height")return Value::integer(image?bankers(image.size.height*2540.0/96.0):0);fail(438);}
Value MacControl::property(const std::string& name,Value fallback)const{auto it=properties.find(lower(name));return it==properties.end()?fallback:it->second;}
double MacControl::number(const std::string&name,double fallback)const{return property(name,Value::real(fallback)).floating();}
bool MacControl::flag(const std::string&name,bool fallback)const{return property(name,Value::boolean(fallback)).truth();}
std::shared_ptr<MacControl> MacControl::self(){return std::static_pointer_cast<MacControl>(shared_from_this());}
std::shared_ptr<MacForm> MacControl::form()const{auto object=owner.lock();if(!object)fail(91);return host->form(object);}
NSView* MacControl::container()const{if([widget isKindOfClass:NSBox.class])return [(NSBox*)widget contentView];if([widget isKindOfClass:NSTabView.class])return [(NSTabView*)widget selectedTabViewItem].view;return widget?:view;}
double MacControl::unit(int mode,bool horizontal)const{
  if(mode<0)mode=int(number("scalemode",1));
  switch(mode){case 1:return 1.0/15;case 2:return 96.0/72;case 3:return 1;case 4:return horizontal?8:16;case 5:return 96;case 6:return 96.0/25.4;case 7:return 96.0/2.54;case 0:{double size=horizontal?view.bounds.size.width:view.bounds.size.height,span=number(horizontal?"scalewidth":"scaleheight",size);if(span==0)fail(5);return size/span;}default:fail(380,"Unsupported ScaleMode");}
}
NSPoint MacControl::point(double x,double y)const{return NSMakePoint((x-number("scaleleft",0))*unit(-1,true),(y-number("scaletop",0))*unit(-1,false));}
std::string MacControl::defaultMember()const{
  const auto&t=spec.type;if(t=="TextBox"||t=="RichTextBox"||t=="ComboBox"||t=="ListBox")return "text";
  if(t=="Label"||t=="Frame"||t=="CommandButton"||t=="Form"||t=="MDIForm")return "caption";
  if(t=="FileListBox")return "filename";if(t=="DirListBox")return "path";if(t=="DriveListBox")return "drive";
  return "value";
}
void MacControl::applyFrame(){
  if(!view)return;double x=number("left",0)/15,y=number("top",0)/15,w=number("width",1800)/15,h=number("height",450)/15;
  if(!std::isfinite(x)||!std::isfinite(y)||!std::isfinite(w)||!std::isfinite(h)||w<0||h<0||std::max({std::abs(x),std::abs(y),w,h})>20000)fail(380,"Control geometry exceeds native limits");
  if(spec.type=="Form"||spec.type=="MDIForm")return;
  view.frame=NSMakeRect(x,y,w,h);
  if(widget!=view&&![view isKindOfClass:NSScrollView.class])widget.frame=view.bounds;
}
void MacControl::applyFont(){
  const auto name=property("fontname",Value::string(u"Helvetica")).string();double size=number("fontsize",8.25)*4.0/3.0;
  if(!std::isfinite(size)||size<1||size>4096)fail(380,"Invalid font size");
  NSFont*font=[NSFont fontWithName:ns(name) size:size]?:[NSFont systemFontOfSize:size];
  NSFontTraitMask traits=0;if(flag("fontbold"))traits|=NSBoldFontMask;if(flag("fontitalic"))traits|=NSItalicFontMask;
  if(traits)font=[NSFontManager.sharedFontManager convertFont:font toHaveTrait:traits];
  if([widget respondsToSelector:@selector(setFont:)])[(id)widget setFont:font];
  if([widget isKindOfClass:NSTableView.class]){auto table=(NSTableView*)widget;for(NSTableColumn*c in table.tableColumns)c.dataCell.font=font;table.rowHeight=std::max(16.0,std::ceil(font.ascender-font.descender+5));}
}
static NSTextView* textView(MacControl&c){return [c.widget isKindOfClass:NSTextView.class]?(NSTextView*)c.widget:nil;}
static NSTextField* textField(MacControl&c){return [c.widget isKindOfClass:NSTextField.class]?(NSTextField*)c.widget:nil;}
static NSTableView* tableView(MacControl&c){return [c.widget isKindOfClass:NSTableView.class]?(NSTableView*)c.widget:nil;}
static void rangeCheck(int64_t index,size_t size){if(index<0||uint64_t(index)>=size)fail(381,"Invalid property array index");}
void MacControl::initialize(){
  if(initialized)return;initialized=true;for(auto&p:spec.properties)properties[lower(p.name)]=p.value;
  properties["name"]=Value::string(fromUTF8(spec.name));if(spec.index>=0)properties["index"]=Value::integer(spec.index,Type::Integer);
  delegate=[VB6ControlDelegate new];delegate->model=self();
  const std::string&t=spec.type;
  if(t=="Menu"){
    auto caption=captionText(property("caption",Value::string(fromUTF8(spec.name))).string());
    menu=caption==u"-"?[NSMenuItem separatorItem]:[[NSMenuItem alloc] initWithTitle:ns(caption) action:@selector(action:) keyEquivalent:@""];
    menu.target=delegate;menu.enabled=flag("enabled",true);menu.hidden=!flag("visible",true);menu.state=flag("checked")?NSControlStateValueOn:NSControlStateValueOff;
    handle=host->handles.add(self(),HandleKind::Menu);return;
  }
  if(t=="Timer"||t=="CommonDialog"||t=="ImageList"){handle=host->handles.add(self(),HandleKind::Control);if(t=="Timer")timerChanged();if(t=="ImageList")items("listimages");return;}
  if(t=="CommandButton"||t=="CheckBox"||t=="OptionButton"){
    NSButton*b=[[NSButton alloc]initWithFrame:NSZeroRect];[b setButtonType:t=="CheckBox"?NSButtonTypeSwitch:t=="OptionButton"?NSButtonTypeRadio:NSButtonTypeMomentaryPushIn];
    b.bezelStyle=NSBezelStyleRounded;b.target=delegate;b.action=@selector(action:);b.allowsMixedState=t=="CheckBox";widget=b;view=b;
    if(flag("default"))b.keyEquivalent=@"\r";else if(flag("cancel"))b.keyEquivalent=@"\033";
  }else if(t=="Label"||t=="TextBox"&&!flag("multiline")){
    NSTextField*f=t=="TextBox"&&!property("passwordchar",Value::string(u"")).string().empty()?[NSSecureTextField new]:[NSTextField new];
    f.editable=t!="Label"&&!flag("locked");f.selectable=t!="Label";f.bezeled=t!="Label";f.drawsBackground=t!="Label"||flag("backstyle");f.delegate=delegate;f.target=delegate;f.action=@selector(action:);widget=f;view=f;
  }else if(t=="TextBox"||t=="RichTextBox"){
    auto scroll=[NSScrollView new];auto editor=[[NSTextView alloc]initWithFrame:NSMakeRect(0,0,120,80)];editor.delegate=delegate;editor.richText=t=="RichTextBox";editor.importsGraphics=t=="RichTextBox";editor.editable=!flag("locked");editor.verticallyResizable=YES;editor.horizontallyResizable=(int(number("scrollbars",3))&1)!=0;
    editor.autoresizingMask=NSViewWidthSizable;editor.textContainer.widthTracksTextView=YES;scroll.documentView=editor;scroll.hasVerticalScroller=(int(number("scrollbars",3))&2)!=0;scroll.hasHorizontalScroller=(int(number("scrollbars",3))&1)!=0;scroll.borderType=NSBezelBorder;widget=editor;view=scroll;
  }else if(t=="ComboBox"||t=="DriveListBox"){
    auto combo=[NSComboBox new];combo.editable=number("style",0)!=2;combo.delegate=delegate;combo.target=delegate;combo.action=@selector(action:);widget=combo;view=combo;
  }else if(t=="Frame"){
    auto box=[NSBox new];box.boxType=NSBoxPrimary;box.contentView=[VB6Canvas new];widget=box;view=box;
  }else if(t=="Image"){
    auto image=[NSImageView new];image.imageScaling=flag("stretch",true)?NSImageScaleAxesIndependently:NSImageScaleNone;widget=image;view=image;
  }else if(t=="ListBox"||t=="ListView"||t=="FileListBox"||t=="DirListBox"||t=="TreeView"||t=="MSFlexGrid"||t=="MSHFlexGrid"||t=="DataGrid"){
    auto scroll=[NSScrollView new];NSTableView*table;
    if(t=="TreeView"){
      auto outline=[NSOutlineView new];outlineDelegate=[VB6OutlineDelegate new];outlineDelegate->model=self();outline.delegate=outlineDelegate;outline.dataSource=outlineDelegate;table=outline;items("nodes");
    }else{table=[NSTableView new];tableDelegate=[VB6TableDelegate new];tableDelegate->model=self();table.delegate=tableDelegate;table.dataSource=tableDelegate;}
    table.target=delegate;table.action=@selector(action:);table.doubleAction=@selector(doubleAction:);table.allowsMultipleSelection=flag("multiselect");
    table.gridStyleMask=flag("gridlines")?NSTableViewSolidHorizontalGridLineMask|NSTableViewSolidVerticalGridLineMask:0;
    if(t=="ListView"){items("listitems");items("columnheaders");}
    if(t=="MSFlexGrid"||t=="MSHFlexGrid"||t=="DataGrid")resizeGrid(size_t(number("rows",5)),size_t(number("cols",3)));
    widget=table;view=scroll;scroll.documentView=table;scroll.hasVerticalScroller=YES;scroll.hasHorizontalScroller=YES;scroll.borderType=NSBezelBorder;updateColumns();
  }else if(t=="HScrollBar"||t=="VScrollBar"||t=="Slider"){
    auto slider=[NSSlider new];slider.target=delegate;slider.action=@selector(action:);slider.continuous=YES;widget=slider;view=slider;
  }else if(t=="UpDown"){
    auto stepper=[NSStepper new];stepper.target=delegate;stepper.action=@selector(action:);stepper.valueWraps=flag("wrap");stepper.increment=number("increment",1);widget=stepper;view=stepper;
  }else if(t=="ProgressBar"){
    auto progress=[NSProgressIndicator new];progress.indeterminate=NO;progress.style=NSProgressIndicatorStyleBar;widget=progress;view=progress;
  }else if(t=="DTPicker"||t=="MonthView"){
    auto picker=[NSDatePicker new];picker.datePickerStyle=t=="MonthView"?NSDatePickerStyleClockAndCalendar:NSDatePickerStyleTextFieldAndStepper;picker.datePickerElements=int(number("format",0))==2?NSHourMinuteSecondDatePickerElementFlag:NSYearMonthDayDatePickerElementFlag;picker.target=delegate;picker.action=@selector(action:);widget=picker;view=picker;
  }else if(t=="TabStrip"||t=="SSTab"){
    auto tabs=[NSTabView new];tabs.delegate=delegate;widget=tabs;view=tabs;auto collection=items("tabs");int count=t=="SSTab"?int(number("tabs",3)):0;if(count<0||count>1000)fail(380);for(int i=0;i<count;i++)collection->invoke(*host->runtime,"add",{Arg(Value::missing()),Arg(Value::string(u"")),Arg(Value::string(u"Tab "+fromUTF8(std::to_string(i))))});
  }else{
    auto canvas=[VB6Canvas new];canvas->model=self();widget=canvas;view=canvas;
    if(t=="StatusBar")items("panels");if(t=="Toolbar")items("buttons");if(t=="MSChart")resizeGrid(size_t(number("rowcount",5)),size_t(number("columncount",1)));
  }
  if(auto canvas=[view isKindOfClass:VB6Canvas.class]?(VB6Canvas*)view:nil)canvas->model=self();
  view.identifier=ns(fromUTF8(spec.name));view.toolTip=ns(property("tooltiptext",Value::string(u"")).string());
  handle=host->handles.add(self(),t=="Form"||t=="MDIForm"?HandleKind::Window:HandleKind::Control);
  auto initial=property("list");if(initial.type==Type::Array)for(auto&v:initial.asArray()->values)list.push_back(v.string());itemData.resize(list.size());
  if(t=="DriveListBox"||t=="DirListBox"||t=="FileListBox")reloadFiles();
  refresh();applyFrame();applyFont();originalFrame=view.frame;
}
void MacControl::refresh(){
  if(disposed)return;if(menu){menu.title=ns(captionText(property("caption",Value::string(u"")).string()));menu.enabled=flag("enabled",true);menu.hidden=!flag("visible",true);menu.state=flag("checked")?NSControlStateValueOn:NSControlStateValueOff;return;}
  view.hidden=!flag("visible",true);if([widget respondsToSelector:@selector(setEnabled:)])[(id)widget setEnabled:flag("enabled",true)];
  Text caption=captionText(property("caption",Value::string(fromUTF8(spec.name))).string());
  if([widget isKindOfClass:NSButton.class]){auto b=(NSButton*)widget;b.title=ns(caption);int n=int(number("value",0));b.state=n==2?NSControlStateValueMixed:n?NSControlStateValueOn:NSControlStateValueOff;}
  else if([widget isKindOfClass:NSBox.class])[(NSBox*)widget setTitle:ns(caption)];
  else if(auto f=textField(*this)){
    NSString*desired=ns(spec.type=="Label"?caption:property("text",Value::string(u"")).string());if(![f.stringValue isEqualToString:desired])f.stringValue=desired;
    f.textColor=color(int64_t(number("forecolor",0)));f.backgroundColor=color(int64_t(number("backcolor",0xffffff)));f.alignment=number("alignment",0)==1?NSTextAlignmentRight:number("alignment",0)==2?NSTextAlignmentCenter:NSTextAlignmentLeft;f.editable=spec.type!="Label"&&!flag("locked");
  }else if(auto e=textView(*this)){NSString*desired=ns(property("text",Value::string(u"")).string());if(![e.string isEqualToString:desired])e.string=desired;e.textColor=color(int64_t(number("forecolor",0)));e.backgroundColor=color(int64_t(number("backcolor",0xffffff)));e.editable=!flag("locked");}
  if([widget isKindOfClass:NSSlider.class]||[widget isKindOfClass:NSStepper.class]||[widget isKindOfClass:NSProgressIndicator.class]){
    double minimum=number("min",0),maximum=number("max",100),value=number("value",minimum);if(minimum>maximum||value<minimum||value>maximum)fail(380,"Value is outside Min/Max");
    [(id)widget setMinValue:minimum];[(id)widget setMaxValue:maximum];[(id)widget setDoubleValue:value];
  }
  if([widget isKindOfClass:NSDatePicker.class]){auto date=property("value",Value::string(u"2000-01-01"));auto c=civilTime(parseDate(date));NSDateComponents*components=[NSDateComponents new];components.year=c.year;components.month=c.month;components.day=c.day;components.hour=c.hour;components.minute=c.minute;components.second=c.second;((NSDatePicker*)widget).dateValue=[[NSCalendar currentCalendar]dateFromComponents:components];}
  if(spec.type=="ComboBox"||spec.type=="ListBox"||spec.type=="DriveListBox"||spec.type=="FileListBox"||spec.type=="DirListBox")reloadList();
  view.needsDisplay=YES;
}
void MacControl::dispose(){if(disposed)return;disposed=true;[timer invalidate];timer=nil;[view removeFromSuperview];[menu.menu removeItem:menu];host->handles.remove(handle);for(auto&entry:collections)entry.second->owner.reset();if(delegate)delegate->model.reset();if(tableDelegate)tableDelegate->model.reset();if(outlineDelegate)outlineDelegate->model.reset();}
void MacControl::event(const std::string&name,Args args){
  if(disposed||eventSuppression)return;auto object=owner.lock();if(!object||!object->loaded)return;
  std::string prefix=spec.type=="Form"?"form":spec.type=="MDIForm"?"mdiform":lower(spec.name);
  if(spec.index>=0)args.insert(args.begin(),Arg(Value::integer(spec.index,Type::Integer)));
  host->runtime->dispatch(object,prefix+"_"+lower(name),std::move(args));
}
void MacControl::timerChanged(){
  [timer invalidate];timer=nil;double interval=number("interval",0);if(interval<0||interval>65535||std::floor(interval)!=interval)fail(380,"Timer Interval must be 0..65535 milliseconds");
  if(!flag("enabled",true)||interval==0||disposed)return;std::weak_ptr<MacControl> weak=self();
  timer=[NSTimer timerWithTimeInterval:interval/1000 repeats:YES block:^(NSTimer*){if(auto c=weak.lock())if(!c->eventActive&&!c->disposed){c->host->event([c]{c->eventActive=true;try{c->event("timer");c->eventActive=false;}catch(...){c->eventActive=false;throw;}});}}];
  [NSRunLoop.mainRunLoop addTimer:timer forMode:NSRunLoopCommonModes];
}
void MacControl::changed(const std::string& name){
  if(name=="text"){
    Text value=textView(*this)?text(textView(*this).string):textField(*this)?text(textField(*this).stringValue):Text();
    auto limit=number("maxlength",0);if(limit<0||limit>INT32_MAX)fail(380);if(limit&&value.size()>size_t(limit)){value.resize(size_t(limit));if(auto e=textView(*this))e.string=ns(value);else if(auto f=textField(*this))f.stringValue=ns(value);}
    if(value==property("text",Value::string(u"")).string())return;properties["text"]=Value::string(value);event("change");return;
  }
  if(name=="value"){
    if([widget isKindOfClass:NSButton.class]){
      auto b=(NSButton*)widget;int value=b.state==NSControlStateValueMixed?2:b.state==NSControlStateValueOn?1:0;
      if(spec.type=="OptionButton"){value=1;if(auto object=owner.lock())for(auto&entry:object->controls)if(auto peer=std::dynamic_pointer_cast<MacControl>(entry.second))if(peer.get()!=this&&peer->spec.type=="OptionButton"&&peer->spec.parent==spec.parent){peer->properties["value"]=Value::integer(0,Type::Integer);((NSButton*)peer->widget).state=NSControlStateValueOff;}}
      properties["value"]=Value::integer(value,Type::Integer);
    }else if([widget isKindOfClass:NSDatePicker.class]){auto c=[[NSCalendar currentCalendar]components:NSCalendarUnitYear|NSCalendarUnitMonth|NSCalendarUnitDay|NSCalendarUnitHour|NSCalendarUnitMinute|NSCalendarUnitSecond fromDate:((NSDatePicker*)widget).dateValue];properties["value"]=civilDate({int(c.year),int(c.month),int(c.day),int(c.hour),int(c.minute),int(c.second)});}
    else if([widget respondsToSelector:@selector(doubleValue)])properties["value"]=Value::integer(bankers([(id)widget doubleValue]));
    event(spec.type=="CheckBox"||spec.type=="OptionButton"?"click":"change");return;
  }
  event(name);
}
Value MacControl::get(Runtime&rt,const std::string&raw){
  if(disposed)fail(91,"Control has been unloaded");auto name=lower(raw.empty()?defaultMember():raw);
  if(name=="hwnd"||name=="handle")return Value::integer(handle);
  if(name=="font")return createNativeFont(self());
  if(name=="container"||name=="parent"){auto f=owner.lock();if(!f)fail(91);if(spec.parent.empty())return Value::object(f);return f->get(rt,spec.parent);}
  if(name=="controls"){auto f=owner.lock();if(!f)fail(91);return host->formGet(f,"controls");}
  if(name=="visible")return Value::boolean(menu?!menu.hidden:!view.hidden);
  if(name=="text"){
    if(auto e=textView(*this))return Value::string(text(e.string));if(auto f=textField(*this))return Value::string(text(f.stringValue));
    if(auto t=tableView(*this);t&&grid.empty()){NSInteger index=t.selectedRow;return Value::string(index>=0&&size_t(index)<list.size()?list[size_t(index)]:Text());}
  }
  if(name=="selstart"||name=="sellength"||name=="seltext"){
    NSRange range=NSMakeRange(0,0);Text value=get(rt,"text").string();if(auto e=textView(*this))range=e.selectedRange;else if(auto f=textField(*this)){auto editor=(NSTextView*)[f currentEditor];if(editor)range=editor.selectedRange;else range=NSMakeRange(size_t(number("selstart",0)),size_t(number("sellength",0)));}
    range.location=std::min(range.location,value.size());range.length=std::min(range.length,value.size()-range.location);
    return name=="selstart"?Value::integer(range.location):name=="sellength"?Value::integer(range.length):Value::string(value.substr(range.location,range.length));
  }
  if(name=="textrtf"&&spec.type=="RichTextBox"){NSData*data=[textView(*this)RTFFromRange:NSMakeRange(0,textView(*this).string.length)];return Value::string(fromUTF8(std::string(static_cast<const char*>(data.bytes),data.length)));}
  if(name=="listcount")return Value::integer(list.size());
  if(name=="listindex"){if([widget isKindOfClass:NSComboBox.class])return Value::integer([(NSComboBox*)widget indexOfSelectedItem]);if(auto t=tableView(*this))return Value::integer(t.selectedRow);return property(name,Value::integer(-1));}
  if(name=="selcount")return Value::integer(selected.size());
  if(name=="filename"&&spec.type=="FileListBox"){auto i=get(rt,"listindex").integral();return Value::string(i>=0&&size_t(i)<list.size()?list[size_t(i)]:Text());}
  if(name=="value"&&[widget isKindOfClass:NSDatePicker.class]){auto c=[[NSCalendar currentCalendar]components:NSCalendarUnitYear|NSCalendarUnitMonth|NSCalendarUnitDay|NSCalendarUnitHour|NSCalendarUnitMinute|NSCalendarUnitSecond fromDate:((NSDatePicker*)widget).dateValue];return civilDate({int(c.year),int(c.month),int(c.day),int(c.hour),int(c.minute),int(c.second)});}
  if(name=="nodes"||name=="listitems"||name=="columnheaders"||name=="panels"||name=="buttons"||name=="tabs"&&spec.type!="SSTab"||name=="listimages")return Value::object(items(name));
  if(name=="selecteditem"){
    if(spec.type=="TreeView"){id token=[(NSOutlineView*)widget itemAtRow:((NSOutlineView*)widget).selectedRow];return Value::object([token isKindOfClass:VB6OutlineToken.class]?((VB6OutlineToken*)token)->item:nullptr);}
    if(spec.type=="ListView"){auto i=((NSTableView*)widget).selectedRow;auto collection=items("listitems");return Value::object(i>=0&&size_t(i)<collection->items.size()?collection->items[size_t(i)]:nullptr);}
    if(spec.type=="TabStrip"){auto i=[(NSTabView*)widget indexOfTabViewItem:((NSTabView*)widget).selectedTabViewItem];auto collection=items("tabs");return Value::object(i>=0&&size_t(i)<collection->items.size()?collection->items[size_t(i)]:nullptr);}
  }
  if(name=="row"||name=="col"||name=="rows"||name=="cols"||name=="rowcount"||name=="columncount")return name=="rows"||name=="rowcount"?Value::integer(grid.size()):name=="cols"||name=="columncount"?Value::integer(grid.empty()?0:grid[0].size()):property(name,Value::integer(0));
  if(name=="text"&&!grid.empty()){auto r=size_t(number("row",0)),c=size_t(number("col",0));if(r>=grid.size()||c>=grid[r].size())fail(381);return Value::string(grid[r][c]);}
  if(name=="currentx")return Value::real(currentX,Type::Single);if(name=="currenty")return Value::real(currentY,Type::Single);
  if(name=="scalewidth")return property(name,Value::real(view.bounds.size.width/unit(-1,true),Type::Single));if(name=="scaleheight")return property(name,Value::real(view.bounds.size.height/unit(-1,false),Type::Single));
  if(name=="picture"||name=="image")return property(name,Value::object(nullptr));
  if(name=="hDC"||name=="hdc")return invoke(rt,"getdc",{});
  auto it=properties.find(name);if(it!=properties.end())return it->second;
  if(name=="enabled")return Value::boolean(true);if(name=="tag")return Value::string(u"");if(name=="tabindex")return Value::integer(0,Type::Integer);
  fail(438,"Unsupported native property "+spec.type+"."+raw);
}
void MacControl::set(Runtime&rt,const std::string&raw,Value value,bool){
  if(disposed)fail(91);auto name=lower(raw.empty()?defaultMember():raw);
  if(name=="name"||name=="index"||name=="hwnd"||name=="handle"||name=="listcount")fail(383,"Property is read-only");
  if(name=="font"){auto font=value.asObject();for(const auto&entry:std::map<std::string,std::string>{{"name","fontname"},{"size","fontsize"},{"bold","fontbold"},{"italic","fontitalic"},{"underline","fontunderline"},{"strikethrough","fontstrikethru"}})set(rt,entry.second,font->get(rt,entry.first));return;}
  if(name=="listindex"){
    auto i=value.integral();if(i< -1||i>=int64_t(list.size()))fail(380);properties[name]=Value::integer(i);selected.clear();if(i>=0)selected.insert(size_t(i));
    if([widget isKindOfClass:NSComboBox.class]){auto combo=(NSComboBox*)widget;if(i>=0)[combo selectItemAtIndex:i];else if(combo.indexOfSelectedItem>=0)[combo deselectItemAtIndex:combo.indexOfSelectedItem];}
    else if(auto table=tableView(*this)){[table selectRowIndexes:i<0?NSIndexSet.indexSet:[NSIndexSet indexSetWithIndex:size_t(i)] byExtendingSelection:NO];}
    event("click");return;
  }
  if(name=="selstart"||name=="sellength"||name=="seltext"){
    Text current=get(rt,"text").string();size_t start=size_t(get(rt,"selstart").integral()),length=size_t(get(rt,"sellength").integral());
    if(name=="seltext"){auto replacement=value.string();current.replace(start,length,replacement);set(rt,"text",Value::string(current));length=replacement.size();}
    else{auto n=value.integral();if(n<0||uint64_t(n)>current.size())fail(380);if(name=="selstart"){start=size_t(n);length=0;}else length=std::min(size_t(n),current.size()-start);}
    properties["selstart"]=Value::integer(start);properties["sellength"]=Value::integer(length);NSRange selection=NSMakeRange(start,length);
    if(auto e=textView(*this))e.selectedRange=selection;else if(auto f=textField(*this)){if([f currentEditor])[(NSTextView*)[f currentEditor]setSelectedRange:selection];}return;
  }
  if(name=="textrtf"&&spec.type=="RichTextBox"){auto source=toUTF8(value.string());NSData*data=[NSData dataWithBytes:source.data() length:source.size()];NSAttributedString*rich=[[NSAttributedString alloc]initWithRTF:data documentAttributes:nullptr];if(!rich)fail(380,"Invalid RTF");[textView(*this).textStorage setAttributedString:rich];changed("text");return;}
  if(name=="selecteditem"){
    auto item=std::dynamic_pointer_cast<MacItem>(value.asObject());if(!item)fail(13);if(spec.type=="TreeView"){id token=outlineTokens[item->identity];if(!token){[(NSOutlineView*)widget reloadData];token=outlineTokens[item->identity];}if(!token)fail(380);NSInteger row=[(NSOutlineView*)widget rowForItem:token];if(row<0)fail(380);[(NSTableView*)widget selectRowIndexes:[NSIndexSet indexSetWithIndex:size_t(row)]byExtendingSelection:NO];}
    else{auto collection=items(spec.type=="ListView"?"listitems":"tabs");auto it=std::find(collection->items.begin(),collection->items.end(),item);if(it==collection->items.end())fail(380);size_t i=size_t(it-collection->items.begin());if(spec.type=="ListView")[(NSTableView*)widget selectRowIndexes:[NSIndexSet indexSetWithIndex:i]byExtendingSelection:NO];else [(NSTabView*)widget selectTabViewItemAtIndex:i];}return;
  }
  if(name=="tab"&&spec.type=="SSTab"){auto i=value.integral();auto tabs=(NSTabView*)widget;if(i<0||i>=tabs.numberOfTabViewItems)fail(380);[tabs selectTabViewItemAtIndex:i];properties[name]=Value::integer(i,Type::Integer);return;}
  if(name=="text"&&!grid.empty()){auto r=size_t(number("row",0)),c=size_t(number("col",0));if(r>=grid.size()||c>=grid[r].size())fail(381);grid[r][c]=value.string();reloadList();return;}
  if(name=="rows"||name=="cols"||name=="rowcount"||name=="columncount"){
    auto n=value.integral();if(n<0||n>100000)fail(380);auto rows=(name=="rows"||name=="rowcount")?size_t(n):grid.size(),cols=(name=="cols"||name=="columncount")?size_t(n):(grid.empty()?0:grid[0].size());resizeGrid(rows,cols);properties[name]=Value::integer(n);updateColumns();reloadList();return;
  }
  if(name=="row"||name=="col"){auto n=value.integral();if(n<0||name=="row"&&size_t(n)>=grid.size()||name=="col"&&(grid.empty()||size_t(n)>=grid[0].size()))fail(381);properties[name]=Value::integer(n);return;}
  if(name=="currentx"||name=="currenty"){double n=value.floating();if(name=="currentx")currentX=n;else currentY=n;return;}
  if(name=="picture"||name=="image"){
    if(value.type!=Type::Object)fail(13);auto object=std::get<ObjectPtr>(value.payload);auto image=std::dynamic_pointer_cast<MacImage>(object);if(object&&!image)fail(13);
    properties[name]=value;if([widget isKindOfClass:NSImageView.class])((NSImageView*)widget).image=image?image->image:nil;else if([widget isKindOfClass:NSButton.class])((NSButton*)widget).image=image?image->image:nil;view.needsDisplay=YES;return;
  }
  if(name=="text"||name=="caption"){
    auto next=value.string(),old=property(name,Value::string(u"")).string();properties[name]=Value::string(next);refresh();
    if(name=="text"&&next!=old)event("change");return;
  }
  const std::set<std::string>supported={"left","top","width","height","visible","enabled","tag","tooltiptext","backcolor","forecolor","fontname","fontsize","fontbold","fontitalic","fontunderline","fontstrikethru","alignment","locked","maxlength","value","min","max","smallchange","largechange","tickfrequency","interval","checked","tabindex","tabstop","scalemode","scaleleft","scaletop","scalewidth","scaleheight","drawcolor","drawstyle","drawmode","drawwidth","fillcolor","fillstyle","bordercolor","borderwidth","shape","borderstyle","stretch","sorted","multiselect","gridlines","fullrowselect","view","fixedrows","fixedcols","rowsel","colsel","textmatrix","simpletext","style","filter","filterindex","filename","dialogtitle","initdir","defaultext","flags","cancelerror","path","pattern","drive","charttype","rowlabel","columnlabel","row","col","tab","redraw","enabled","mousepointer","color","fontcharset"};
  if(!supported.count(name))fail(438,"Unsupported native property "+spec.type+"."+raw);
  if(name=="interval"){auto n=value.integral();if(n<0||n>65535)fail(380);}
  if(name=="value"&&(spec.type=="CheckBox"||spec.type=="OptionButton")){auto n=value.integral();if(n<0||n>(spec.type=="CheckBox"?2:1))fail(380);}
  if(name=="scalemode"){auto n=value.integral();if(n<0||n>7)fail(380);}
  auto previous=property(name);properties[name]=value;
  try{
    if(name=="left"||name=="top"||name=="width"||name=="height")applyFrame();
    else if(name.rfind("font",0)==0)applyFont();
    else if(name=="interval"||name=="enabled"&&spec.type=="Timer")timerChanged();
    else if(name=="path"||name=="pattern"||name=="drive")reloadFiles();
    else if(name=="tooltiptext")view.toolTip=ns(value.string());
    else if(name=="visible")view.hidden=!value.truth();
    else refresh();
  }catch(...){properties[name]=previous;throw;}
}
Ref MacControl::reference(Runtime&rt,const std::string&raw,Args args){
  auto c=self();auto name=lower(raw);if(args.empty())return Object::reference(rt,name,args);
  return {[c,&rt,name,args]{return c->invoke(rt,name,args);},[c,&rt,name,args](Value v,bool){auto all=args;all.emplace_back(v);c->invoke(rt,"let:"+name,all);},"variant",false,false};
}
Value MacControl::invoke(Runtime&rt,const std::string&raw,Args args){
  if(disposed)fail(91);bool put=raw.rfind("let:",0)==0||raw.rfind("set:",0)==0;auto name=lower(put?raw.substr(4):raw);if(name.empty())name=defaultMember();
  if(name=="list"||name=="itemdata"||name=="selected"){
    if(args.size()!=(put?2:1))fail(450);auto index=args[0].value.integral();rangeCheck(index,list.size());size_t i=size_t(index);
    if(put){if(name=="list")list[i]=args[1].value.string();else if(name=="itemdata")itemData[i]=static_cast<int32_t>(coerce(args[1].value,"long").integral());else{if(args[1].value.truth())selected.insert(i);else selected.erase(i);}reloadList();return {};}
    return name=="list"?Value::string(list[i]):name=="itemdata"?Value::integer(itemData[i]):Value::boolean(selected.count(i));
  }
  if(name=="textmatrix"||name=="textarray"||name=="data"){
    size_t count=name=="textmatrix"?2:0;bool chart=name=="data"&&spec.type=="MSChart";if(chart)count=0;else if(name!="textmatrix")count=1;
    if(args.size()!=count+(put?1:0))fail(450);int64_t r=chart?int64_t(number("row",1))-1:name=="textmatrix"?args[0].value.integral():grid.empty()?0:args[0].value.integral()/int64_t(grid[0].size());int64_t c=chart?int64_t(number("column",1))-1:name=="textmatrix"?args[1].value.integral():grid.empty()?0:args[0].value.integral()%int64_t(grid[0].size());
    if(r<0||c<0||size_t(r)>=grid.size()||size_t(c)>=grid[size_t(r)].size())fail(381);
    if(put){grid[size_t(r)][size_t(c)]=args[count].value.string();reloadList();return {};}return Value::string(grid[size_t(r)][size_t(c)]);
  }
  if(name=="colwidth"||name=="rowheight"){
    if(args.size()!=(put?2:1))fail(450);int i=int(args[0].value.integral());if(i<0)fail(381);auto&map=name=="colwidth"?columnWidths:rowHeights;if(put){double n=args[1].value.floating();if(n<0||n>300000)fail(380);map[i]=n/15;updateColumns();reloadList();return {};}return Value::real((map.count(i)?map[i]:name=="colwidth"?90:20)*15);
  }
  if(put&&args.size()==1){set(rt,name,args[0].value);return {};}
  if(name=="print")return nativePrint(*this,std::move(args));
  if(name=="paintpicture"){if(args.size()<3||args.size()>9)fail(450);auto image=std::dynamic_pointer_cast<MacImage>(args[0].value.asObject());if(!image||!image->image)fail(5);auto command=nativeCommand(*this,"image");command.image=image->image;auto origin=point(args[1].value.floating(),args[2].value.floating());double width=argument(args,3,Value::real(image->image.size.width/unit(-1,true))).floating(),height=argument(args,4,Value::real(image->image.size.height/unit(-1,false))).floating();command.coordinates={origin.x,origin.y,width*unit(-1,true),height*unit(-1,false)};if(args.size()>5){command.coordinates.push_back(argument(args,5,Value::real(0)).floating()*unit(-1,true));command.coordinates.push_back(argument(args,6,Value::real(0)).floating()*unit(-1,false));command.coordinates.push_back(argument(args,7,Value::real(width)).floating()*unit(-1,true));command.coordinates.push_back(argument(args,8,Value::real(height)).floating()*unit(-1,false));}appendCommand(*this,std::move(command));return {};}
  if(name=="additem"){
    if(args.empty()||args.size()>2)fail(450);Text item=args[0].value.string();int64_t index=integerArgument(args,1,list.size());if(index<0||index>int64_t(list.size()))fail(5);if(list.size()>=1000000)fail(7);
    if(flag("sorted"))index=std::lower_bound(list.begin(),list.end(),item)-list.begin();list.insert(list.begin()+index,item);itemData.insert(itemData.begin()+index,0);selected.clear();properties["newindex"]=Value::integer(index);reloadList();return {};
  }
  if(name=="removeitem"){if(args.size()!=1)fail(450);auto index=args[0].value.integral();rangeCheck(index,list.size());list.erase(list.begin()+index);itemData.erase(itemData.begin()+index);selected.clear();reloadList();return {};}
  if(name=="clear"){if(!args.empty())fail(450);list.clear();itemData.clear();selected.clear();for(auto&row:grid)for(auto&cell:row)cell.clear();reloadList();return {};}
  if(name=="setfocus"){if(!args.empty())fail(450);if(!view||view.hidden||!flag("enabled",true))fail(5);auto window=view.window;if(!window||![window makeFirstResponder:widget])fail(5);return {};}
  if(name=="refresh"){view.needsDisplay=YES;[view displayIfNeeded];return {};}
  if(name=="move"){if(args.size()<2||args.size()>4)fail(450);const char*names[]={"left","top","width","height"};for(size_t i=0;i<args.size();i++)if(args[i].value.type!=Type::Missing)properties[names[i]]=args[i].value;applyFrame();return {};}
  if(name=="zorder"){auto mode=integerArgument(args,0,0);if(mode!=0&&mode!=1)fail(5);auto parent=view.superview;if(parent){[view removeFromSuperview];[parent addSubview:view positioned:mode==0?NSWindowAbove:NSWindowBelow relativeTo:nil];}return {};}
  if(name=="cls"){graphics.clear();currentX=currentY=0;view.needsDisplay=YES;return {};}
  if(name=="textwidth"||name=="textheight"){
    if(args.size()!=1)fail(450);NSFont*font=[NSFont systemFontOfSize:number("fontsize",8.25)*4/3];NSSize size=[ns(args[0].value.string())sizeWithAttributes:@{NSFontAttributeName:font}];return Value::real(name=="textwidth"?size.width/unit(-1,true):size.height/unit(-1,false),Type::Single);
  }
  if(name=="scalex"||name=="scaley"){if(args.empty()||args.size()>3)fail(450);bool x=name=="scalex";return Value::real(args[0].value.floating()*unit(int(integerArgument(args,1,number("scalemode",1))),x)/unit(int(integerArgument(args,2,number("scalemode",1))),x),Type::Single);}
  if(name=="showopen"||name=="showsave"||name=="showcolor"||name=="showfont"||name=="showprinter")return host->dialog(*this,name);
  if(name=="getdc")return host->api(rt,"user32.GetDC",{Arg(Value::integer(handle))});
  if(name=="click"){event("click");return {};}
  if(name=="loadfile"&&spec.type=="RichTextBox"){
    auto file=std::filesystem::path(toUTF8(stringArgument(args,0)));NSError*error=nil;NSAttributedString*rich=[[NSAttributedString alloc]initWithURL:[NSURL fileURLWithPath:ns(fromUTF8(file.string()))]options:@{} documentAttributes:nullptr error:&error];if(!rich)fail(53,toUTF8(text(error.localizedDescription)));[textView(*this).textStorage setAttributedString:rich];changed("text");return {};
  }
  if(name=="savefile"&&spec.type=="RichTextBox"){
    NSData*data=integerArgument(args,1,0)==1?[textView(*this).string dataUsingEncoding:NSWindowsCP1252StringEncoding allowLossyConversion:NO]:[textView(*this)RTFFromRange:NSMakeRange(0,textView(*this).string.length)];NSError*error=nil;if(!data||![data writeToFile:ns(stringArgument(args,0)) options:NSDataWritingAtomic error:&error])fail(75,error?toUTF8(text(error.localizedDescription)):"Text cannot be encoded");return {};
  }
  if(args.empty())return get(rt,name);fail(438,"Unsupported native method "+spec.type+"."+raw);
}
void MacControl::reloadFiles(){
  list.clear();itemData.clear();selected.clear();
  if(spec.type=="DriveListBox"){
    NSArray<NSURL*>*volumes=[NSFileManager.defaultManager mountedVolumeURLsIncludingResourceValuesForKeys:nil options:0];for(NSURL*url in volumes)list.push_back(text(url.path));if(list.empty())list.push_back(u"/");properties["drive"]=Value::string(u"/");
  }else{
    auto folder=std::filesystem::path(toUTF8(property("path",Value::string(u"/")).string()));std::error_code error;if(!std::filesystem::is_directory(folder,error))fail(76);
    auto pattern=property("pattern",Value::string(u"*.*")).string();if(pattern==u"*.*")pattern=u"*";
    for(auto it=std::filesystem::directory_iterator(folder,error);!error&&it!=std::filesystem::directory_iterator();it.increment(error)){
      bool directory=it->is_directory(error);if(error)break;auto name=fromUTF8(it->path().filename().string());if((spec.type=="DirListBox"&&directory)||(spec.type=="FileListBox"&&!directory&&like(name,pattern,true)))list.push_back(name);
    }
    if(error)fail(75,error.message());std::sort(list.begin(),list.end());
  }
  itemData.resize(list.size());reloadList();
}
void MacControl::reloadList(){
  if([widget isKindOfClass:NSComboBox.class]){
    auto combo=(NSComboBox*)widget;[combo removeAllItems];for(auto&item:list)[combo addItemWithObjectValue:ns(item)];auto i=number("listindex",-1);if(i>=0&&size_t(i)<list.size())[combo selectItemAtIndex:NSInteger(i)];combo.stringValue=ns(property(spec.type=="DriveListBox"?"drive":"text",Value::string(u"")).string());
  }else if(auto table=tableView(*this)){[table reloadData];NSMutableIndexSet*indices=[NSMutableIndexSet indexSet];for(size_t i:selected)if(i<size_t(table.numberOfRows))[indices addIndex:i];[table selectRowIndexes:indices byExtendingSelection:NO];}
  view.needsDisplay=YES;
}
void MacControl::resizeGrid(size_t rows,size_t cols){if(rows>100000||cols>10000||(cols&&rows>1000000/cols))fail(7,"Grid exceeds one million cells");grid.resize(rows);for(auto&row:grid)row.resize(cols);}
void MacControl::updateColumns(){
  auto table=tableView(*this);if(!table)return;for(NSTableColumn*column in table.tableColumns.copy)[table removeTableColumn:column];
  size_t count=!grid.empty()?grid[0].size():spec.type=="ListView"?std::max(size_t(1),items("columnheaders")->items.size()):1;
  table.headerView=(spec.type=="ListBox"||spec.type=="FileListBox"||spec.type=="DirListBox"||spec.type=="TreeView")?nil:[NSTableHeaderView new];
  for(size_t i=0;i<count;i++){
    auto column=[[NSTableColumn alloc]initWithIdentifier:[NSString stringWithFormat:@"%zu",i]];column.width=columnWidths.count(int(i))?columnWidths[int(i)]:90;
    column.title=spec.type=="ListView"&&i<items("columnheaders")->items.size()?ns(items("columnheaders")->items[i]->properties["text"].string()):[NSString stringWithFormat:@"%zu",i+1];
    column.editable=spec.type=="DataGrid";[table addTableColumn:column];if(spec.type=="TreeView"&&i==0)((NSOutlineView*)table).outlineTableColumn=column;
  }
}
Value MacControlArray::get(Runtime&,const std::string&name){if(lower(name)=="count")return Value::integer(elements.size());if(lower(name)=="lbound")return Value::integer(elements.empty()?0:elements.begin()->first);if(lower(name)=="ubound")return Value::integer(elements.empty()?-1:elements.rbegin()->first);fail(438);}
Value MacControlArray::invoke(Runtime&rt,const std::string&raw,Args args){
  auto name=lower(raw);if(name.empty()||name=="item"){if(args.size()!=1)fail(450);int index=int(coerce(args[0].value,"integer").integral());auto it=elements.find(index);if(it==elements.end())fail(340,"Control array element does not exist");return Value::object(it->second);}
  if(name=="load"){if(args.size()!=1)fail(450);int index=int(coerce(args[0].value,"integer").integral());if(index<0||elements.count(index))fail(360,"Control already loaded or invalid index");auto f=owner.lock();if(!f)fail(91);auto spec=prototype;spec.index=index;spec.properties.push_back({"index",Value::integer(index,Type::Integer)});spec.properties.push_back({"visible",Value::boolean(false)});elements[index]=host->createControl(f,std::move(spec),true);return {};}
  if(name=="unload"){if(args.size()!=1)fail(450);int index=int(coerce(args[0].value,"integer").integral());auto it=elements.find(index);if(it==elements.end())fail(340);if(designElements.count(index))fail(362,"Cannot unload a design-time control");it->second->dispose();elements.erase(it);return {};}
  if(args.empty())return get(rt,name);fail(438);
}
std::vector<Value>MacControlArray::enumerate(Runtime&){std::vector<Value>out;for(auto&entry:elements)out.push_back(Value::object(entry.second));return out;}
} // namespace vb6

@implementation VB6Canvas
-(BOOL)isFlipped{return YES;}
-(BOOL)acceptsFirstResponder{return YES;}
-(void)drawRect:(NSRect)dirty{if(auto c=model.lock())c->host->event([c,dirty]{vb6::drawControl(*c,dirty);});}
@end
@implementation VB6ControlDelegate
-(void)action:(id)sender{if(auto c=model.lock())c->host->event([c,sender]{
  if([sender isKindOfClass:NSButton.class]&&c->spec.type=="CommandButton"||[sender isKindOfClass:NSMenuItem.class])c->event("click");
  else if([sender isKindOfClass:NSTableView.class]){auto table=(NSTableView*)sender;c->properties["listindex"]=vb6::Value::integer(table.selectedRow);c->selected.clear();[table.selectedRowIndexes enumerateIndexesUsingBlock:^(NSUInteger index,BOOL*){c->selected.insert(index);}];c->event("click");if(c->spec.type=="ListView"){auto value=c->get(*c->host->runtime,"selecteditem");if(value.type==vb6::Type::Object&&std::get<vb6::ObjectPtr>(value.payload))c->event("itemclick",{vb6::Arg(value)});}else if(c->spec.type=="TreeView"){auto value=c->get(*c->host->runtime,"selecteditem");if(value.type==vb6::Type::Object&&std::get<vb6::ObjectPtr>(value.payload))c->event("nodeclick",{vb6::Arg(value)});}}
  else if([sender isKindOfClass:NSComboBox.class]){c->properties["listindex"]=vb6::Value::integer([(NSComboBox*)sender indexOfSelectedItem]);c->changed("text");c->event("click");}
  else if(c->spec.type=="TextBox"||c->spec.type=="RichTextBox")c->changed("text");else c->changed("value");
});}
-(void)doubleAction:(id)sender{(void)sender;if(auto c=model.lock())c->host->event([c]{c->event("dblclick");});}
-(void)controlTextDidChange:(NSNotification*)note{(void)note;if(auto c=model.lock())c->host->event([c]{c->changed("text");});}
-(void)textDidChange:(NSNotification*)note{(void)note;if(auto c=model.lock())c->host->event([c]{c->changed("text");});}
-(void)controlTextDidBeginEditing:(NSNotification*)note{(void)note;if(auto c=model.lock())c->host->event([c]{c->event("gotfocus");});}
-(void)controlTextDidEndEditing:(NSNotification*)note{(void)note;if(auto c=model.lock())c->host->event([c]{c->event("lostfocus");});}
-(BOOL)control:(NSControl*)control textShouldEndEditing:(NSText*)editor{(void)control;(void)editor;auto c=model.lock();if(!c)return YES;auto cancel=std::make_shared<vb6::Cell>(vb6::Value::boolean(false),"boolean");c->host->event([c,cancel]{c->event("validate",{vb6::Arg(vb6::cellRef(cancel))});});return !cancel->get().truth();}
-(void)comboBoxSelectionDidChange:(NSNotification*)note{[self action:note.object];}
-(void)tabView:(NSTabView*)tabs didSelectTabViewItem:(NSTabViewItem*)item{if(auto c=model.lock())c->host->event([c,tabs,item]{auto previous=c->number("tab",0);auto index=[tabs indexOfTabViewItem:item];c->properties["tab"]=vb6::Value::integer(index,vb6::Type::Integer);c->event("click",c->spec.type=="SSTab"?vb6::Args{vb6::Arg(vb6::Value::integer(int64_t(previous),vb6::Type::Integer))}:vb6::Args{});});}
@end
