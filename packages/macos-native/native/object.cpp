// Reference-preserving native object protocol. MIT.
#include "vb6.hpp"
namespace vb6 {
Value Object::get(Runtime&,const std::string&) { fail(438); }
void Object::set(Runtime&,const std::string&,Value,bool) { fail(438); }
Value Object::invoke(Runtime& rt,const std::string& name,Args args) { if(args.empty())return get(rt,name);fail(438); }
Ref Object::reference(Runtime& rt,const std::string& name,Args args) {
  auto self=shared_from_this();
  return {[self,&rt,name,args]{return self->invoke(rt,name,args);},[self,&rt,name,args](Value v,bool set){
    if(args.empty())self->set(rt,name,v,set);else{auto all=args;all.emplace_back(v);self->invoke(rt,(set?"set:":"let:")+name,all);}
  },"variant",false,false};
}
std::vector<Value> Object::enumerate(Runtime&) { fail(451); }
bool Object::supports(const std::string& name)const{return lower(name)=="object"||lower(className())==lower(name);}
ObjectPtr Object::queryInterface(const std::string& name) {
  if(!supports(name))fail(13,"Object does not support interface: "+name);
  return shared_from_this();
}
bool sameObject(const ObjectPtr&a,const ObjectPtr&b)noexcept {
  return (a?a->identity():nullptr)==(b?b->identity():nullptr);
}
}
