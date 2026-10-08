// Gregorian civil time and OLE DATE. Civil values are not UTC instants.
#include "calendar.hpp"
#include <ctime>
#include <iomanip>
#include <regex>
#include <sstream>
namespace vb6 {
namespace {
constexpr int64_t dayMillis=86400000;
int64_t floorDiv(int64_t n,int64_t d){auto q=n/d,r=n%d;return q-(r<0);}
int mod(int64_t n,int d){return static_cast<int>((n%d+d)%d);}
bool leap(int y){return y%4==0&&(y%100!=0||y%400==0);}
int64_t beforeYear(int y){int64_t n=y-1;return 365*n+floorDiv(n,4)-floorDiv(n,100)+floorDiv(n,400);}
constexpr const char* months[]={"January","February","March","April","May","June","July","August","September","October","November","December"};
constexpr const char* weekdays[]={"Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"};
Text number(int64_t n,int width=0){std::ostringstream out;out<<std::setfill('0')<<std::setw(width)<<n;return fromUTF8(out.str());}
Text dateText(CivilTime d){return number(d.month)+u"/"+number(d.day)+u"/"+number(d.year,4);}
Text timeText(CivilTime d,bool seconds=true){return number(d.hour%12?d.hour%12:12)+u":"+number(d.minute,2)+(seconds?u":"+number(d.second,2):Text{})+(d.hour<12?u" AM":u" PM");}
}
int monthDays(int year,int month){static constexpr int days[]={31,28,31,30,31,30,31,31,30,31,30,31};if(month<1||month>12)fail(5);return days[month-1]+(month==2&&leap(year));}
int64_t civilOrdinal(int year,int month,int day){
  static constexpr int before[]={0,31,59,90,120,151,181,212,243,273,304,334};
  int64_t y=year+floorDiv(int64_t(month)-1,12);int m=mod(int64_t(month)-1,12)+1;
  if(y < -100000||y>100000)fail(5);return beforeYear(static_cast<int>(y))+before[m-1]+(m>2&&leap(static_cast<int>(y)))+day-1-(beforeYear(1899)+334+29);
}
CivilTime civilFromOrdinal(int64_t ordinal){
  if(ordinal<civilOrdinal(100,1,1)||ordinal>civilOrdinal(9999,12,31))fail(5);
  int lo=100,hi=10000;while(lo+1<hi){int mid=lo+(hi-lo)/2;if(civilOrdinal(mid,1,1)<=ordinal)lo=mid;else hi=mid;}
  CivilTime d;d.year=lo;d.month=1;auto rest=ordinal-civilOrdinal(lo,1,1);while(rest>=monthDays(lo,d.month)){rest-=monthDays(lo,d.month);++d.month;}d.day=static_cast<int>(rest)+1;return d;
}
Value civilDate(CivilTime d){
  if(d.year<100||d.year>9999||d.month<1||d.month>12||d.day<1||d.day>monthDays(d.year,d.month)||d.hour<0||d.hour>23||d.minute<0||d.minute>59||d.second<0||d.second>59||d.millisecond<0||d.millisecond>999)fail(5);
  auto day=civilOrdinal(d.year,d.month,d.day);double fraction=(d.hour*3600000+d.minute*60000+d.second*1000+d.millisecond)/double(dayMillis);
  return Value::real(day<0?double(day)-fraction:double(day)+fraction,Type::Date);
}
CivilTime civilTime(Value date){
  if(date.type!=Type::Date)date=parseDate(date);double serial=date.floating();auto ordinal=static_cast<int64_t>(std::trunc(serial));auto millis=static_cast<int64_t>(std::round(std::abs(serial-double(ordinal))*dayMillis));
  if(millis==dayMillis){++ordinal;millis=0;}auto d=civilFromOrdinal(ordinal);d.hour=static_cast<int>(millis/3600000);d.minute=static_cast<int>(millis/60000%60);d.second=static_cast<int>(millis/1000%60);d.millisecond=static_cast<int>(millis%1000);return d;
}
CivilTime currentCivilTime(){
  auto now=std::chrono::system_clock::now();auto seconds=std::chrono::system_clock::to_time_t(now);std::tm local{};if(!localtime_r(&seconds,&local))fail(5);
  auto millis=std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();return {local.tm_year+1900,local.tm_mon+1,local.tm_mday,local.tm_hour,local.tm_min,local.tm_sec,int((millis%1000+1000)%1000)};
}
Value parseDate(Value value){
  if(value.type==Type::Null)fail(94);if(value.type==Type::Date)return value;
  if(value.type!=Type::String){if(value.type==Type::Boolean||value.type==Type::Object||value.type==Type::Error||value.type==Type::Array||value.type==Type::Record)fail(13);return Value::real(value.floating(),Type::Date);}
  std::string text=toUTF8(value.string());auto begin=text.find_first_not_of(" \t\r\n"),end=text.find_last_not_of(" \t\r\n");if(begin==std::string::npos)fail(13);text=text.substr(begin,end-begin+1);
  static const std::regex iso(R"(^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$)");
  static const std::regex us(R"(^(\d{1,2})/(\d{1,2})/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$)",std::regex::icase);
  static const std::regex time(R"(^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)?$)",std::regex::icase);
  static const std::regex shortDate(R"(^(\d{1,2})[\/,](\d{1,2})$)");
  static const std::regex named(R"(^(?:([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})|(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4}))$)");
  std::smatch m;CivilTime d;auto n=[&](size_t i,int fallback=0){return m[i].matched?std::stoi(m[i].str()):fallback;};auto ampm=[&](const std::string&suffix){if(!suffix.empty()){if(d.hour<1||d.hour>12)fail(13);d.hour=d.hour%12+(lower(suffix)=="pm"?12:0);}};
  if(std::regex_match(text,m,iso)){d.year=n(1);d.month=n(2);d.day=n(3);d.hour=n(4);d.minute=n(5);d.second=n(6);std::string fraction=m[7].str();if(!fraction.empty()){fraction.resize(3,'0');d.millisecond=std::stoi(fraction);}}
  else if(std::regex_match(text,m,us)){d.month=n(1);d.day=n(2);d.year=n(3);if(d.year<100)d.year+=d.year<30?2000:1900;d.hour=n(4);d.minute=n(5);d.second=n(6);ampm(m[7].str());}
  else if(std::regex_match(text,m,time)){d.hour=n(1);d.minute=n(2);d.second=n(3);std::string fraction=m[4].str();if(!fraction.empty()){fraction.resize(3,'0');d.millisecond=std::stoi(fraction);}ampm(m[5].str());}
  else if(std::regex_match(text,m,shortDate)){d.year=currentCivilTime().year;d.month=n(1);d.day=n(2);}
  else if(std::regex_match(text,m,named)){auto month=lower(m[1].matched?m[1].str():m[5].str());d.day=m[1].matched?n(2):n(4);d.year=m[1].matched?n(3):n(6);if(d.year<100)d.year+=d.year<30?2000:1900;d.month=0;for(int i=0;i<12;++i){auto name=lower(months[i]);if(month==name||month==name.substr(0,3))d.month=i+1;}if(!d.month)fail(13);}
  else fail(13,"Unrecognized civil date; use ISO 8601 or month/day/year");
  try{return civilDate(d);}catch(const Error&){fail(13,"Invalid civil date");}
}
int64_t civilMilliseconds(CivilTime d){return civilOrdinal(d.year,d.month,d.day)*dayMillis+d.hour*3600000+d.minute*60000+d.second*1000+d.millisecond;}
Value dateFromMilliseconds(int64_t millis){auto day=floorDiv(millis,dayMillis),rest=millis-day*dayMillis;auto d=civilFromOrdinal(day);d.hour=static_cast<int>(rest/3600000);d.minute=static_cast<int>(rest/60000%60);d.second=static_cast<int>(rest/1000%60);d.millisecond=static_cast<int>(rest%1000);return civilDate(d);}
int firstWeekDay(int64_t n){if(n<0||n>7)fail(5);return int(n?n:1)-1;}
int firstWeekRule(int64_t n){if(n<0||n>3)fail(5);return int(n?n:1);}
int64_t weekStart(int64_t ordinal,int first){return ordinal-mod(mod(ordinal+6,7)-first,7);}
int64_t firstYearWeek(int year,int first,int rule){auto jan=civilOrdinal(year,1,1),start=weekStart(jan,first);return rule==1?start:rule==2?(jan-start<=3?start:start+7):(jan==start?start:start+7);}
std::string dateInterval(const Value&v){auto text=lower(toUTF8(v.string()));if(text!="yyyy"&&text!="q"&&text!="m"&&text!="y"&&text!="d"&&text!="w"&&text!="ww"&&text!="h"&&text!="n"&&text!="s")fail(5,"Invalid date interval");return text;}
Value addDate(const std::string&interval,int64_t count,Value value){
  if(count<INT32_MIN||count>INT32_MAX)fail(6);auto d=civilTime(value);
  if(interval=="yyyy"||interval=="q"||interval=="m"){auto months=int64_t(d.year)*12+d.month-1+count*(interval=="yyyy"?12:interval=="q"?3:1);auto year=floorDiv(months,12);if(year<100||year>9999)fail(5);d.year=static_cast<int>(year);d.month=mod(months,12)+1;d.day=std::min(d.day,monthDays(d.year,d.month));return civilDate(d);}
  int64_t unit=interval=="ww"?7*dayMillis:interval=="h"?3600000:interval=="n"?60000:interval=="s"?1000:dayMillis;return dateFromMilliseconds(civilMilliseconds(d)+count*unit);
}
int64_t diffDate(const std::string&part,Value left,Value right,int first,int){
  auto a=civilTime(left),b=civilTime(right);if(part=="yyyy")return b.year-a.year;if(part=="q")return (b.year-a.year)*4+(b.month-1)/3-(a.month-1)/3;if(part=="m")return (b.year-a.year)*12+b.month-a.month;
  auto ad=civilOrdinal(a.year,a.month,a.day),bd=civilOrdinal(b.year,b.month,b.day);if(part=="w")return (bd-ad)/7;if(part=="ww")return (weekStart(bd,first)-weekStart(ad,first))/7;
  int64_t unit=part=="h"?3600000:part=="n"?60000:part=="s"?1000:dayMillis;return floorDiv(civilMilliseconds(b),unit)-floorDiv(civilMilliseconds(a),unit);
}
int datePart(const std::string&part,Value value,int first,int rule){
  auto d=civilTime(value);auto ordinal=civilOrdinal(d.year,d.month,d.day);if(part=="yyyy")return d.year;if(part=="q")return (d.month-1)/3+1;if(part=="m")return d.month;if(part=="d")return d.day;if(part=="y")return static_cast<int>(ordinal-civilOrdinal(d.year,1,1)+1);if(part=="w")return mod(mod(ordinal+6,7)-first,7)+1;if(part=="h")return d.hour;if(part=="n")return d.minute;if(part=="s")return d.second;
  auto start=firstYearWeek(d.year,first,rule);if(ordinal<start)start=firstYearWeek(d.year-1,first,rule);return static_cast<int>((ordinal-start)/7+1);
}
Text generalDateString(Value value){auto d=civilTime(value);bool time=d.hour||d.minute||d.second||d.millisecond;auto ordinal=civilOrdinal(d.year,d.month,d.day);return ordinal==0?timeText(d):time?dateText(d)+u" "+timeText(d):dateText(d);}
Text formatDate(Value value,const Text&raw){
  auto d=civilTime(value);auto key=lower(toUTF8(raw));if(key.empty()||key=="general date"||key=="c")return generalDateString(value);
  if(key=="short date")return dateText(d);if(key=="long date")return fromUTF8(weekdays[mod(civilOrdinal(d.year,d.month,d.day)+6,7)])+u", "+fromUTF8(months[d.month-1])+u" "+number(d.day)+u", "+number(d.year);
  if(key=="medium date")return number(d.day,2)+u"-"+fromUTF8(std::string(months[d.month-1]).substr(0,3))+u"-"+number(d.year%100,2);
  if(key=="long time")return timeText(d);if(key=="medium time")return timeText(d,false);if(key=="short time")return number(d.hour,2)+u":"+number(d.minute,2);
  const bool am=key.find("am/pm")!=std::string::npos||key.find("a/p")!=std::string::npos;Text out;bool hourBefore=false;
  for(size_t i=0;i<raw.size();){
    char16_t c=raw[i];if(c==u'"'){size_t end=raw.find(u'"',i+1);if(end==Text::npos)end=raw.size();out+=raw.substr(i+1,end-i-1);i=end==raw.size()?end:end+1;continue;}
    if(c==u'\\'&&i+1<raw.size()){out+=raw[i+1];i+=2;continue;}
    auto tail=lower(toUTF8(raw.substr(i)));if(tail.rfind("am/pm",0)==0){out+=d.hour>=12?u"PM":u"AM";i+=5;continue;}if(tail.rfind("a/p",0)==0){out+=d.hour>=12?u"P":u"A";i+=3;continue;}
    auto token=static_cast<char16_t>(c>=u'A'&&c<=u'Z'?c+32:c);size_t count=1;while(i+count<raw.size()&&std::tolower(static_cast<unsigned char>(raw[i+count]&255))==token)++count;
    if(token==u'y'){out+=count>=4?number(d.year,4):count==2?number(d.year%100,2):number(datePart("y",value,0,1));}
    else if(token==u'm'){if(hourBefore&&count<=2)out+=number(d.minute,count==2?2:0);else if(count>=4)out+=fromUTF8(months[d.month-1]);else if(count==3)out+=fromUTF8(std::string(months[d.month-1]).substr(0,3));else out+=number(d.month,count==2?2:0);hourBefore=false;}
    else if(token==u'd'){if(count>=4)out+=fromUTF8(weekdays[mod(civilOrdinal(d.year,d.month,d.day)+6,7)]);else if(count==3)out+=fromUTF8(std::string(weekdays[mod(civilOrdinal(d.year,d.month,d.day)+6,7)]).substr(0,3));else out+=number(d.day,count==2?2:0);}
    else if(token==u'h'){out+=number(am?(d.hour%12?d.hour%12:12):d.hour,count==2?2:0);hourBefore=true;}
    else if(token==u'n')out+=number(d.minute,count==2?2:0);
    else if(token==u's')out+=number(d.second,count==2?2:0);
    else if(token==u'q')out+=number((d.month-1)/3+1);
    else if(token==u'w')out+=number(datePart(count==2?"ww":"w",value,0,1));
    else if(token==u't'&&count>=5)out+=timeText(d);
    else {out+=raw.substr(i,count);if(token!=u':'&&token!=u' ')hourBefore=false;}
    i+=count;
  }
  return out;
}
} // namespace vb6
