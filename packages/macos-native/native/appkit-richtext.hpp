// RichTextBox selection formatting shared by generated VB member dispatch. MIT.
#pragma once
#include "appkit-edit.hpp"
namespace vb6 {
bool nativeRichProperty(const std::string&) noexcept;
Value nativeRichGet(MacControl&, const std::string&);
void nativeRichSet(MacControl&, const std::string&, Value);
}
