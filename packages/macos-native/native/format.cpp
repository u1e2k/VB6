#include "library.hpp"
#include "calendar.hpp"
#include <iomanip>
#include <sstream>
namespace vb6 {
namespace {
std::vector<Text> sections(const Text&format){std::vector<Text> out(1);bool quote=false;for(size_t i=0;i<format.size();++i){char16_t c=format[i];if(c==u'\\'&&i+1<format.size()){out.back()+=c;out.back()+=format[++i];continue;}if(c==u'"')quote=!quote;if(c==u';'&&!quote)out.emplace_back();else out.back()+=c;}return out;}
Text literal(const Text&text){Text out;bool quote=false;for(size_t i=0;i<text.size();++i){auto c=text[i];if(c==u'"'){quote=!quote;continue;}if(c==u'\\'&&i+1<text.size()){out+=text[++i];continue;}out+=c;}(void)quote;return out;}
Text groupDigits(Text text){auto sign=text.size()&&(text[0]==u'-'||text[0]==u'+')?1u:0u;for(size_t at=text.size();at>sign+3;){at-=3;text.insert(at,1,u',');}return text;}
Text scientific(long double value,const Text&pattern){auto at=pattern.find_first_of(u"Ee");auto mantissa=pattern.substr(0,at);auto dot=mantissa.find(u'.');int digits=dot==Text::npos?0:int(mantissa.size()-dot-1);auto exponentPattern=pattern.substr(at+1);bool positive=!exponentPattern.empty()&&exponentPattern[0]==u'+';size_t width=std::count(exponentPattern.begin(),exponentPattern.end(),u'0');if(digits>28||width>10)fail(5);std::ostringstream stream;stream.imbue(std::locale::classic());stream<<std::scientific<<std::setprecision(digits)<<static_cast<double>(value);auto s=stream.str();auto split=s.find('e');int exp=std::stoi(s.substr(split+1));std::ostringstream e;e<<std::setfill('0')<<std::setw(int(width))<<std::abs(exp);return fromUTF8(s.substr(0,split))+pattern[at]+(exp<0?u"-":positive?u"+":u"")+fromUTF8(e.str());}
}
Text formatValue(Value value,const Text&format){
  if(format.size()>4096)fail(5,"Format string exceeds 4096 characters");if(format.empty())return value.type==Type::Null?Text():value.string();
  auto all=sections(format);if(value.type==Type::Null)return all.size()>3?literal(all[3]):Text();
  auto key=lower(toUTF8(format));
  if(key=="yes/no")return value.truth()?u"Yes":u"No";if(key=="true/false")return value.truth()?u"True":u"False";if(key=="on/off")return value.truth()?u"On":u"Off";
  if(key=="currency")return formatValue(value,u"$#,##0.00;($#,##0.00)");if(key=="fixed")return formatValue(value,u"0.00");if(key=="standard")return formatValue(value,u"#,##0.00");if(key=="percent")return formatValue(value,u"0.00%");if(key=="scientific")return formatValue(value,u"0.00E+00");if(key=="general number")return value.string();
  if(value.type==Type::Date||key.find("date")!=std::string::npos||key.find("time")!=std::string::npos||(format.find_first_of(u"ydhnsYDHNS")!=Text::npos&&format.find_first_of(u"0#") ==Text::npos))return formatDate(value,format);
  if(value.type==Type::String&&format.find_first_of(u"@&<>!")!=Text::npos){
    Text input=value.string(),pattern=input.empty()&&all.size()>1?all[1]:all[0];if(pattern.find(u'<')!=Text::npos)input=changeCase(input,false);if(pattern.find(u'>')!=Text::npos)input=changeCase(input,true);
    size_t slots=std::count(pattern.begin(),pattern.end(),u'@')+std::count(pattern.begin(),pattern.end(),u'&');bool left=pattern.find(u'!')!=Text::npos;size_t padding=!left&&slots>input.size()?slots-input.size():0,pos=0;Text output;bool quote=false;
    for(size_t i=0;i<pattern.size();++i){auto c=pattern[i];if(c==u'"'){quote=!quote;continue;}if(c==u'\\'&&i+1<pattern.size()){output+=pattern[++i];continue;}if(!quote&&(c==u'<'||c==u'>'||c==u'!'))continue;if(!quote&&(c==u'@'||c==u'&')){if(padding){--padding;if(c==u'@')output+=u' ';}else if(pos<input.size())output+=input[pos++];else if(c==u'@')output+=u' ';}else output+=c;}
    if(pos<input.size())output+=input.substr(pos);return output;
  }
  long double n=value.number();auto pattern=n<0&&all.size()>1?all[1]:n==0&&all.size()>2?all[2]:all[0];if(pattern.empty())pattern=all[0];bool explicitNegative=n<0&&all.size()>1;if(explicitNegative)n=std::abs(n);
  size_t first=Text::npos,last=0,decimal=Text::npos;bool quote=false;int percent=0;
  for(size_t i=0;i<pattern.size();++i){auto c=pattern[i];if(c==u'\\'){++i;continue;}if(c==u'"'){quote=!quote;continue;}if(quote)continue;if(c==u'0'||c==u'#'){if(first==Text::npos)first=i;last=i;}if(c==u'.')decimal=i;if(c==u'%')++percent;}
  if(first==Text::npos)return literal(pattern);for(int i=0;i<percent;++i)n*=100;
  if(pattern.find_first_of(u"Ee",first)!=Text::npos)return scientific(n,pattern);
  size_t end=last+1,scales=0;while(end<pattern.size()&&pattern[end]==u','){++scales;++end;}for(size_t i=0;i<scales;i++)n/=1000;
  bool grouping=pattern.substr(first,(decimal==Text::npos?last+1:decimal)-first).find(u',')!=Text::npos;
  size_t digits=0,required=0;if(decimal!=Text::npos&&decimal<last){for(size_t i=decimal+1;i<=last;i++){if(pattern[i]==u'0'||pattern[i]==u'#')++digits;if(pattern[i]==u'0')required=digits;}}
  if(digits>28)fail(5);std::ostringstream stream;stream.imbue(std::locale::classic());stream<<std::fixed<<std::setprecision(int(digits))<<n;Text text=fromUTF8(stream.str());auto dot=text.find(u'.');
  if(dot!=Text::npos){while(text.size()>dot+1+required&&text.back()==u'0')text.pop_back();if(text.back()==u'.')text.pop_back();}
  dot=text.find(u'.');Text whole=text.substr(0,dot),fraction=dot==Text::npos?Text():text.substr(dot);
  size_t zeroes=std::count(pattern.begin()+static_cast<ptrdiff_t>(first),pattern.begin()+static_cast<ptrdiff_t>(decimal==Text::npos?last+1:decimal),u'0');auto sign=whole.size()&&whole[0]==u'-'?1u:0u;if(whole.size()-sign<zeroes)whole.insert(sign,zeroes-(whole.size()-sign),u'0');if(!zeroes&&whole.substr(sign)==u"0")whole=sign?u"-":u"";
  if(grouping)whole=groupDigits(whole);return literal(pattern.substr(0,first))+whole+fraction+literal(pattern.substr(end));
}
}
