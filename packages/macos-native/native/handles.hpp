// Generation-checked 31-bit VB handles. No Cocoa pointer is truncated into Long.
#pragma once
#include "vb6.hpp"
#include <deque>
namespace vb6 {
enum class HandleKind { Window,Control,Menu,DC,Pen,Brush,Font,Image,Timer,File,Module,Cursor };
class HandleRegistry final {
  struct Entry {uint16_t generation=1;HandleKind kind=HandleKind::Control;std::weak_ptr<Object> weak;ObjectPtr owned;bool active=false,retired=false;};
  std::vector<Entry>entries_{1};std::deque<uint16_t>free_;
public:
  int32_t add(ObjectPtr object,HandleKind kind,bool retain=false){
    if(!object)fail(5,"Cannot register an empty native object");uint16_t slot;
    if(free_.empty()){if(entries_.size()>65535)fail(7,"Native handle table is full");slot=uint16_t(entries_.size());entries_.emplace_back();}
    else{slot=free_.front();free_.pop_front();}
    auto&e=entries_[slot];e.active=true;e.kind=kind;e.weak=object;e.owned=retain?object:nullptr;return int32_t((uint32_t(e.generation)<<16)|slot);
  }
  ObjectPtr find(int32_t handle,std::optional<HandleKind>kind={})const{
    if(handle<=0)return nullptr;auto slot=uint16_t(uint32_t(handle)&65535),generation=uint16_t(uint32_t(handle)>>16);
    if(!slot||slot>=entries_.size())return nullptr;auto&e=entries_[slot];if(!e.active||e.generation!=generation||(kind&&e.kind!=*kind))return nullptr;return e.weak.lock();
  }
  bool remove(int32_t handle){
    if(handle<=0)return false;auto slot=uint16_t(uint32_t(handle)&65535),generation=uint16_t(uint32_t(handle)>>16);
    if(!slot||slot>=entries_.size())return false;auto&e=entries_[slot];if(!e.active||e.generation!=generation)return false;e.active=false;e.weak.reset();e.owned.reset();if(e.generation==32767)e.retired=true;else{++e.generation;free_.push_back(slot);}return true;
  }
  void clear(){for(size_t i=1;i<entries_.size();i++)if(entries_[i].active)remove(int32_t((uint32_t(entries_[i].generation)<<16)|uint32_t(i)));}
};
}
