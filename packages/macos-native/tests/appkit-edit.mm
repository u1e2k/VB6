// Actual Cocoa field editor, rich text, list identity and source API regressions.
#include "appkit-edit.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
void checkNativeRichText(Runtime&,const std::shared_ptr<Instance>&);
namespace {
int changes=0,listClicks=0;
bool reenter=false;
Text observedText;
int64_t observedStart=0,observedLength=0;
std::shared_ptr<MacControl> control(const std::shared_ptr<Instance>& form,const char* name){
  auto result=std::dynamic_pointer_cast<MacControl>(form->controls.at(name));assert(result);return result;
}
void select(Runtime& rt,const std::shared_ptr<MacControl>& c,int64_t start,int64_t length){
  c->set(rt,"selstart",Value::integer(start));c->set(rt,"sellength",Value::integer(length));
}
int64_t integer(Runtime& rt,const std::shared_ptr<MacControl>& c,const char* property){return c->get(rt,property).integral();}
void invalid(Runtime& rt,const std::shared_ptr<MacControl>& c,const char* property,int64_t value){
  bool caught=false;try{c->set(rt,property,Value::integer(value));}catch(const Error&e){caught=true;assert(e.number==380);}
  assert(caught);
}
Value send(Runtime& rt,MacHost& host,const std::shared_ptr<MacControl>& c,int message,Arg w,Arg l){
  return host.api(rt,"user32.SendMessageW",{Arg(Value::integer(c->handle)),Arg(Value::integer(message)),std::move(w),std::move(l)});
}
}
void checkNativeEditing(Runtime& rt,MacHost& host,const std::shared_ptr<Instance>& form){
  auto edit=control(form,"c2"),rich=control(form,"c18"),list=control(form,"c10"),combo=control(form,"c11");
  Procedure changed;changed.name="C2_Change";changed.code=[](Frame& f)->Value{
    auto edit=control(f.self,"c2");++changes;observedText=edit->get(f.runtime,"text").string();
    observedStart=integer(f.runtime,edit,"selstart");observedLength=integer(f.runtime,edit,"sellength");
    if(reenter){reenter=false;select(f.runtime,edit,0,1);edit->set(f.runtime,"seltext",Value::string(u"Q"));}
    return {};
  };form->module->procedures["c2_change"]=std::move(changed);
  Procedure clicked;clicked.name="C11_Click";clicked.code=[](Frame&)->Value{++listClicks;return {};};form->module->procedures["c11_click"]=std::move(clicked);
  edit->set(rt,"text",Value::string(u"A\U0001f680BC"));select(rt,edit,1,2);
  assert(edit->get(rt,"seltext").string()==u"\U0001f680");
  changes=0;edit->set(rt,"seltext",Value::string(u"xy"));
  assert(changes==1&&observedText==u"AxyBC"&&observedStart==3&&observedLength==0);
  assert(integer(rt,edit,"selstart")==3&&integer(rt,edit,"sellength")==0);
  select(rt,edit,INT32_MAX,INT32_MAX);assert(integer(rt,edit,"selstart")==5&&integer(rt,edit,"sellength")==0);
  select(rt,edit,1,INT32_MAX);assert(integer(rt,edit,"sellength")==4);
  invalid(rt,edit,"selstart",-1);invalid(rt,edit,"sellength",-1);invalid(rt,edit,"maxlength",-1);
  assert(integer(rt,edit,"selstart")==1&&integer(rt,edit,"sellength")==4);
  edit->set(rt,"text",Value::string(u"abcd"));select(rt,edit,1,1);changes=0;reenter=true;
  edit->set(rt,"seltext",Value::string(u"X"));
  assert(changes==2&&edit->get(rt,"text").string()==u"QXcd");
  assert(integer(rt,edit,"selstart")==1&&integer(rt,edit,"sellength")==0);

  // Exercise the real shared field editor, not a mock NSView or synthetic value.
  edit->set(rt,"text",Value::string(u"before"));select(rt,edit,2,2);
  auto window=host.form(form)->window;[window makeKeyAndOrderFront:nil];
  edit->invoke(rt,"setfocus",{});auto field=(NSTextField*)edit->widget;auto editor=(NSTextView*)field.currentEditor;
  if(!editor||editor.selectedRange.location!=2||editor.selectedRange.length!=2)
    std::cerr<<"FIELD_EDITOR_SELECTION editor="<<(editor?1:0)<<" pending="<<edit->editSelectionPending
      <<" location="<<(editor?editor.selectedRange.location:0)<<" length="<<(editor?editor.selectedRange.length:0)<<"\n";
  assert(editor&&editor.selectedRange.location==2&&editor.selectedRange.length==2);
  editor.string=@"live \u03a9";editor.selectedRange=NSMakeRange(5,1);
  assert(edit->get(rt,"text").string()==u"live \u03a9");
  auto buffer=std::make_shared<Cell>(Value::string(Text(32,0)),"string");
  auto count=host.api(rt,"user32.GetWindowTextW",{Arg(Value::integer(edit->handle)),Arg(cellRef(buffer)),Arg(Value::integer(32))});
  assert(count.integral()==6&&buffer->get().string().substr(0,6)==u"live \u03a9");
  changes=0;edit->changed("text");assert(changes==1&&observedStart==5&&observedLength==1);
  assert([window makeFirstResponder:nil]);host.check();
  assert(integer(rt,edit,"selstart")==5&&integer(rt,edit,"sellength")==1);
  edit->invoke(rt,"setfocus",{});assert(integer(rt,edit,"selstart")==5);
  send(rt,host,edit,0xb1,Arg(Value::integer(1)),Arg(Value::integer(4)));
  changes=0;send(rt,host,edit,0xc2,Arg(Value::integer(0)),Arg(Value::string(u"XYZ")));
  assert(edit->get(rt,"text").string()==u"lXYZ \u03a9");assert(integer(rt,edit,"selstart")==4&&integer(rt,edit,"sellength")==0);
  // Source SendMessage adapters suppress VB notifications intentionally.
  assert(changes==0);
  auto first=std::make_shared<Cell>(Value::integer(0),"long"),last=std::make_shared<Cell>(Value::integer(0),"long");
  Arg firstArg(cellRef(first)),lastArg(cellRef(last));firstArg.nativeByRef=true;lastArg.nativeByRef=true;
  send(rt,host,edit,0xb0,firstArg,lastArg);assert(first->get().integral()==4&&last->get().integral()==4);

  edit->set(rt,"text",Value::string(u"abcd"));edit->set(rt,"maxlength",Value::integer(5));
  editor=(NSTextView*)field.currentEditor;assert(editor);editor.string=@"abXYZcd";editor.selectedRange=NSMakeRange(5,0);
  changes=0;edit->changed("text");assert(edit->get(rt,"text").string()==u"abXcd");assert(changes==1);
  assert(integer(rt,edit,"selstart")==3);edit->set(rt,"maxlength",Value::integer(0));
  assert([window makeFirstResponder:nil]);

  // Replacing a rich selection must not flatten the unselected attributed runs.
  rich->set(rt,"text",Value::string(u"red BLUE tail"));auto richEditor=(NSTextView*)rich->widget;
  [richEditor.textStorage addAttribute:NSForegroundColorAttributeName value:NSColor.redColor range:NSMakeRange(0,3)];
  [richEditor.textStorage addAttribute:NSForegroundColorAttributeName value:NSColor.blueColor range:NSMakeRange(4,4)];
  select(rt,rich,4,4);rich->set(rt,"seltext",Value::string(u"cyan"));
  assert(rich->get(rt,"text").string()==u"red cyan tail");
  assert([[richEditor.textStorage attribute:NSForegroundColorAttributeName atIndex:0 effectiveRange:nullptr] isEqual:NSColor.redColor]);
  assert([[richEditor.textStorage attribute:NSForegroundColorAttributeName atIndex:4 effectiveRange:nullptr] isEqual:NSColor.blueColor]);
  assert(integer(rt,rich,"selstart")==8&&integer(rt,rich,"sellength")==0);

  for(auto c:{list,combo}){
    c->invoke(rt,"clear",{});
    for(auto item:{u"Alpha",u"Beta",u"Gamma"})c->invoke(rt,"additem",{Arg(Value::string(item))});
    c->set(rt,"listindex",Value::integer(1));
    c->invoke(rt,"let:itemdata",{Arg(Value::integer(1)),Arg(Value::integer(123))});
    c->invoke(rt,"additem",{Arg(Value::string(u"First")),Arg(Value::integer(0))});
    assert(integer(rt,c,"listindex")==2);
    assert(c->invoke(rt,"itemdata",{Arg(Value::integer(2))}).integral()==123);
    c->invoke(rt,"removeitem",{Arg(Value::integer(0))});assert(integer(rt,c,"listindex")==1);
    c->invoke(rt,"removeitem",{Arg(Value::integer(1))});assert(integer(rt,c,"listindex")==-1);
    c->invoke(rt,"clear",{});c->invoke(rt,"additem",{Arg(Value::string(u"New"))});assert(integer(rt,c,"listindex")==-1);
  }
  listClicks=0;combo->set(rt,"listindex",Value::integer(0));assert(listClicks==1);
  combo->set(rt,"listindex",Value::integer(0));assert(listClicks==1);
  assert(combo->get(rt,"text").string()==u"New");
  // A shared editor switches owners even when neither field changes text.
  assert([window makeFirstResponder:nil]);
  select(rt,edit,1,2);combo->set(rt,"text",Value::string(u"second"));select(rt,combo,2,3);
  edit->invoke(rt,"setfocus",{});
  assert(integer(rt,edit,"selstart")==1&&integer(rt,edit,"sellength")==2);
  combo->invoke(rt,"setfocus",{});
  assert(integer(rt,combo,"selstart")==2&&integer(rt,combo,"sellength")==3);
  edit->invoke(rt,"setfocus",{});
  assert(integer(rt,edit,"selstart")==1&&integer(rt,edit,"sellength")==2);
  assert([window makeFirstResponder:nil]);
  form->module->procedures.erase("c2_change");form->module->procedures.erase("c11_click");
  checkNativeRichText(rt,form);
  host.check();std::cout<<"APPKIT_EDIT_SELECTION_LIST_OK\n";
}
