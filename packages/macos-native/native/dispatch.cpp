// Native value/member dispatch and VB object visibility. MIT.
#include "vb6.hpp"
namespace vb6 {
Value scalar(Runtime& runtime,Value value) {
  for(int i=0;i<32 && value.type==Type::Object;i++) value=value.asObject()->get(runtime,"");
  if(value.type==Type::Object) fail(28,"Recursive default property");
  return value;
}
void ErrorState::clear(){number=0;description.clear();source.clear();helpFile.clear();helpContext=0;erl=0;}

void assign(Runtime& rt,Ref ref,Value value,bool objectSet){
  if(objectSet){if(value.type!=Type::Object)fail(424);ref.set(value,true);return;}
  value=scalar(rt,std::move(value));
  const auto current=ref.get();
  if(current.type==Type::Object && ref.type!="variant")current.asObject()->set(rt,"",value,false);
  else ref.set(std::move(value),false);
}
Value getMember(Runtime& rt,Value value,const std::string& name){
  if(value.type==Type::Record)return value.asRecord()->member(name).get();
  return value.asObject()->get(rt,name);
}
Ref objectReference(Runtime& rt,Value value,const std::string& name,Args args){
  if(value.type==Type::Record){std::vector<Value> indices;for(auto&a:args)indices.push_back(a.value);return indexedRef(rt,value.asRecord()->member(name).get(),indices);}
  return value.asObject()->reference(rt,name,args);
}
Ref memberRef(Runtime& rt,Value value,const std::string& name){
  if(value.type==Type::Record)return value.asRecord()->member(name);
  return value.asObject()->reference(rt,name);
}
Ref indexedRef(Runtime& rt,Value value,std::vector<Value> indices){
  if(value.type==Type::Array)return value.asArray()->at(indices);
  Args args;for(auto&v:indices)args.emplace_back(v);return value.asObject()->reference(rt,"",args);
}
Value callMember(Runtime& rt,Value receiver,const std::string& name,Args args){
  if(receiver.type==Type::Record){auto value=receiver.asRecord()->member(name).get();return callValue(rt,value,args);}
  return receiver.asObject()->invoke(rt,name,args);
}
Value callValue(Runtime& rt,Value receiver,Args args){
  if(receiver.type==Type::Array){std::vector<Value> indices;for(auto&a:args)indices.push_back(scalar(rt,a.value));return receiver.asArray()->at(indices).get();}
  return receiver.asObject()->invoke(rt,"",args);
}

Value Instance::get(Runtime& rt,const std::string& raw){
  auto name=lower(raw.empty()?module->defaultMember:raw);
  if(auto it=fields.find(name);it!=fields.end()&&module->publicFields.count(name))return it->second->get();
  if(module->kind=="form"){
    rt.load(std::static_pointer_cast<Instance>(shared_from_this()));
    if(auto it=controls.find(name);it!=controls.end())return Value::object(it->second);
  }
  if(module->procedures.count(name+":get"))return rt.invoke(std::static_pointer_cast<Instance>(shared_from_this()),name+":get");
  if(module->procedures.count(name))return rt.invoke(std::static_pointer_cast<Instance>(shared_from_this()),name);
  if(module->kind=="form")return rt.host->formGet(std::static_pointer_cast<Instance>(shared_from_this()),name);
  fail(438,"Unknown public member: "+module->name+"."+raw);
}
void Instance::set(Runtime& rt,const std::string& raw,Value value,bool objectSet){
  auto name=lower(raw.empty()?module->defaultMember:raw);
  if(auto it=fields.find(name);it!=fields.end()&&module->publicFields.count(name)){it->second->set(value,objectSet);return;}
  const auto key=name+(objectSet?":set":":let");
  if(module->procedures.count(key)){rt.invoke(std::static_pointer_cast<Instance>(shared_from_this()),key,{Arg(value)});return;}
  if(module->kind=="form"){rt.load(std::static_pointer_cast<Instance>(shared_from_this()));rt.host->formSet(std::static_pointer_cast<Instance>(shared_from_this()),name,value);return;}
  fail(438,"Unknown writable public member: "+module->name+"."+raw);
}
Value Instance::invoke(Runtime&rt,const std::string&raw,Args args){
  bool put=raw.rfind("let:",0)==0||raw.rfind("set:",0)==0;
  auto name=lower(put?raw.substr(4):raw);if(name.empty())name=module->defaultMember;
  auto self=std::static_pointer_cast<Instance>(shared_from_this());
  auto key=name+(put?(raw.rfind("set:",0)==0?":set":":let"):"");
  if(!put && module->procedures.count(name+":get"))key=name+":get";
  if(module->procedures.count(key))return rt.invoke(self,key,args);
  if(put && args.size()==1){set(rt,name,args[0].value,raw.rfind("set:",0)==0);return {};}
  if(auto it=fields.find(name);it!=fields.end()&&module->publicFields.count(name))return args.empty()?it->second->get():callValue(rt,it->second->get(),args);
  if(module->kind=="form"){rt.load(self);if(controls.count(name))return args.empty()?Value::object(controls.at(name)):callValue(rt,Value::object(controls.at(name)),args);return rt.host->formCall(self,name,args);}
  if(args.empty())return get(rt,name);fail(438);
}
Ref Instance::reference(Runtime&rt,const std::string&raw,Args args){
  auto name=lower(raw.empty()?module->defaultMember:raw);
  if(auto it=fields.find(name);it!=fields.end()&&module->publicFields.count(name)){
    if(args.empty())return cellRef(it->second);
    std::vector<Value> indices;for(auto&a:args)indices.push_back(a.value);return indexedRef(rt,it->second->get(),indices);
  }
  return Object::reference(rt,name,args);
}
bool Instance::supports(const std::string&raw)const{
  auto name=lower(raw);return Object::supports(raw)||std::any_of(module->interfaces.begin(),module->interfaces.end(),[&](auto&s){return lower(s)==name;});
}

} // namespace vb6
