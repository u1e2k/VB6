#include "vb6.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
void initializeProgram(Runtime&);
template<class F>void raises(int number,F&&fn) {
  bool caught=false;try{fn();}catch(const Error&e){caught=true;assert(e.number==number);}assert(caught);
}
int main() {
  Runtime rt(makeNativeHost());initializeProgram(rt);
  std::weak_ptr<Object> target,firstView;
  {
    auto concrete=rt.create("NativeProvider");target=concrete.asObject();
    auto a=coerce(concrete,"IScale"),again=coerce(concrete,"iscale"),other=coerce(a,"IOffset");
    firstView=a.asObject();
    assert(a.asObject()==again.asObject()); // Cached view, not just equal identity.
    assert(a.asObject()!=other.asObject());
    assert(sameObject(a.asObject(),other.asObject()));
    assert(sameObject(concrete.asObject(),a.asObject()));
    assert(coerce(other,"NativeProvider").asObject()==concrete.asObject());
    assert(a.asObject()->invoke(rt,"Scale",{Arg(Value::integer(7),"amount")}).integral()==14);
    raises(448,[&]{a.asObject()->invoke(rt,"Scale",{Arg(Value::integer(2),"number")});});
    raises(450,[&]{a.asObject()->invoke(rt,"Scale",{Arg(Value::integer(2),"amount"),Arg(Value::integer(3),"AMOUNT")});});
    raises(438,[&]{a.asObject()->invoke(rt,"Own",{});});
    raises(438,[&]{a.asObject()->invoke(rt,"label:get",{});});
    raises(438,[&]{concrete.asObject()->invoke(rt,"IScale_Scale",{});});
    raises(13,[&]{coerce(concrete,"UnrelatedNativeClass");});
    auto instance=std::dynamic_pointer_cast<Instance>(concrete.asObject());
    auto cachedViewCount=instance->interfaceViews.size();
    for(int i=0;i<100;++i)raises(13,[&]{coerce(concrete,"Missing"+std::to_string(i));});
    assert(instance->interfaceViews.size()==cachedViewCount);
    instance.reset();
    concrete=Value::object(nullptr);again=Value::object(nullptr);other=Value::object(nullptr);
    assert(!target.expired());
    a=Value::object(nullptr);
  }
  assert(firstView.expired());assert(target.expired());
  auto nil=Value::object(nullptr);
  assert(binary("is",nil,coerce(nil,"IScale")).truth());
  std::cout<<"NATIVE_INTERFACE_LIFETIME_OK\n";
}
