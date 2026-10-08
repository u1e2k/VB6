// Native ownership boundary checks, independent of generated VB procedures.
#include "vb6.hpp"
#include "lifetime.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
namespace {
std::vector<int64_t> order;
ObjectPtr escaped;
size_t maxDepth = 0;
int deleted = 0;
struct Sentinel final : Object { ~Sentinel() override { ++deleted; } };
Value terminate(Frame& f) {
  order.push_back(f.get("id").integral());
  maxDepth = std::max(maxDepth, f.runtime.depth);
  assert(f.get("Me").asObject().get() == f.self.get());
  if (f.get("escape").truth()) escaped = f.self;
  if (f.get("releasechild").truth()) {
    const auto before = order.size();
    f.self->fields.at("child")->set(Value::object(nullptr), true);
    f.mark(1, 2, 42);
    assert(order.size() == before + 1);
  }
  if (f.get("fail").truth()) throw Error(5, "Finalizer failure", "LifetimeBoundary");
  return {};
}
Value badInitialize(Frame&) { throw Error(5, "Initializer failure"); }
void install(Runtime& rt) {
  Module m;
  m.name = "Probe"; m.kind = "class";
  m.initialize = [](Frame& f) {
    for (auto name : {"id", "fail", "escape", "releasechild"}) f.global(name, "long");
    f.global("child", "object");
    f.global("sentinel", "object");
    f.self->fields.at("sentinel")->set(Value::object(std::make_shared<Sentinel>()), true);
  };
  Procedure p; p.name = "Class_Terminate"; p.scope = "private"; p.code = terminate;
  m.procedures["class_terminate"] = std::move(p);
  rt.modules["probe"] = std::move(m);
}
std::shared_ptr<Instance> probe(Runtime& rt, int64_t id) {
  auto value = rt.instance("probe", true);
  value->fields.at("id")->set(Value::integer(id));
  return value;
}
void reset() { assert(!escaped); order.clear(); maxDepth = 0; deleted = 0; }
void orderedRelease() {
  reset(); Runtime rt(makeNativeHost()); install(rt);
  auto first = probe(rt, 1), second = probe(rt, 2);
  std::weak_ptr<Instance> weak = first;
  first.reset(); second.reset();
  assert(weak.expired() && order.empty() && deleted == 0);
  rt.error.number = 53; rt.error.description = u"preserved";
  drainNativeFinalizers(rt);
  assert((order == std::vector<int64_t>{1, 2}) && deleted == 2);
  assert(rt.error.number == 53 && rt.error.description == u"preserved" && rt.depth == 0);
}
void nestedRelease() {
  reset(); Runtime rt(makeNativeHost()); install(rt);
  auto parent = probe(rt, 1), child = probe(rt, 2), peer = probe(rt, 3);
  parent->fields.at("child")->set(Value::object(child), true);
  parent->fields.at("releasechild")->set(Value::integer(1));
  child.reset(); parent.reset(); peer.reset();
  drainNativeFinalizers(rt);
  assert((order == std::vector<int64_t>{1, 2, 3}) && maxDepth == 2 && deleted == 3);
}
void failedRelease() {
  reset(); Runtime rt(makeNativeHost()); install(rt);
  auto bad = probe(rt, 1), good = probe(rt, 2);
  bad->fields.at("fail")->set(Value::integer(1));
  bad.reset(); good.reset();
  bool caught = false;
  try { drainNativeFinalizers(rt); }
  catch (const Error& e) { caught = true; assert(e.number == 5 && e.source == "LifetimeBoundary"); }
  assert(caught && rt.depth == 0 && deleted == 1 && order.size() == 1);
  drainNativeFinalizers(rt);
  assert((order == std::vector<int64_t>{1, 2}) && deleted == 2);
}
void escapedSelf() {
  reset(); Runtime rt(makeNativeHost()); install(rt);
  auto value = probe(rt, 7);
  value->fields.at("escape")->set(Value::integer(1));
  value.reset(); drainNativeFinalizers(rt);
  assert(escaped && order.size() == 1 && deleted == 0);
  auto instance = std::dynamic_pointer_cast<Instance>(escaped);
  assert(instance && instance->fields.at("id")->get().integral() == 7);
  assert(escaped->shared_from_this() == escaped);
  instance.reset(); escaped.reset(); drainNativeFinalizers(rt);
  assert(order.size() == 1 && deleted == 1);
}
void failedInitialization() {
  reset(); Runtime rt(makeNativeHost()); install(rt);
  Procedure p; p.name = "Class_Initialize"; p.code = badInitialize;
  rt.modules.at("probe").procedures["class_initialize"] = std::move(p);
  bool caught = false;
  try { (void)probe(rt, 1); } catch (const Error& e) { caught = true; assert(e.number == 5); }
  drainNativeFinalizers(rt);
  assert(caught && order.empty() && deleted == 1 && rt.depth == 0);
}
void longChain(bool abrupt) {
  reset(); Runtime rt(makeNativeHost()); install(rt); rt.maxCallDepth = 8;
  constexpr int count = 4096;
  auto head = probe(rt, 0), last = head;
  for (int i = 1; i < count; ++i) {
    auto next = probe(rt, i);
    last->fields.at("child")->set(Value::object(next), true);
    last = std::move(next);
  }
  last.reset(); rt.ending = abrupt; head.reset(); drainNativeFinalizers(rt);
  assert(deleted == count && rt.depth == 0);
  if (abrupt) assert(order.empty());
  else { assert(order.size() == count && maxDepth == 1); for (int i = 0; i < count; ++i) assert(order[size_t(i)] == i); }
}
void nativeClientOutlivesRuntime() {
  reset(); ObjectPtr retained;
  {
    Runtime rt(makeNativeHost()); install(rt);
    retained = probe(rt, 1);
    auto pending = probe(rt, 2); pending.reset();
  }
  assert(order.empty() && deleted == 1);
  retained.reset();
  assert(order.empty() && deleted == 2);
}
}
int main() {
  orderedRelease(); nestedRelease(); failedRelease(); escapedSelf();
  failedInitialization(); longChain(false); longChain(true); nativeClientOutlivesRuntime();
  std::cout << "NATIVE_CLASS_LIFETIME_OK\n";
}
