// VB6 intrinsic functions and native Automation-style library objects.
#include "library.hpp"
#include <cstdlib>
#include <cwctype>
#include <iomanip>
#include <sstream>
#include <thread>

namespace vb6 {
Value argument(const Args&args,size_t i,Value fallback){return i<args.size()&&args[i].value.type!=Type::Missing?args[i].value:fallback;}
int64_t integerArgument(const Args&args,size_t i,int64_t fallback){auto v=argument(args,i);return v.type==Type::Missing?fallback:coerce(v,"long").integral();}
Text stringArgument(const Args&args,size_t i,Text fallback){auto v=argument(args,i);return v.type==Type::Missing?fallback:v.string();}
Args bindNamed(Args args,const std::string&signature,bool variadic){
  std::vector<std::string> names;std::vector<bool> optional;std::istringstream stream(signature);std::string item;
  while(std::getline(stream,item,',')){bool opt=!item.empty()&&item.back()=='?';if(opt)item.pop_back();names.push_back(lower(item));optional.push_back(opt);}
  Args result(names.size());std::vector<bool> assigned(names.size());size_t position=0;bool named=false;
  for(auto&arg:args){
    size_t index=position;
    if(!arg.name.empty()){named=true;auto found=std::find(names.begin(),names.end(),lower(arg.name));if(found==names.end())fail(448);index=size_t(found-names.begin());}
    else{if(named)fail(448);++position;}
    if(index>=names.size()){if(!variadic)fail(450);result.push_back(arg);continue;}
    if(assigned[index])fail(450);assigned[index]=true;result[index]=arg;
  }
  for(size_t i=0;i<names.size();++i)if(!optional[i]&&result[i].value.type==Type::Missing)fail(449);
  return result;
}
void addBuiltin(Runtime&rt,const std::string&name,const std::string&signature,Builtin fn,bool variadic,bool raw){
  rt.builtins[lower(name)]=[signature,fn,variadic,raw](Frame&f,Args args){
    args=bindNamed(std::move(args),signature,variadic);
    if(!raw)for(auto&arg:args)if(arg.value.type==Type::Object)arg.value=scalar(f.runtime,arg.value);
    return fn(f,std::move(args));
  };
}
Value arrayValue(std::vector<Value>values,int base,const std::string&type){
  if(values.size()>INT32_MAX||int64_t(base)+int64_t(values.size())-1>INT32_MAX)fail(7);
  auto array=std::make_shared<Array>(type,Bounds{},true,1);array->allocated=true;array->bounds={{base,static_cast<int32_t>(base+int64_t(values.size())-1)}};
  for(auto&v:values)array->values.push_back(coerce(v,type));return Value::array(array);
}
Text changeCase(Text text,bool upper){for(auto&c:text)c=static_cast<char16_t>(upper?std::towupper(c):std::towlower(c));return text;}
int compareText(const Text&a,const Text&b,bool compare){auto x=compare?changeCase(a,false):a,y=compare?changeCase(b,false):b;return x<y?-1:x>y?1:0;}
namespace {
int count(const Value&value){auto n=coerce(value,"long").integral();if(n<0||n>16777216)fail(5);return static_cast<int>(n);}
bool comparison(Frame&f,const Args&args,size_t index){auto v=argument(args,index);auto mode=v.type==Type::Missing?-1:v.integral();if(mode < -1||mode>1)fail(5,"Unsupported comparison mode");return mode==-1?f.module.textCompare:mode==1;}
Value nullString(const Value&value,const std::function<Text()>&fn){if(value.type==Type::Null)return Value::null();return Value::string(fn(),true);}
Value explicitError(Value v){if(v.type==Type::Error)return Value::integer(std::get<int64_t>(v.payload));return v;}
Value preservedNumber(Value source,long double number){
  auto type=source.type;if(type==Type::Empty||type==Type::Boolean)type=Type::Integer;if(type==Type::String)type=Type::Double;
  auto result=coerce(Value::real(static_cast<double>(number)),typeName(Value{type,false,{}}));result.variant=source.variant;return result;
}
struct Collection : Object {
  struct Entry{Value value;Text key;};std::vector<Entry>items;
  std::string className()const override{return "Collection";}
  size_t index(Value v)const{if(v.type==Type::String){auto key=changeCase(v.string(),false);for(size_t i=0;i<items.size();++i)if(!items[i].key.empty()&&changeCase(items[i].key,false)==key)return i;fail(5,"Collection key not found");}auto n=coerce(v,"long").integral();if(n<1||size_t(n)>items.size())fail(5);return size_t(n-1);}
  Value get(Runtime&,const std::string&name)override{if(lower(name)=="count")return Value::integer(items.size());fail(438);}
  Value invoke(Runtime&rt,const std::string&raw,Args args)override{
    auto name=lower(raw);
    if(name.empty()||name=="item"){args=bindNamed(args,"index");return items.at(index(args[0].value)).value;}
    if(name=="add"){
      args=bindNamed(args,"item,key?,before?,after?");auto keyValue=argument(args,1);Text key=keyValue.type==Type::Missing?Text():keyValue.string();
      if(!key.empty())for(auto&entry:items)if(compareText(key,entry.key,true)==0)fail(457);
      size_t position=items.size();auto before=argument(args,2),after=argument(args,3);if(before.type!=Type::Missing&&after.type!=Type::Missing)fail(5);
      if(before.type!=Type::Missing)position=index(before);if(after.type!=Type::Missing)position=index(after)+1;
      items.insert(items.begin()+static_cast<ptrdiff_t>(position),{coerce(args[0].value,"variant"),key});return {};
    }
    if(name=="remove"){args=bindNamed(args,"index");items.erase(items.begin()+static_cast<ptrdiff_t>(index(args[0].value)));return {};}
    return Object::invoke(rt,raw,args);
  }
  std::vector<Value> enumerate(Runtime&)override{std::vector<Value>v;for(auto&e:items)v.push_back(e.value);return v;}
};
struct Dictionary : Object {
  struct Entry{Value key,value;};std::vector<Entry>items;bool textCompare=false;
  std::string className()const override{return "Dictionary";}
  bool supports(const std::string&name)const override{return Object::supports(name)||lower(name)=="scripting.dictionary";}
  void valid(Value key)const{if(key.type==Type::Null)fail(94);if(key.type==Type::Array||key.type==Type::Record||key.type==Type::Missing)fail(13);}
  size_t find(Value key)const{valid(key);for(size_t i=0;i<items.size();++i){auto other=items[i].key;if(key.type==Type::Object&&other.type==Type::Object){if(std::get<ObjectPtr>(key.payload)==std::get<ObjectPtr>(other.payload))return i;}else if(key.type==Type::String&&other.type==Type::String){if(compareText(key.string(),other.string(),textCompare)==0)return i;}else if(key.type!=Type::Object&&other.type!=Type::Object&&key.type!=Type::String&&other.type!=Type::String&&binary("=",key,other).truth())return i;}return items.size();}
  Value get(Runtime&,const std::string&raw)override{auto name=lower(raw);if(name=="count")return Value::integer(items.size());if(name=="comparemode")return Value::integer(textCompare?1:0);fail(438);}
  void set(Runtime&,const std::string&name,Value value,bool)override{if(lower(name)!="comparemode")fail(438);if(!items.empty())fail(5);auto mode=value.integral();if(mode!=0&&mode!=1)fail(5);textCompare=mode==1;}
  Value invoke(Runtime&rt,const std::string&raw,Args args)override{
    auto name=lower(raw);
    if(name.empty()||name=="item"){args=bindNamed(args,"key");auto i=find(args[0].value);if(i==items.size())items.push_back({args[0].value,{}});return items[i].value;}
    if(name=="let:"||name=="set:"||name=="let:item"||name=="set:item"){args=bindNamed(args,"key,item");auto i=find(args[0].value);if(i==items.size())items.push_back({args[0].value,{}});items[i].value=coerce(args[1].value,"variant");return {};}
    if(name=="let:key"){args=bindNamed(args,"key,newkey");auto i=find(args[0].value);if(i==items.size())fail(5);if(find(args[1].value)!=items.size())fail(457);items[i].key=args[1].value;return {};}
    if(name=="add"){args=bindNamed(args,"key,item");if(find(args[0].value)!=items.size())fail(457);items.push_back({args[0].value,coerce(args[1].value,"variant")});return {};}
    if(name=="exists"){args=bindNamed(args,"key");return Value::boolean(find(args[0].value)!=items.size());}
    if(name=="remove"){args=bindNamed(args,"key");auto i=find(args[0].value);if(i==items.size())fail(5);items.erase(items.begin()+static_cast<ptrdiff_t>(i));return {};}
    if(name=="removeall"){if(!args.empty())fail(450);items.clear();return {};}
    if(name=="keys"||name=="items"){if(!args.empty())fail(450);std::vector<Value>values;for(auto&item:items)values.push_back(name=="keys"?item.key:item.value);return arrayValue(values);}
    return Object::invoke(rt,name,args);
  }
  std::vector<Value> enumerate(Runtime&)override{std::vector<Value>keys;for(auto&e:items)keys.push_back(e.key);return keys;}
};
struct ErrObject : Object {
  std::string className()const override{return "ErrObject";}
  Value get(Runtime&rt,const std::string&raw)override{auto name=lower(raw);auto&e=rt.error;if(name.empty()||name=="number")return Value::integer(e.number);if(name=="description")return Value::string(e.description);if(name=="source")return Value::string(e.source);if(name=="helpfile")return Value::string(e.helpFile);if(name=="helpcontext")return Value::integer(e.helpContext);if(name=="lastdllerror")return Value::integer(e.lastDllError);fail(438);}
  void set(Runtime&rt,const std::string&raw,Value v,bool)override{auto name=lower(raw);auto&e=rt.error;if(name.empty()||name=="number"){e.number=static_cast<int32_t>(coerce(v,"long").integral());return;}if(name=="description"){e.description=v.string();return;}if(name=="source"){e.source=v.string();return;}if(name=="helpfile"){e.helpFile=v.string();return;}if(name=="helpcontext"){e.helpContext=static_cast<int32_t>(coerce(v,"long").integral());return;}fail(438);}
  Value invoke(Runtime&rt,const std::string&raw,Args args)override{
    auto name=lower(raw);if(name=="clear"){if(!args.empty())fail(450);rt.error.clear();return {};}
    if(name=="raise"){args=bindNamed(args,"number,source?,description?,helpfile?,helpcontext?");auto n=static_cast<int32_t>(coerce(args[0].value,"long").integral());if(n==0)fail(5);auto description=stringArgument(args,2,errorText(n));rt.error.helpFile=stringArgument(args,3);rt.error.helpContext=static_cast<int32_t>(integerArgument(args,4));throw Error(n,toUTF8(description),toUTF8(stringArgument(args,1)));}
    return Object::invoke(rt,name,args);
  }
};
struct AppObject : Object {
  std::string className()const override{return "App";}
  Value get(Runtime&rt,const std::string&raw)override{auto name=lower(raw);if(name=="title"||name=="exename"||name=="productname")return Value::string(fromUTF8(rt.name));if(name=="major")return Value::integer(1,Type::Integer);if(name=="minor"||name=="revision")return Value::integer(0,Type::Integer);if(name=="path")return Value::string(fromUTF8(rt.executablePath.parent_path().string()));return rt.host->appProperty(rt,name);}
};
}
Value createLibraryObject(Runtime&rt,const std::string&name){
  if(name=="collection"||name=="vb.collection")return Value::object(std::make_shared<Collection>());
  if(name=="dictionary"||name=="scripting.dictionary")return Value::object(std::make_shared<Dictionary>());
  if(name=="scripting.filesystemobject")return createFileObject(name);
  if(name=="err")return Value::object(std::make_shared<ErrObject>());
  if(name=="app")return Value::object(std::make_shared<AppObject>());
  return rt.host->createObject(rt,name);
}
void installBuiltins(Runtime&rt){
  addBuiltin(rt,"Err","",[](Frame&f,Args){return createLibraryObject(f.runtime,"err");},false,true);
  addBuiltin(rt,"App","",[](Frame&f,Args){return createLibraryObject(f.runtime,"app");},false,true);
  for(auto name:{"Screen","Clipboard","Forms","Printer","Printers"})addBuiltin(rt,name,"",[name](Frame&f,Args){return f.runtime.host->createObject(f.runtime,lower(name));},false,true);
  addBuiltin(rt,"Erl","",[](Frame&f,Args){return Value::integer(f.runtime.error.erl);});
  addBuiltin(rt,"Error","errornumber?",[](Frame&f,Args a){return Value::string(errorText(static_cast<int32_t>(integerArgument(a,0,f.runtime.error.number))),true);});
  const std::map<std::string,std::string>conversions={{"CByte","byte"},{"CInt","integer"},{"CLng","long"},{"CSng","single"},{"CDbl","double"},{"CCur","currency"},{"CDec","decimal"},{"CBool","boolean"},{"CStr","string"}};
  for(auto&entry:conversions)addBuiltin(rt,entry.first,"expression",[type=entry.second](Frame&,Args a){return coerce(type=="string"?a[0].value:explicitError(a[0].value),type);});
  addBuiltin(rt,"CVar","expression",[](Frame&,Args a){return coerce(a[0].value,"variant");},false,true);
  addBuiltin(rt,"CVErr","errornumber",[](Frame&,Args a){return Value::integer(a[0].value.integral(),Type::Error,true);});
  addBuiltin(rt,"Abs","number",[](Frame&,Args a){auto v=a[0].value;if(v.type==Type::Null)return v;return v.number()<0?unary("-",v):v;});
  for(auto name:{"Int","Fix"})addBuiltin(rt,name,"number",[name](Frame&,Args a){auto v=a[0].value;if(v.type==Type::Null)return v;if(v.type==Type::Decimal){auto d=std::get<Decimal>(v.payload);unsigned __int128 divisor=1;for(int i=0;i<d.scale;i++)divisor*=10;auto remainder=d.coefficient%divisor;d.coefficient/=divisor;d.scale=0;if(name==std::string("Int")&&d.negative&&remainder)++d.coefficient;return Value::decimal(d);}auto n=v.number();return preservedNumber(v,name==std::string("Int")?std::floor(n):std::trunc(n));});
  addBuiltin(rt,"Sgn","number",[](Frame&,Args a){if(a[0].value.type==Type::Null)return Value::null();auto n=a[0].value.number();return Value::integer(n<0?-1:n>0?1:0,Type::Integer);});
  for(auto name:{"Sqr","Sin","Cos","Tan","Atn","Log","Exp"})addBuiltin(rt,name,"number",[name](Frame&,Args a){auto n=a[0].value.floating();std::string key=name;if((key=="Sqr"&&n<0)||(key=="Log"&&n<=0))fail(5);return Value::real(key=="Sqr"?std::sqrt(n):key=="Sin"?std::sin(n):key=="Cos"?std::cos(n):key=="Tan"?std::tan(n):key=="Atn"?std::atan(n):key=="Log"?std::log(n):std::exp(n));});
  addBuiltin(rt,"Round","number,numdigitsafterdecimal?",[](Frame&,Args a){auto v=a[0].value;if(v.type==Type::Null)return v;auto digits=integerArgument(a,1);if(digits<0||digits>28)fail(5);if(v.type==Type::Currency||v.type==Type::Decimal){auto d=Decimal::parse(v.string());if(digits<d.scale){unsigned __int128 divisor=1;for(int i=0;i<d.scale-digits;++i)divisor*=10;auto n=d.coefficient/divisor,r=d.coefficient%divisor;if(r>divisor/2||(r==divisor/2&&(n&1)))++n;d.coefficient=n;d.scale=static_cast<uint8_t>(digits);}return v.type==Type::Currency?Value::currency(d.string()):Value::decimal(d);}auto factor=std::pow(10.0L,digits);if(std::abs(v.number()*factor)>=9223372036854775808.0L)return v;return preservedNumber(v,bankers(v.number()*factor)/factor);});
  addBuiltin(rt,"Rnd","number?",[](Frame&f,Args a){auto n=argument(a,0,Value::integer(1)).floating();if(n<0){uint64_t seed=static_cast<uint64_t>(std::fmod(-n*16777216.0,4294967296.0));f.runtime.randomSeed=static_cast<uint32_t>(seed);}if(n!=0){f.runtime.randomSeed=f.runtime.randomSeed*1664525u+1013904223u;f.runtime.lastRandom=f.runtime.randomSeed/4294967296.0;}return Value::real(f.runtime.lastRandom,Type::Single);});
  addBuiltin(rt,"Randomize","number?",[](Frame&f,Args a){auto v=argument(a,0);double n=v.type==Type::Missing?std::chrono::duration<double,std::milli>(std::chrono::system_clock::now().time_since_epoch()).count():v.floating()*1000000.0;f.runtime.randomSeed=static_cast<uint32_t>(static_cast<uint64_t>(std::fmod(std::abs(n),4294967296.0)));return Value{};});
  for(auto name:{"IsArray","IsEmpty","IsNull","IsNumeric","IsObject","IsMissing","IsError"})addBuiltin(rt,name,"expression",[name](Frame&,Args a){auto v=a[0].value;std::string key=name;return Value::boolean(key=="IsArray"?v.type==Type::Array:key=="IsEmpty"?v.type==Type::Empty:key=="IsNull"?v.type==Type::Null:key=="IsObject"?v.type==Type::Object:key=="IsMissing"?v.type==Type::Missing:key=="IsError"?v.type==Type::Error:v.isNumeric());},false,true);
  // Missing is a valid value for IsMissing, unlike an omitted required call argument.
  rt.builtins["ismissing"]=[](Frame&,Args a){if(a.size()!=1)fail(450);return Value::boolean(a[0].value.type==Type::Missing);};
  addBuiltin(rt,"TypeName","varname",[](Frame&,Args a){return Value::string(fromUTF8(typeName(a[0].value)));},false,true);
  addBuiltin(rt,"VarType","varname",[](Frame&,Args a){auto v=a[0].value;auto code=v.type==Type::Array?8192+int(typeCode(v.asArray()->elementType)):int(v.type);if(v.type==Type::Missing)code=10;if(v.type==Type::Record)code=36;return Value::integer(code,Type::Integer);},false,true);
  addBuiltin(rt,"IIf","expr,truepart,falsepart",[](Frame&f,Args a){return coerce(scalar(f.runtime,a[0].value).truth()?a[1].value:a[2].value,"variant");},false,true);
  addBuiltin(rt,"Choose","index",[](Frame&f,Args a){auto n=scalar(f.runtime,a[0].value).integral();return n>0&&size_t(n)<a.size()?coerce(a[size_t(n)].value,"variant"):Value::null();},true,true);
  addBuiltin(rt,"Switch","",[](Frame&f,Args a){if(a.size()%2)fail(450);for(size_t i=0;i<a.size();i+=2)if(scalar(f.runtime,a[i].value).truth())return coerce(a[i+1].value,"variant");return Value::null();},true,true);
  addBuiltin(rt,"Array","",[](Frame&f,Args a){std::vector<Value>values;for(auto&arg:a)values.push_back(arg.value);return arrayValue(values,f.module.optionBase);},true,true);
  for(auto name:{"LBound","UBound"})addBuiltin(rt,name,"arrayname,dimension?",[name](Frame&,Args a){auto array=a[0].value.asArray();auto dimension=integerArgument(a,1,1);if(dimension<1||size_t(dimension)>array->bounds.size()||!array->allocated)fail(9);auto bounds=array->bounds[size_t(dimension-1)];return Value::integer(std::string(name)=="LBound"?bounds.first:bounds.second);},false,true);
  for(auto name:{"Len","LenB"})addBuiltin(rt,name,"expression",[name](Frame&,Args a){auto v=a[0].value;bool bytes=std::string(name)=="LenB";if(v.type==Type::Null)return v;if(v.type==Type::Record)return Value::integer(recordByteLength(v,bytes));if(v.type==Type::Array)fail(13);if(v.type==Type::String||v.variant||v.type==Type::Empty)return Value::integer(v.string().size()*(bytes?2:1));switch(v.type){case Type::Byte:return Value::integer(1);case Type::Integer:case Type::Boolean:return Value::integer(2);case Type::Long:case Type::Single:return Value::integer(4);case Type::Currency:case Type::Double:case Type::Date:return Value::integer(8);case Type::Decimal:case Type::Error:return Value::integer(16);default:fail(13);}});
  for(auto name:{"Left","Right"})addBuiltin(rt,name,"string,length",[name](Frame&,Args a){auto v=a[0].value;int n=count(a[1].value);return nullString(v,[&]{Text s=v.string();auto len=std::min(s.size(),size_t(n));return s.substr(std::string(name)=="Left"?0:s.size()-len,len);});});
  addBuiltin(rt,"Mid","string,start,length?",[](Frame&,Args a){auto v=a[0].value;auto start=integerArgument(a,1);if(start<1)fail(5);auto length=argument(a,2);size_t len=length.type==Type::Missing?Text::npos:size_t(count(length));return nullString(v,[&]{auto s=v.string();return size_t(start)>s.size()?Text():s.substr(size_t(start-1),len);});});
  for(auto name:{"Trim","LTrim","RTrim","LCase","UCase"})addBuiltin(rt,name,"string",[name](Frame&,Args a){auto v=a[0].value;return nullString(v,[&]{Text s=v.string();std::string op=name;if(op=="LCase"||op=="UCase")return changeCase(s,op=="UCase");size_t first=op=="RTrim"?0:s.find_first_not_of(u' ');if(first==Text::npos)return Text();size_t last=op=="LTrim"?s.size():s.find_last_not_of(u' ')+1;return s.substr(first,last-first);});});
  addBuiltin(rt,"Space","number",[](Frame&,Args a){return Value::string(Text(count(a[0].value),u' '),true);});
  addBuiltin(rt,"String","number,character",[](Frame&,Args a){int n=count(a[0].value);auto character=a[1].value;char16_t c;if(character.type==Type::String){auto s=character.string();if(s.empty())fail(5);c=s[0];}else{auto value=coerce(character,"long").integral();if(value<0||value>255)fail(5);c=char16_t(value);}return Value::string(Text(n,c),true);});
  for(auto name:{"Chr","ChrW"})addBuiltin(rt,name,"charcode",[name](Frame&,Args a){auto n=a[0].value.integral();bool wide=std::string(name)=="ChrW";if(wide?(n<-32768||n>65535):(n<0||n>255))fail(5);return Value::string(Text(1,char16_t(n)),true);});
  for(auto name:{"Asc","AscW"})addBuiltin(rt,name,"string",[name](Frame&,Args a){auto s=a[0].value.string();if(s.empty())fail(5);int n=s[0];if(std::string(name)=="AscW")return Value::integer(n>=32768?n-65536:n,Type::Integer);if(n>255)n=63;return Value::integer(n,Type::Integer);});
  addBuiltin(rt,"StrReverse","expression",[](Frame&,Args a){auto s=a[0].value.string();std::reverse(s.begin(),s.end());return Value::string(s);});
  addBuiltin(rt,"StrConv","string,conversion",[](Frame&,Args a){auto mode=integerArgument(a,1);auto s=a[0].value.string();if(mode==1||mode==2)return Value::string(changeCase(s,mode==1),true);if(mode==3){s=changeCase(s,false);bool start=true;for(auto&c:s){if(start)c=static_cast<char16_t>(std::towupper(c));start=!std::iswalnum(c);}return Value::string(s,true);}if(mode==128){std::vector<Value>values;for(auto c:s)values.push_back(Value::integer(c<=255?c:63,Type::Byte));return arrayValue(values,0,"byte");}fail(5,"StrConv conversion is not implemented for this locale");});
  addBuiltin(rt,"StrComp","string1,string2,compare?",[](Frame&f,Args a){if(a[0].value.type==Type::Null||a[1].value.type==Type::Null)return Value::null();return Value::integer(compareText(a[0].value.string(),a[1].value.string(),comparison(f,a,2)),Type::Integer,true);});
  rt.builtins["instr"]=[](Frame&f,Args a){if(a.size()<2||a.size()>4)fail(450);bool hasName=std::any_of(a.begin(),a.end(),[](auto&a){return !a.name.empty();});if(hasName)a=bindNamed(a,"start?,string1,string2,compare?");else if(a.size()==2||(a.size()==3&&a[0].value.type==Type::String)){a.insert(a.begin(),Arg(Value::integer(1)));}auto start=integerArgument(a,0,1);if(start<1)fail(5);auto s=argument(a,1),find=argument(a,2);if(s.type==Type::Null||find.type==Type::Null)return Value::null();auto text=s.string(),part=find.string();if(comparison(f,a,3)){text=changeCase(text,false);part=changeCase(part,false);}auto pos=size_t(start-1)>text.size()?Text::npos:text.find(part,size_t(start-1));return Value::integer(pos==Text::npos?0:pos+1);};
  addBuiltin(rt,"InStrRev","stringcheck,stringmatch,start?,compare?",[](Frame&f,Args a){auto text=a[0].value.string(),part=a[1].value.string();auto start=integerArgument(a,2,-1);if(start==0||start < -1)fail(5);if(start==-1)start=text.size();if(size_t(start)>text.size()||part.size()>size_t(start))return Value::integer(0);if(comparison(f,a,3)){text=changeCase(text,false);part=changeCase(part,false);}auto pos=text.rfind(part,size_t(start)-part.size());return Value::integer(pos==Text::npos?0:pos+1);});
  addBuiltin(rt,"Replace","expression,find,replace,start?,count?,compare?",[](Frame&f,Args a){auto text=a[0].value.string(),find=a[1].value.string(),replace=a[2].value.string();auto start=integerArgument(a,3,1),limit=integerArgument(a,4,-1);if(start<1||limit < -1)fail(5);if(size_t(start)>text.size())return Value::string(u"");text=text.substr(size_t(start-1));if(find.empty()||limit==0)return Value::string(text);bool compare=comparison(f,a,5);auto scan=compare?changeCase(text,false):text,needle=compare?changeCase(find,false):find;Text out;size_t last=0,pos=0;int64_t done=0;while((limit<0||done<limit)&&(pos=scan.find(needle,last))!=Text::npos){out+=text.substr(last,pos-last);out+=replace;last=pos+find.size();++done;if(out.size()>16777216)fail(14);}out+=text.substr(last);return Value::string(out);});
  addBuiltin(rt,"Split","expression,delimiter?,limit?,compare?",[](Frame&f,Args a){auto text=a[0].value.string(),delimiter=stringArgument(a,1,u" ");auto limit=integerArgument(a,2,-1);if(limit < -1)fail(5);std::vector<Value>out;if(text.empty()||limit==0)return arrayValue(out,0,"string");if(delimiter.empty()||limit==1)return arrayValue({Value::string(text)},0,"string");bool compare=comparison(f,a,3);auto scan=compare?changeCase(text,false):text,needle=compare?changeCase(delimiter,false):delimiter;size_t pos,last=0;while((limit<0||int64_t(out.size())<limit-1)&&(pos=scan.find(needle,last))!=Text::npos){out.push_back(Value::string(text.substr(last,pos-last)));last=pos+delimiter.size();if(out.size()>=f.runtime.maxArrayElements)fail(7);}out.push_back(Value::string(text.substr(last)));return arrayValue(out,0,"string");});
  addBuiltin(rt,"Join","sourcearray,delimiter?",[](Frame&,Args a){auto array=a[0].value.asArray();if(array->bounds.size()!=1)fail(5);auto delimiter=stringArgument(a,1,u" ");Text out;for(auto&v:array->values){if(&v!=&array->values.front())out+=delimiter;out+=v.string();if(out.size()>16777216)fail(14);}return Value::string(out);},false,true);
  addBuiltin(rt,"Filter","sourcearray,match,include?,compare?",[](Frame&f,Args a){auto array=a[0].value.asArray();if(array->bounds.size()!=1)fail(5);auto match=a[1].value.string();bool include=argument(a,2,Value::boolean(true)).truth(),compare=comparison(f,a,3);if(compare)match=changeCase(match,false);std::vector<Value>out;for(auto&v:array->values){auto s=v.string(),check=compare?changeCase(s,false):s;if((check.find(match)!=Text::npos)==include)out.push_back(Value::string(s));}return arrayValue(out,0,"string");},false,true);
  addBuiltin(rt,"Val","string",[](Frame&,Args a){std::string s=toUTF8(a[0].value.string());s.erase(std::remove_if(s.begin(),s.end(),[](unsigned char c){return std::isspace(c);}),s.end());if(s.size()>2&&s[0]=='&'&&(s[1]=='H'||s[1]=='h'||s[1]=='O'||s[1]=='o')){char*end=nullptr;unsigned long long n=std::strtoull(s.c_str()+2,&end,s[1]=='h'||s[1]=='H'?16:8);if(end==s.c_str()+2)return Value::real(0);if(n>UINT32_MAX)fail(6);return Value::real(n>INT32_MAX?double(int64_t(n)-4294967296LL):double(n));}char*end=nullptr;double n=std::strtod(s.c_str(),&end);return Value::real(end==s.c_str()?0:n);});
  addBuiltin(rt,"Str","number",[](Frame&,Args a){auto v=a[0].value;auto s=v.string();if(v.number()>=0)s.insert(0,1,u' ');return Value::string(s,true);});
  for(auto name:{"Hex","Oct"})addBuiltin(rt,name,"number",[name](Frame&,Args a){auto v=a[0].value;auto n=static_cast<uint32_t>(coerce(v,"long").integral());if(v.type==Type::Integer)n&=65535;std::ostringstream out;out<<std::uppercase<<(std::string(name)=="Hex"?std::hex:std::oct)<<n;return Value::string(fromUTF8(out.str()),true);});
  addBuiltin(rt,"RGB","red,green,blue",[](Frame&,Args a){uint32_t color=0;for(int i=0;i<3;i++){auto n=a[size_t(i)].value.integral();if(n<0)fail(5);color|=uint32_t(std::min<int64_t>(n,255))<<(i*8);}return Value::integer(color);});
  addBuiltin(rt,"QBColor","color",[](Frame&,Args a){constexpr int colors[]={0,8388608,32768,8421376,128,8388736,32896,12632256,8421504,16711680,65280,16776960,255,16711935,65535,16777215};auto index=integerArgument(a,0);if(index<0||index>15)fail(5);return Value::integer(colors[index]);});
  addBuiltin(rt,"CreateObject","class",[](Frame&f,Args a){return f.runtime.create(toUTF8(a[0].value.string()));});
  addBuiltin(rt,"CallByName","object,procname,calltype",[](Frame&f,Args a){auto target=a[0].value.asObject();auto name=toUTF8(a[1].value.string());auto type=a[2].value.integral();Args rest(a.begin()+3,a.end());if(type==1||type==2)return coerce(target->invoke(f.runtime,name,rest),"variant");if(type==4||type==8){if(rest.empty())fail(450);if(rest.size()==1)target->set(f.runtime,name,rest[0].value,type==8);else target->invoke(f.runtime,(type==8?"set:":"let:")+name,rest);return Value{};}fail(5);},true,true);
  addBuiltin(rt,"DoEvents","",[](Frame&f,Args){f.runtime.host->pump();return Value::integer(0,Type::Integer);});
  addBuiltin(rt,"Command","",[](Frame&f,Args){Text out;for(auto&arg:f.runtime.commandLine){if(!out.empty())out+=u' ';out+=fromUTF8(arg);}return Value::string(out);});
  addBuiltin(rt,"Environ","expression?",[](Frame&,Args a){auto name=argument(a,0);if(name.type!=Type::String)fail(5,"Environ requires an environment variable name");std::string key=toUTF8(name.string());if(key.find('\0')!=std::string::npos||key.find('=')!=std::string::npos)fail(5);const char*value=std::getenv(key.c_str());return Value::string(value?fromUTF8(value):Text{});});
  const std::map<std::string,std::string>hostFunctions={{"MsgBox","prompt,buttons?,title?,helpfile?,context?"},{"InputBox","prompt,title?,default?,xpos?,ypos?,helpfile?,context?"},{"Beep",""},{"Shell","pathname,windowstyle?"},{"LoadPicture","filename?"},{"SavePicture","picture,filename"},{"SaveSetting","appname,section,key,setting"},{"GetSetting","appname,section,key,default?"},{"DeleteSetting","appname,section,key?"},{"GetAllSettings","appname,section"}};
  for(auto&entry:hostFunctions)addBuiltin(rt,entry.first,entry.second,[name=lower(entry.first)](Frame&f,Args args){return f.runtime.host->builtin(f,name,args);},false,entry.first=="SavePicture");
  installCalendarBuiltins(rt);
  for(auto name:{"Error","Left","Right","Mid","Trim","LTrim","RTrim","UCase","LCase","Space","String","Chr","ChrW","Str","Hex","Oct","Format","Input","Dir","Environ","Command"}){auto base=rt.builtins.find(lower(name));if(base!=rt.builtins.end())rt.builtins[lower(name)+"$"]=[fn=base->second](Frame&f,Args a){auto v=fn(f,std::move(a));if(v.type==Type::Null)fail(94);v.variant=false;return v;};}
}
} // namespace vb6
