#include "vb6.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
template<class F> void raises(int code,F&&fn){bool caught=false;try{fn();}catch(const Error&e){caught=true;assert(e.number==code);}assert(caught);}
int main(){
  static_assert(sizeof(int16_t)==2 && sizeof(int32_t)==4 && sizeof(int64_t)==8);
  assert(bankers(0.5L)==0 && bankers(1.5L)==2 && bankers(-1.5L)==-2 && bankers(-2.5L)==-2);
  raises(6,[]{Value::integer(32768,Type::Integer);});
  raises(6,[]{binary("+",Value::integer(32767,Type::Integer),Value::integer(1,Type::Integer));});
  auto widened=binary("+",Value::integer(32767,Type::Integer,true),Value::integer(1,Type::Integer));assert(widened.type==Type::Long && widened.integral()==32768 && widened.variant);
  raises(6,[]{unary("-",Value::integer(INT32_MIN));});
  raises(6,[]{binary("\\",Value::integer(INT32_MIN),Value::integer(-1));});
  assert(binary("mod",Value::integer(INT32_MIN),Value::integer(-1)).integral()==0);
  assert(binary("\\",Value::integer(-9),Value::integer(2)).integral()==-4);
  raises(11,[]{binary("/",Value::integer(1),Value::integer(0));});
  assert(Value::boolean(true).integral()==-1);
  assert(binary("and",Value::null(),Value::integer(0)).integral()==0);
  assert(binary("or",Value::null(),Value::integer(-1)).integral()==-1);
  assert(binary("=",Value::null(),Value::integer(1)).type==Type::Null);
  assert(binary("&",Value::null(),Value::string(u"A")).string()==u"A");
  assert(binary("+",Value::string(u"A"),Value::string(u"B")).string()==u"AB");
  assert(binary("=",Value::string(u"abc"),Value::string(u"ABC"),true).truth());
  Text counted{u'a',0,u'b',char16_t(0xd83d),char16_t(0xde80)};assert(fromUTF8(toUTF8(counted))==counted);
  assert(Value::string(counted).string().size()==5);
  assert(coerce(Value::string(u"abc"),"String",5).string()==u"abc  ");
  assert(coerce(Value::string(u"abcdef"),"String",3).string()==u"abc");
  assert(like(u"photo42.png",u"[pP]*##.png"));assert(!like(u"photo4a.png",u"[pP]*##.png"));
  raises(93,[]{like(u"a",u"[z-a]");});
  assert(Decimal::parse(u"79228162514264337593543950335").string()==u"79228162514264337593543950335");
  raises(6,[]{Decimal::parse(u"79228162514264337593543950336");});
  assert(Decimal::add(Decimal::parse(u"0.1"),Decimal::parse(u"0.2")).string()==u"0.3");
  assert(Decimal::multiply(Decimal::parse(u"123456789.123456789"),Decimal::parse(u"0.000000001")).string()==u"0.123456789123456789");
  assert(Decimal::divide(Decimal::parse(u"1"),Decimal::parse(u"3")).string()==u"0.3333333333333333333333333333");
  assert(Decimal::divide(Decimal::parse(u"1"),Decimal::parse(u"1e-28")).string()==u"10000000000000000000000000000");
  assert(Decimal::divide(Decimal::parse(u"1e-28"),Decimal::parse(u"2")).string()==u"0");
  assert(Decimal::divide(Decimal::parse(u"3e-28"),Decimal::parse(u"2")).string()==u"0.0000000000000000000000000002");
  assert(std::get<int64_t>(Value::currency(u"922337203685477.5807").payload)==INT64_MAX);
  assert(std::get<int64_t>(Value::currency(u"-922337203685477.5808").payload)==INT64_MIN);
  assert(std::get<int64_t>(Value::currency(u"1.23445").payload)==12344);
  auto array=std::make_shared<Array>("long",Bounds{{1,2},{3,4}},true,100);array->at({Value::integer(2),Value::integer(4)}).set(Value::integer(123));
  assert(array->values[3].integral()==123);auto bigger=array->resized({{1,2},{3,5}},true,100);assert(bigger->at({Value::integer(2),Value::integer(4)}).get().integral()==123);
  raises(9,[&]{array->resized({{1,3},{3,4}},true,100);});raises(9,[&]{array->at({Value::integer(3),Value::integer(4)});});
  auto copied=array->copy();copied->values[0]=Value::integer(17);assert(array->values[0].integral()==0);
  auto pinned=array->at({Value::integer(2),Value::integer(4)});array.reset();pinned.set(Value::integer(321));assert(pinned.get().integral()==321);
  std::cout<<"native value contracts passed\n";
}
