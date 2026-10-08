// Headless host only for portable compiler/runtime regression tests.
#include "vb6.hpp"
namespace vb6 { std::unique_ptr<NativeHost> makeNativeHost(){return std::make_unique<NativeHost>();} }
