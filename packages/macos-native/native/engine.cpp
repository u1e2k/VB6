// Native module lifetime, startup, forms and host boundary. MIT.
#include "vb6.hpp"
#include <iostream>
namespace vb6 {
Runtime::Runtime(std::unique_ptr<NativeHost> value):host(std::move(value)){if(!host)throw std::invalid_argument("Native host required");host->attach(*this);installBuiltins(*this);installFileBuiltins(*this);installFinancialBuiltins(*this);}
Runtime::~Runtime(){ending=true;host->shutdown();instances.clear();files.clear();}
Value Runtime::defaultValue(const std::string&raw,Frame*frame){
  auto type=lower(raw);
  if(type=="variant")return {};if(type=="object"||modules.count(type))return Value::object(nullptr);
  if(frame&&frame->module.records.count(type))return frame->module.records.at(type)(*frame);
  for(auto&entry:modules)if(entry.second.records.count(type)){if(frame)return entry.second.records.at(type)(*frame);auto object=instance(entry.first);Frame f(*this,object);return entry.second.records.at(type)(f);}
  if(type=="collection"||type=="scripting.dictionary")return Value::object(nullptr);
  if(typeCode(type)==Type::Record)return Value::object(nullptr);
  return coerce(Value{},type);
}
std::shared_ptr<Instance> Runtime::instance(const std::string&raw,bool fresh){
  auto name=lower(raw);auto m=modules.find(name);if(m==modules.end())fail(429,"Unknown class: "+raw);
  if(!fresh){auto found=instances.find(name);if(found!=instances.end())return found->second;}
  auto object=std::make_shared<Instance>(*this,m->second);object->initializing=true;
  if(!fresh)instances[name]=object;
  try{Frame frame(*this,object);if(m->second.initialize)m->second.initialize(frame);object->initialized=true;object->initializing=false;if(m->second.kind=="class")dispatch(object,"class_initialize");}
  catch(...){if(!fresh)instances.erase(name);throw;}
  return object;
}
Value Runtime::create(const std::string&raw){auto name=lower(raw);if(modules.count(name))return Value::object(instance(name,true));return createLibraryObject(*this,name);}
Value Runtime::invoke(const std::shared_ptr<Instance>&object,const std::string&raw,Args args,bool internal){
  auto name=lower(raw);auto found=object->module->procedures.find(name);if(found==object->module->procedures.end())fail(438,"Unknown procedure: "+raw);
  auto&proc=found->second;if(!internal&&proc.scope=="private")fail(438);if(!proc.code)fail(453);
  Frame frame(*this,object,&proc,std::move(args));return proc.code(frame);
}
Value Runtime::dispatch(const std::shared_ptr<Instance>&object,const std::string&name,Args args){if(!object->module->procedures.count(lower(name)))return {};return invoke(object,name,std::move(args),true);}
void Runtime::load(const std::shared_ptr<Instance>&object){
  if(object->module->kind!="form")fail(424);if(object->loaded||object->loading)return;object->loading=true;
  try{host->createForm(object);object->loaded=true;std::string prefix=object->module->form&&object->module->form->type=="MDIForm"?"mdiform_":"form_";if(!object->formInitialized){object->formInitialized=true;dispatch(object,prefix+"initialize");}dispatch(object,prefix+"load");object->loading=false;}
  catch(...){object->loading=false;try{if(object->loaded)host->formCall(object,"__unload",{});}catch(...){}object->loaded=false;object->controls.clear();throw;}
}
void Runtime::unload(const std::shared_ptr<Instance>&object){
  if(!object->loaded||object->unloading)return;object->unloading=true;
  try{std::string prefix=object->module->form&&object->module->form->type=="MDIForm"?"mdiform_":"form_";auto cancel=std::make_shared<Cell>(Value::integer(0,Type::Integer),"integer");dispatch(object,prefix+"queryunload",{Arg(cellRef(cancel)),Arg(Value::integer(0,Type::Integer))});if(!cancel->get().truth())dispatch(object,prefix+"unload",{Arg(cellRef(cancel))});
    if(!cancel->get().truth()){host->formCall(object,"__unload",{});object->loaded=false;object->controls.clear();}object->unloading=false;
  }catch(...){object->unloading=false;throw;}
}
void Runtime::bindEvents(std::shared_ptr<Instance> sink,const std::string&field,Value value){
  subscriptions.erase(std::remove_if(subscriptions.begin(),subscriptions.end(),[&](auto&s){return s.source.expired()||s.sink.expired()||(s.sink.lock()==sink&&s.field==field);}),subscriptions.end());
  if(value.type==Type::Object){auto object=std::get<ObjectPtr>(value.payload);if(object)subscriptions.push_back({object,sink,field});}
}
void Runtime::raiseEvent(const std::shared_ptr<Instance>&source,const std::string&name,Args args){auto copy=subscriptions;for(auto&s:copy)if(s.source.lock()==source)if(auto sink=s.sink.lock())dispatch(sink,s.field+"_"+name,args);}
void Runtime::run(){
  try{
    for(auto&entry:modules)if(entry.second.kind=="module")instance(entry.first);
    if(lower(startup)=="sub main"||lower(startup)=="main"){
      std::shared_ptr<Instance> owner;for(auto&entry:modules)if(entry.second.kind=="module"&&entry.second.procedures.count("main")){if(owner)fail(5,"Ambiguous Sub Main");owner=instance(entry.first);}
      if(!owner)fail(453,"Sub Main is not defined");invoke(owner,"main",{},true);
    }else{auto form=instance(startup);load(form);host->formCall(form,"show",{});}
    host->run(*this);
  }catch(const EndExecution&){ending=true;host->shutdown();}
}
Value NativeHost::createObject(Runtime&,const std::string&name){fail(429,"Native object unavailable: "+name);}
Value NativeHost::appProperty(Runtime&,const std::string&){fail(438);}
void NativeHost::createForm(const std::shared_ptr<Instance>&){fail(453,"Native form host unavailable");}
Value NativeHost::formGet(const std::shared_ptr<Instance>&,const std::string&){fail(438);}
void NativeHost::formSet(const std::shared_ptr<Instance>&,const std::string&,Value){fail(438);}
Value NativeHost::formCall(const std::shared_ptr<Instance>&,const std::string&,Args){fail(438);}
Value NativeHost::api(Runtime&,const std::string&name,Args){fail(453,"Native API unavailable: "+name);}
Value NativeHost::builtin(Frame&,const std::string&name,Args){fail(453,"Host procedure unavailable: "+name);}
void NativeHost::graphics(Frame&,Value,const std::string&,std::vector<Value>,Value,bool){fail(438,"Native graphics host unavailable");}
void NativeHost::log(const Text&text,bool newline){std::cout<<toUTF8(text);if(newline)std::cout<<'\n';std::cout.flush();}
int NativeHost::run(Runtime&){return 0;}void NativeHost::pump(){}void NativeHost::shutdown(){}
} // namespace vb6
