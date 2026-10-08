// Native reference-count finalization. No tracing GC or JavaScript runtime. MIT.
#include "lifetime.hpp"
namespace vb6 {
namespace {
struct ManagedInstance final : Instance {
  ManagedInstance* nextFinalizer = nullptr;
  bool finalized = false;
  ManagedInstance(Runtime& rt, Module& module) : Instance(rt, module) {}
};
}
struct NativeLifetime {
  Runtime* runtime;
  ManagedInstance* head = nullptr;
  ManagedInstance* tail = nullptr;
  bool draining = false;
  explicit NativeLifetime(Runtime& value) : runtime(&value) {}
};
namespace {
struct ReleaseInstance {
  std::shared_ptr<NativeLifetime> lifetime;
  void operator()(ManagedInstance* object) const noexcept {
    auto* rt = lifetime->runtime;
    if (!rt || rt->ending || object->finalized || !object->initialized ||
        object->initializing || (object->module->kind != "class" &&
        !(object->module->kind == "form" && object->formInitialized && !object->loaded))) {
      delete object;
      return;
    }
    // Intrusive FIFO: final release must neither allocate nor throw. Descendant
    // releases append to the queue, including releases made by Terminate itself.
    if (lifetime->tail) lifetime->tail->nextFinalizer = object;
    else lifetime->head = object;
    lifetime->tail = object;
  }
};
ManagedInstance* take(NativeLifetime& life) noexcept {
  auto* object = life.head;
  life.head = object->nextFinalizer;
  if (!life.head) life.tail = nullptr;
  object->nextFinalizer = nullptr;
  return object;
}
struct DrainGuard {
  NativeLifetime& lifetime;
  explicit DrainGuard(NativeLifetime& value) : lifetime(value) { lifetime.draining = true; }
  ~DrainGuard() { lifetime.draining = false; }
};
}
std::shared_ptr<Instance> makeNativeInstance(Runtime& rt, Module& module) {
  if (!rt.lifetime) rt.lifetime = std::make_shared<NativeLifetime>(rt);
  return std::shared_ptr<ManagedInstance>(new ManagedInstance(rt, module), ReleaseInstance{rt.lifetime});
}
void drainNativeFinalizers(Runtime& rt) {
  auto life = rt.lifetime;
  if (!life || life->draining || !life->runtime) return;
  DrainGuard guard(*life);
  while (life->head) {
    auto* object = take(*life);
    object->finalized = true;
    // The old shared_ptr control block has expired. A new owning block makes
    // shared_from_this/Me valid during Terminate, and keeps escaped Me references
    // memory-safe. The finalized flag prevents recursive/double termination.
    auto self = std::shared_ptr<ManagedInstance>(object, ReleaseInstance{life});
    if (rt.ending) continue;
    auto savedError = rt.error;
    const auto kind = object->module->kind;
    const auto event = kind == "class" ? "class_terminate" :
      object->module->form && object->module->form->type == "MDIForm" ? "mdiform_terminate" : "form_terminate";
    rt.dispatch(self, event);
    // A successful destructor is transparent to the caller's Err state. An
    // unhandled VB error propagates at this safe point through On Error/Resume.
    rt.error = std::move(savedError);
  }
}
void stopNativeFinalizers(Runtime& rt) noexcept {
  auto life = rt.lifetime;
  if (!life) return;
  life->runtime = nullptr;
  while (life->head) delete take(*life);
}
} // namespace vb6
