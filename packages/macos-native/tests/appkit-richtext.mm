// Actual AppKit attributed runs reached through the native VB property boundary.
#include "appkit-richtext.hpp"
#include <cassert>
#include <iostream>
using namespace vb6;
namespace {
int changes = 0;
void select(Runtime& rt, const std::shared_ptr<MacControl>& c, int start, int length) {
  c->set(rt, "selstart", Value::integer(start));
  c->set(rt, "sellength", Value::integer(length));
}
void invalid(Runtime& rt, const std::shared_ptr<MacControl>& c, const char* name, Value value) {
  bool caught = false;
  try { c->set(rt, name, value); } catch (const Error& e) { caught = true; assert(e.number == 380); }
  assert(caught);
}
}
void checkNativeRichText(Runtime& rt, const std::shared_ptr<Instance>& form) {
  auto rich = std::dynamic_pointer_cast<MacControl>(form->controls.at("c18"));
  assert(rich);
  Procedure changed; changed.name = "C18_Change";
  changed.code = [](Frame&) -> Value { ++changes; return {}; };
  form->module->procedures["c18_change"] = std::move(changed);
  rich->set(rt, "text", Value::string(u"plain BOLD tail"));
  select(rt, rich, 0, 15);
  for (auto name : {"selbold","selitalic","selunderline","selstrikethru"}) rich->set(rt, name, Value::boolean(false));
  rich->set(rt, "selcolor", Value::integer(0));
  rich->set(rt, "selfontsize", Value::real(10));
  const auto family = rich->get(rt, "selfontname");
  assert(!family.string().empty());
  select(rt, rich, 6, 4);
  changes = 0;
  for (auto name : {"selbold","selitalic","selunderline","selstrikethru"}) {
    rich->set(rt, name, Value::boolean(true));
    assert(rich->get(rt, name).integral() == -1);
  }
  assert(changes == 4);
  rich->set(rt, "selcolor", Value::integer(0x0000ff));
  rich->set(rt, "selbackcolor", Value::integer(0x00ff00));
  rich->set(rt, "selfontsize", Value::real(12.25));
  assert(rich->get(rt, "selcolor").integral() == 0x0000ff);
  assert(rich->get(rt, "selbackcolor").integral() == 0x00ff00);
  assert(rich->get(rt, "selfontsize").floating() == 12.5);
  rich->set(rt, "selfontname", family);
  assert(rich->get(rt, "selfontname").string() == family.string());
  assert(rich->get(rt, "selstart").integral() == 6 && rich->get(rt, "sellength").integral() == 4);
  assert(rich->get(rt, "text").string() == u"plain BOLD tail");
  const auto fragment = rich->get(rt, "selrtf");
  assert(fragment.string().rfind(u"{\\rtf", 0) == 0);
  select(rt, rich, 0, 10);
  for (auto name : {"selbold","selitalic","selunderline","selstrikethru","selcolor","selfontsize"})
    assert(rich->get(rt, name).type == Type::Null);
  select(rt, rich, 0, 5);
  assert(!rich->get(rt, "selbold").truth());
  assert(rich->get(rt, "selfontsize").floating() == 10);
  select(rt, rich, 6, 4);
  rich->set(rt, "selbold", Value::boolean(false));
  assert(!rich->get(rt, "selbold").truth() && rich->get(rt, "selitalic").truth());

  // Explicit insertion formatting must override the character at the caret.
  select(rt, rich, 2, 0); changes = 0;
  rich->set(rt, "selbold", Value::boolean(true));
  rich->set(rt, "selfontsize", Value::real(14));
  assert(changes == 0);
  rich->set(rt, "seltext", Value::string(u"X"));
  assert(changes == 1 && rich->get(rt, "text").string() == u"plXain BOLD tail");
  select(rt, rich, 2, 1);
  assert(rich->get(rt, "selbold").truth() && rich->get(rt, "selfontsize").floating() == 14);
  select(rt, rich, 1, 1);
  assert(!rich->get(rt, "selbold").truth() && rich->get(rt, "selfontsize").floating() == 10);

  rich->set(rt, "text", Value::string(u"first\r\nsecond\r\nthird"));
  select(rt, rich, 0, 20); rich->set(rt, "selalignment", Value::integer(0));
  select(rt, rich, 8, 2); rich->set(rt, "selalignment", Value::integer(2));
  assert(rich->get(rt, "selalignment").integral() == 2);
  assert(rich->get(rt, "selstart").integral() == 8 && rich->get(rt, "sellength").integral() == 2);
  select(rt, rich, 0, 5); assert(rich->get(rt, "selalignment").integral() == 0);
  select(rt, rich, 0, 13); assert(rich->get(rt, "selalignment").type == Type::Null);

  rich->set(rt, "text", Value::string(u"# tail")); select(rt, rich, 0, 1); changes = 0;
  rich->set(rt, "selrtf", fragment);
  assert(changes == 1 && rich->get(rt, "text").string() == u"BOLD tail");
  assert(rich->get(rt, "selstart").integral() == 4 && rich->get(rt, "sellength").integral() == 0);
  select(rt, rich, 0, 4);
  assert(rich->get(rt, "selbold").truth() && rich->get(rt, "selitalic").truth());
  assert(rich->get(rt, "selcolor").integral() == 0x0000ff);
  auto document = rich->get(rt, "textrtf");
  rich->set(rt, "text", Value::string(u"discard"));
  rich->set(rt, "textrtf", document);
  assert(rich->get(rt, "text").string() == u"BOLD tail");
  assert(rich->get(rt, "selstart").integral() == 0 && rich->get(rt, "sellength").integral() == 0);
  select(rt, rich, 0, 4);
  assert(rich->get(rt, "selbold").truth());
  auto before = rich->get(rt, "text").string(); changes = 0;
  invalid(rt, rich, "selrtf", Value::string(u"not RTF"));
  invalid(rt, rich, "selfontsize", Value::real(0));
  invalid(rt, rich, "selfontsize", Value::real(16384));
  invalid(rt, rich, "selfontname", Value::string(u"invalid;name"));
  invalid(rt, rich, "selalignment", Value::integer(4));
  invalid(rt, rich, "selbold", Value::null());
  assert(changes == 0 && rich->get(rt, "text").string() == before);
  assert(rich->get(rt, "selbold").truth() && rich->get(rt, "selstart").integral() == 0 && rich->get(rt, "sellength").integral() == 4);
  auto plain = std::dynamic_pointer_cast<MacControl>(form->controls.at("c2"));
  bool rejected = false;
  try { plain->set(rt, "selbold", Value::boolean(true)); } catch (const Error& e) { rejected = true; assert(e.number == 438); }
  assert(rejected);
  form->module->procedures.erase("c18_change");
  std::cout << "APPKIT_RICH_SELECTION_OK\n";
}
