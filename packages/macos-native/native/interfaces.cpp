// Project-defined Implements dispatch, including restricted late binding. MIT.
// Contracts come from the shared VB binder; no Windows COM ABI is assumed.
#include "vb6.hpp"
namespace vb6 {
namespace {
class InterfaceView final:public Object {
  std::shared_ptr<Instance> target_;
  std::string name_;
  const InterfaceContract&contract()const{return target_->module->interfaceBindings.at(name_);}
  std::string memberName(const std::string&name)const {
    auto result=lower(name.empty()?contract().defaultMember:name);
    if(result.empty()||result.find(':')!=std::string::npos)fail(438,"Interface member is not available: "+name_+"."+name);
    return result;
  }
  Value dispatch(Runtime&rt,const std::string&key,Args args) {
    auto found=contract().members.find(key);
    if(found==contract().members.end())fail(438,"Interface member is not available: "+name_+"."+key);
    const auto&binding=found->second;
    auto implementation=target_->module->procedures.find(binding.procedure);
    if(implementation==target_->module->procedures.end()||implementation->second.parameters.size()!=binding.parameterNames.size())fail(453,"Invalid bound interface contract");
    // Named arguments belong to the interface, not to the implementation's
    // private parameter identifiers. Preserve positions, references and omitted
    // arguments; the ordinary call frame performs duplicate/arity/type checks.
    for(auto&arg:args)if(!arg.name.empty()) {
      auto name=lower(arg.name);
      auto it=std::find(binding.parameterNames.begin(),binding.parameterNames.end(),name);
      if(it==binding.parameterNames.end())fail(448,"Unknown interface argument: "+arg.name);
      arg.name=implementation->second.parameters[size_t(it-binding.parameterNames.begin())].name;
    }
    return rt.invoke(target_,binding.procedure,std::move(args),true);
  }
public:
  InterfaceView(std::shared_ptr<Instance>target,std::string name):target_(std::move(target)),name_(std::move(name)){}
  std::string className()const override{return target_->className();}
  const Object*identity()const noexcept override{return target_->identity();}
  bool supports(const std::string&name)const override{return target_->supports(name);}
  ObjectPtr queryInterface(const std::string&name)override{return target_->queryInterface(name);}
  Value get(Runtime&rt,const std::string&raw)override {
    auto name=memberName(raw),key=name+":get";
    return dispatch(rt,contract().members.count(key)?key:name,{});
  }
  void set(Runtime&rt,const std::string&raw,Value value,bool objectSet)override {
    dispatch(rt,memberName(raw)+(objectSet?":set":":let"),{Arg(std::move(value))});
  }
  Value invoke(Runtime&rt,const std::string&raw,Args args)override {
    auto name=lower(raw);const bool let=name.rfind("let:",0)==0,set=name.rfind("set:",0)==0;
    auto key=memberName(let||set?name.substr(4):name);
    if(let||set)key+=set?":set":":let";
    else if(contract().members.count(key+":get"))key+=":get";
    // A property assignment supplies an implicit final value after its named
    // index arguments. Bind that value to the contract's setter parameter.
    if((let||set)&&!args.empty()&&args.back().name.empty()&&
      std::any_of(args.begin(),args.end()-1,[](const Arg&a){return !a.name.empty();})) {
      auto binding=contract().members.find(key);
      if(binding!=contract().members.end()&&!binding->second.parameterNames.empty())
        args.back().name=binding->second.parameterNames.back();
    }
    return dispatch(rt,key,std::move(args));
  }
};
}
ObjectPtr Instance::queryInterface(const std::string&raw) {
  auto name=lower(raw);auto self=std::static_pointer_cast<Instance>(shared_from_this());
  if(name=="object"||name==lower(module->name))return self;
  if(!module->interfaceBindings.count(name))fail(13,"Object does not support interface: "+raw);
  auto&slot=interfaceViews[name];if(auto view=slot.lock())return view;
  // A view owns its target; the reverse cache is weak. Dropping the last view
  // does not introduce a reference-count cycle or keep a transient instance alive.
  auto view=std::make_shared<InterfaceView>(self,name);slot=view;return view;
}
}
