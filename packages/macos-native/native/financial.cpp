// Native counterparts of the shared VB financial library; bounded rate solving.
#include "library.hpp"
#include <numeric>
namespace vb6 {
namespace {
double finite(double n){if(!std::isfinite(n))fail(6);return n==0?0:n;}
double number(const Args&a,size_t i,double fallback=0){auto value=argument(a,i);return value.type==Type::Missing?fallback:finite(value.floating());}
double due(double value){if(value!=0&&value!=1)fail(5,"Payment timing must be 0 or 1");return value;}
std::pair<double,double> growth(double rate,double periods){if(rate==0)return {1,periods};double x=periods*std::log1p(rate),power=rate>-1?std::exp(x):std::pow(1+rate,periods),annuity=rate>-1?std::expm1(x)/rate:(power-1)/rate;return {finite(power),finite(annuity)};}
double fv(double rate,double periods,double payment,double present=0,double timing=0){due(timing);auto g=growth(rate,periods);return finite(-present*g.first-payment*(1+rate*timing)*g.second);}
double pmt(double rate,double periods,double present,double future=0,double timing=0){due(timing);if(periods==0)fail(5);auto g=growth(rate,periods);double denominator=(1+rate*timing)*g.second;if(denominator==0)fail(5);return finite(-(present*g.first+future)/denominator);}
double ipmt(double rate,double period,double periods,double present,double future=0,double timing=0){due(timing);if(periods<=0||period<1||period>periods)fail(5);if(rate==0||(timing==1&&period==1))return 0;if(timing==1&&rate==-1)fail(5);double payment=pmt(rate,periods,present,future,timing),balance=fv(rate,period-1,payment,present,timing);return finite(balance*rate/(timing==1?1+rate:1));}
bool opposite(double a,double b){return (a<0&&b>0)||(a>0&&b<0);}
double root(const std::function<double(double)>&evaluate,double guess){
  if(guess<=-1)fail(5);const double center=std::log1p(guess);std::set<double>xs={std::clamp(center,-36.0,36.0),0,-36,36};
  for(double step:{.000001,.00001,.0001,.001,.01,.025,.05,.1,.2,.4,.8,1.6,3.2,6.4,12.8,25.6,51.2}){xs.insert(std::clamp(center-step,-36.0,36.0));xs.insert(std::clamp(center+step,-36.0,36.0));}
  for(double x=-4;x<=4;x+=.125)xs.insert(x);
  std::vector<std::pair<double,double>>samples;std::vector<double>exact;for(double x:xs){double y=evaluate(x);samples.emplace_back(x,y);if(y==0)exact.push_back(x);}
  if(!exact.empty()){auto selected=*std::min_element(exact.begin(),exact.end(),[center](double a,double b){return std::abs(a-center)<std::abs(b-center);});return finite(std::expm1(selected));}
  std::vector<size_t>brackets;for(size_t i=1;i<samples.size();i++)if(std::isfinite(samples[i-1].second)&&std::isfinite(samples[i].second)&&opposite(samples[i-1].second,samples[i].second))brackets.push_back(i);
  if(brackets.empty())fail(5,"Financial iteration did not find a real rate");
  auto index=*std::min_element(brackets.begin(),brackets.end(),[&](size_t a,size_t b){return std::abs((samples[a-1].first+samples[a].first)/2-center)<std::abs((samples[b-1].first+samples[b].first)/2-center);});
  double lo=samples[index-1].first,flo=samples[index-1].second,hi=samples[index].first;
  for(int i=0;i<256;i++){double mid=(lo+hi)/2,fm=evaluate(mid);if(!std::isfinite(fm))fail(5);if(fm==0||hi-lo<=4*std::numeric_limits<double>::epsilon()*std::max(1.0,std::abs(mid)))return finite(std::expm1(mid));if(opposite(flo,fm))hi=mid;else{lo=mid;flo=fm;}}
  fail(5,"Financial iteration did not converge");
}
std::vector<double> cashFlows(Value value,size_t minimum=1){auto array=value.asArray();if(array->bounds.size()!=1)fail(5);if(array->values.size()<minimum||array->values.size()>1000000)fail(5);std::vector<double>cash;cash.reserve(array->values.size());for(auto&v:array->values)cash.push_back(finite(v.floating()));return cash;}
double logSum(const std::vector<double>&logs){double maximum=*std::max_element(logs.begin(),logs.end()),sum=0,correction=0;for(double v:logs){double next=std::exp(v-maximum)-correction,total=sum+next;correction=(total-sum)-next;sum=total;}return maximum+std::log(sum);}
}
void installFinancialBuiltins(Runtime&rt){
  addBuiltin(rt,"FV","rate,nper,pmt,pv?,type?",[](Frame&,Args a){return Value::real(fv(number(a,0),number(a,1),number(a,2),number(a,3),number(a,4)));});
  addBuiltin(rt,"PV","rate,nper,pmt,fv?,type?",[](Frame&,Args a){double rate=number(a,0),payment=number(a,2),future=number(a,3),timing=due(number(a,4));auto g=growth(rate,number(a,1));if(g.first==0)fail(5);return Value::real((-future-payment*(1+rate*timing)*g.second)/g.first);});
  addBuiltin(rt,"PMT","rate,nper,pv,fv?,type?",[](Frame&,Args a){return Value::real(pmt(number(a,0),number(a,1),number(a,2),number(a,3),number(a,4)));});
  addBuiltin(rt,"IPMT","rate,per,nper,pv,fv?,type?",[](Frame&,Args a){return Value::real(ipmt(number(a,0),number(a,1),number(a,2),number(a,3),number(a,4),number(a,5)));});
  addBuiltin(rt,"PPMT","rate,per,nper,pv,fv?,type?",[](Frame&,Args a){return Value::real(pmt(number(a,0),number(a,2),number(a,3),number(a,4),number(a,5))-ipmt(number(a,0),number(a,1),number(a,2),number(a,3),number(a,4),number(a,5)));});
  addBuiltin(rt,"NPER","rate,pmt,pv,fv?,type?",[](Frame&,Args a){double rate=number(a,0),payment=number(a,1),present=number(a,2),future=number(a,3),timing=due(number(a,4));if(rate==0){if(payment==0)fail(5);return Value::real(-(present+future)/payment);}if(rate<=-1)fail(5);double term=payment*(1+rate*timing),denominator=present*rate+term,delta=-(present+future)*rate/denominator;if(denominator==0||!(delta>-1)||!std::isfinite(delta))fail(5);return Value::real(std::log1p(delta)/std::log1p(rate));});
  addBuiltin(rt,"RATE","nper,pmt,pv,fv?,type?,guess?",[](Frame&,Args a){
    double periods=number(a,0),payment=number(a,1),present=number(a,2),future=number(a,3),timing=due(number(a,4));if(periods<=0)fail(5);double scale=std::max({std::abs(payment),std::abs(present),std::abs(future)});if(scale==0)fail(5);payment/=scale;present/=scale;future/=scale;
    return Value::real(root([=](double x){double rate=std::expm1(x),y=periods*x;if(x==0)return present+payment*periods+future;if(y>0)return present+payment*(1+rate*timing)*(-std::expm1(-y)/rate)+future*std::exp(-y);return present*std::exp(y)+payment*(1+rate*timing)*(std::expm1(y)/rate)+future;},number(a,5,.1)));
  });
  addBuiltin(rt,"NPV","rate,values",[](Frame&,Args a){double rate=number(a,0);if(rate==-1)fail(5);auto cash=cashFlows(a[1].value);double total=0;for(auto it=cash.rbegin();it!=cash.rend();++it)total=finite((total+*it)/(1+rate));return Value::real(total);},false,true);
  addBuiltin(rt,"IRR","values,guess?",[](Frame&,Args a){auto cash=cashFlows(a[0].value,2);if(!std::any_of(cash.begin(),cash.end(),[](double x){return x>0;})||!std::any_of(cash.begin(),cash.end(),[](double x){return x<0;}))fail(5);while(cash.front()==0)cash.erase(cash.begin());while(cash.back()==0)cash.pop_back();double scale=0;for(double v:cash)scale=std::max(scale,std::abs(v));for(auto&v:cash)v/=scale;return Value::real(root([&cash](double x){double sum=0;if(x>=0){double discount=std::exp(-x);for(auto it=cash.rbegin();it!=cash.rend();++it)sum=sum*discount+*it;}else{double growth=std::exp(x);for(double v:cash)sum=sum*growth+v;}return sum;},number(a,1,.1)));},false,true);
  addBuiltin(rt,"MIRR","values,finance_rate,reinvest_rate",[](Frame&,Args a){auto cash=cashFlows(a[0].value,2);double finance=number(a,1),reinvest=number(a,2);if(finance<=-1||reinvest<=-1)fail(5);double fr=std::log1p(finance),rr=std::log1p(reinvest);std::vector<double>positive,negative;for(size_t i=0;i<cash.size();i++){if(cash[i]>0)positive.push_back(std::log(cash[i])+(cash.size()-1-i)*rr);if(cash[i]<0)negative.push_back(std::log(-cash[i])-i*fr);}if(positive.empty()||negative.empty())fail(5);return Value::real(std::expm1((logSum(positive)-logSum(negative))/(cash.size()-1)));},false,true);
  addBuiltin(rt,"SLN","cost,salvage,life",[](Frame&,Args a){double life=number(a,2);if(life==0)fail(5);return Value::real((number(a,0)-number(a,1))/life);});
  addBuiltin(rt,"SYD","cost,salvage,life,period",[](Frame&,Args a){double life=number(a,2),period=number(a,3);if(life<=0||period<1||period>life)fail(5);return Value::real((number(a,0)-number(a,1))*(life-period+1)*2/(life*(life+1)));});
  addBuiltin(rt,"DDB","cost,salvage,life,period,factor?",[](Frame&,Args a){double cost=number(a,0),salvage=number(a,1),life=number(a,2),period=number(a,3),factor=number(a,4,2);if(cost<0||salvage<0||life<=0||period<=0||period>life||factor<=0)fail(5);if(salvage>=cost)return Value::real(0);double rate=std::min(1.0,factor/life),before=rate==1?(period<=1?cost:0):cost*std::pow(1-rate,period-1);return Value::real(std::max(0.0,std::min(before*rate,before-salvage)));});
}
}
