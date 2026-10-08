// Explicit VB file representation, independent of host byte order and LP64 ABI.
#pragma once
#include "vb6.hpp"
namespace vb6 {
using Bytes=std::vector<uint8_t>;
constexpr size_t MaxRecordBytes=20*1024*1024;
Bytes encodeANSI(const Text&);
Text decodeANSI(const uint8_t*,size_t);
inline Text decodeANSI(const Bytes& bytes){return decodeANSI(bytes.data(),bytes.size());}
struct FileSchema { std::string type="variant"; size_t fixedLength=0; bool array=false; };
Bytes encodeVariable(Value,FileSchema,const std::string& mode);
std::pair<Value,size_t> decodeVariable(const Bytes&,FileSchema,Value,const std::string& mode,size_t maxArrayElements);
std::pair<Value,size_t> readInputField(const Text&,size_t,const std::string&);
Text writeInputValue(const Value&);
}
