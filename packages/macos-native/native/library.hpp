#pragma once
#include "vb6.hpp"
namespace vb6 {
using Builtin=std::function<Value(Frame&,Args)>;
Args bindNamed(Args args,const std::string& signature,bool variadic=false);
void addBuiltin(Runtime&,const std::string&name,const std::string&signature,Builtin,bool variadic=false,bool raw=false);
Value createFileObject(const std::string&);
Value argument(const Args&,size_t,Value fallback=Value::missing());
int64_t integerArgument(const Args&,size_t,int64_t fallback=0);
Text stringArgument(const Args&,size_t,Text fallback={});
Value arrayValue(std::vector<Value>,int lowerBound=0,const std::string& type="variant");
Text changeCase(Text,bool upper);
int compareText(const Text&,const Text&,bool textCompare);
void installCalendarBuiltins(Runtime&);
Value parseDate(Value);
Text formatDate(Value,const Text&format);
Text formatValue(Value,const Text&format);
size_t recordByteLength(const Value&,bool padded=false);
}
