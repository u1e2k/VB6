// Internal widget helpers shared by native control implementation units. MIT.
#pragma once
#include "appkit.hpp"
namespace vb6 {
inline NSTextView* textView(MacControl&c){return [c.widget isKindOfClass:NSTextView.class]?(NSTextView*)c.widget:nil;}
inline NSTextField* textField(MacControl&c){return [c.widget isKindOfClass:NSTextField.class]?(NSTextField*)c.widget:nil;}
inline NSTableView* tableView(MacControl&c){return [c.widget isKindOfClass:NSTableView.class]?(NSTableView*)c.widget:nil;}
inline void rangeCheck(int64_t index,size_t size){if(index<0||uint64_t(index)>=size)fail(381,"Invalid property array index");}
}
