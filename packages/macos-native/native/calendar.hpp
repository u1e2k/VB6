#pragma once
#include "vb6.hpp"
namespace vb6 {
struct CivilTime { int year=1899,month=12,day=30,hour=0,minute=0,second=0,millisecond=0; };
int monthDays(int year,int month);
int64_t civilOrdinal(int year,int month,int day);
CivilTime civilFromOrdinal(int64_t ordinal);
CivilTime civilTime(Value date);
CivilTime currentCivilTime();
Value civilDate(CivilTime date);
Value parseDate(Value value);
int64_t civilMilliseconds(CivilTime date);
Value dateFromMilliseconds(int64_t milliseconds);
int firstWeekDay(int64_t value);
int firstWeekRule(int64_t value);
int64_t weekStart(int64_t ordinal,int first);
int64_t firstYearWeek(int year,int first,int rule);
std::string dateInterval(const Value&);
Value addDate(const std::string&,int64_t,Value);
int64_t diffDate(const std::string&,Value,Value,int first,int rule);
int datePart(const std::string&,Value,int first,int rule);
Text formatDate(Value,const Text& format);
Text generalDateString(Value);
}
