// Native attributed-run operations. No HTML, JavaScript or Windows RichEdit host.
#include "appkit-richtext.hpp"
namespace vb6 {
namespace {
NSTextView* richView(MacControl& c) {
  if (c.disposed) fail(91);
  if (c.spec.type != "RichTextBox" || ![c.widget isKindOfClass:NSTextView.class])
    fail(438, "Selection formatting requires RichTextBox");
  return (NSTextView*)c.widget;
}
struct Mutation {
  MacControl& control;
  explicit Mutation(MacControl& c) : control(c) { ++control.eventSuppression; }
  ~Mutation() { --control.eventSuppression; }
};
NSFont* font(MacControl& c, NSDictionary* attributes) {
  return attributes[NSFontAttributeName] ?: richView(c).font ?: [NSFont systemFontOfSize:11];
}
NSParagraphStyle* paragraph(NSDictionary* attributes) {
  return attributes[NSParagraphStyleAttributeName] ?: NSParagraphStyle.defaultParagraphStyle;
}
Value attribute(MacControl& c, const std::string& name, NSDictionary* attributes) {
  if (name == "selfontname") return Value::string(text(font(c, attributes).familyName));
  // Retain the host's 96-logical-pixel / 72-typographic-point convention.
  if (name == "selfontsize") return Value::real(font(c, attributes).pointSize * 0.75, Type::Single);
  if (name == "selbold" || name == "selitalic") {
    auto traits = [NSFontManager.sharedFontManager traitsOfFont:font(c, attributes)];
    return Value::boolean((traits & (name == "selbold" ? NSBoldFontMask : NSItalicFontMask)) != 0);
  }
  if (name == "selunderline" || name == "selstrikethru")
    return Value::boolean([attributes[name == "selunderline" ? NSUnderlineStyleAttributeName : NSStrikethroughStyleAttributeName] integerValue] != 0);
  if (name == "selcolor" || name == "selbackcolor") {
    auto key = name == "selcolor" ? NSForegroundColorAttributeName : NSBackgroundColorAttributeName;
    NSColor* value = attributes[key];
    if (!value) value = color(c.property(name == "selcolor" ? "forecolor" : "backcolor",
      Value::integer(name == "selcolor" ? 0 : 0xffffff)).integral());
    return Value::integer(colorValue(value));
  }
  if (name == "selalignment") {
    auto alignment = paragraph(attributes).alignment;
    return Value::integer(alignment == NSTextAlignmentRight ? 1 : alignment == NSTextAlignmentCenter ? 2 :
      alignment == NSTextAlignmentJustified ? 3 : 0, Type::Integer);
  }
  fail(438);
}
Value checked(const std::string& name, Value value) {
  if (value.type == Type::Null) fail(380, "Cannot assign a mixed selection value");
  if (name == "selfontsize") {
    auto size = value.floating();
    if (!std::isfinite(size) || size <= 0 || size > 16383.5) fail(380, "Invalid selection font size");
    return Value::real(std::max(0.5, std::round(size * 2) / 2));
  }
  if (name == "selfontname") {
    auto valueText = value.string();
    if (valueText.empty() || valueText.size() > 128 || valueText.find_first_of(Text{u';',u'\r',u'\n',0}) != Text::npos)
      fail(380, "Invalid selection font name");
    return Value::string(valueText);
  }
  if (name == "selcolor" || name == "selbackcolor") return coerce(value, "long");
  if (name == "selalignment") {
    auto alignment = value.integral();
    if (alignment < 0 || alignment > 3) fail(380, "Invalid selection alignment");
    return Value::integer(alignment);
  }
  return Value::boolean(value.truth());
}
NSDictionary* formatted(MacControl& c, const std::string& name, Value value, NSDictionary* attributes) {
  NSMutableDictionary* result = [attributes mutableCopy];
  if (name == "selbold" || name == "selitalic" || name == "selfontname" || name == "selfontsize") {
    auto manager = NSFontManager.sharedFontManager;
    NSFont* previous = font(c, attributes);
    NSFont* next = nil;
    if (name == "selfontsize") next = [manager convertFont:previous toSize:value.floating() * 4.0 / 3.0];
    else if (name == "selfontname") {
      next = [manager convertFont:previous toFamily:ns(value.string())];
      if (!next || [next.familyName caseInsensitiveCompare:ns(value.string())] != NSOrderedSame)
        fail(380, "The requested font family is unavailable on this Mac");
    } else {
      auto trait = name == "selbold" ? NSBoldFontMask : NSItalicFontMask;
      next = value.truth() ? [manager convertFont:previous toHaveTrait:trait] : [manager convertFont:previous toNotHaveTrait:trait];
    }
    if (!next) fail(380, "The requested native font style is unavailable");
    result[NSFontAttributeName] = next;
  } else if (name == "selunderline" || name == "selstrikethru") {
    result[name == "selunderline" ? NSUnderlineStyleAttributeName : NSStrikethroughStyleAttributeName] =
      @(value.truth() ? NSUnderlineStyleSingle : NSUnderlineStyleNone);
  } else if (name == "selcolor" || name == "selbackcolor") {
    result[name == "selcolor" ? NSForegroundColorAttributeName : NSBackgroundColorAttributeName] = color(value.integral());
  } else if (name == "selalignment") {
    NSMutableParagraphStyle* style = [paragraph(attributes) mutableCopy];
    const NSTextAlignment alignments[] = {NSTextAlignmentLeft, NSTextAlignmentRight, NSTextAlignmentCenter, NSTextAlignmentJustified};
    style.alignment = alignments[value.integral()];
    result[NSParagraphStyleAttributeName] = style;
  }
  return result;
}
NSAttributedString* parseRTF(const Text& value) {
  const auto bytes = toUTF8(value);
  if (bytes.rfind("{\\rtf", 0) != 0) fail(380, "Invalid RTF header");
  if (bytes.size() > 16 * 1024 * 1024) fail(7, "RTF input exceeds 16 MiB");
  // initWithRTF is an in-memory format reader, not a document URL importer.
  NSAttributedString* result = nil;
  @try {
    result = [[NSAttributedString alloc] initWithRTF:[NSData dataWithBytes:bytes.data() length:bytes.size()] documentAttributes:nullptr];
  } @catch (NSException*) { fail(380, "Invalid RTF"); }
  if (!result) fail(380, "Invalid RTF");
  return result;
}
void replaceRTF(MacControl& c, NSTextView* view, NSRange range, const Text& value, bool whole) {
  auto replacement = parseRTF(value); // Parse before any state mutation.
  if (replacement.length > size_t(INT32_MAX) - (view.string.length - range.length)) fail(7);
  auto before = [view.textStorage attributedSubstringFromRange:range];
  const bool changed = ![before isEqualToAttributedString:replacement];
  {
    Mutation mutation(c);
    [view.textStorage replaceCharactersInRange:range withAttributedString:replacement];
    c.properties["text"] = Value::string(text(view.string));
    nativeEditSelect(c, NSMakeRange(whole ? 0 : range.location + replacement.length, 0));
  }
  if (changed) c.event("change");
}
}
bool nativeRichProperty(const std::string& name) noexcept {
  return name == "selbold" || name == "selitalic" || name == "selunderline" || name == "selstrikethru" ||
    name == "selcolor" || name == "selbackcolor" || name == "selfontname" || name == "selfontsize" ||
    name == "selalignment" || name == "selrtf" || name == "textrtf";
}
Value nativeRichGet(MacControl& c, const std::string& name) {
  auto view = richView(c);
  auto range = nativeEditSelection(c);
  if (name == "selrtf" || name == "textrtf") {
    if (name == "textrtf") range = NSMakeRange(0, view.string.length);
    NSData* data = [view RTFFromRange:range];
    if (!data) fail(380, "Cannot serialize native RTF");
    return Value::string(fromUTF8(std::string(static_cast<const char*>(data.bytes), data.length)));
  }
  if (!range.length) return attribute(c, name, view.typingAttributes);
  std::optional<Value> result;
  for (NSUInteger at = range.location; at < NSMaxRange(range);) {
    NSRange run;
    auto attributes = [view.textStorage attributesAtIndex:at longestEffectiveRange:&run inRange:range];
    auto value = attribute(c, name, attributes);
    if (result && !binary("=", *result, value).truth()) return Value::null();
    result = value;
    at = NSMaxRange(run);
  }
  return *result;
}
void nativeRichSet(MacControl& c, const std::string& name, Value value) {
  auto view = richView(c);
  auto range = nativeEditSelection(c);
  if (name == "selrtf" || name == "textrtf") {
    bool whole = name == "textrtf";
    replaceRTF(c, view, whole ? NSMakeRange(0, view.string.length) : range, value.string(), whole);
    return;
  }
  value = checked(name, std::move(value));
  const auto selection = range;
  if (name == "selalignment" && view.string.length) range = [view.string paragraphRangeForRange:range];
  if (!range.length) {
    view.typingAttributes = formatted(c, name, value, view.typingAttributes);
    return; // Insertion formatting does not change existing document content.
  }
  auto original = [view.textStorage attributedSubstringFromRange:range];
  NSMutableAttributedString* replacement = [original mutableCopy];
  for (NSUInteger at = 0; at < replacement.length;) {
    NSRange run;
    auto attributes = [original attributesAtIndex:at longestEffectiveRange:&run inRange:NSMakeRange(0, original.length)];
    [replacement setAttributes:formatted(c, name, value, attributes) range:run];
    at = NSMaxRange(run);
  }
  if ([replacement isEqualToAttributedString:original]) return;
  {
    Mutation mutation(c);
    // Prepare every transformed run before committing; failed font conversion
    // cannot leave an earlier run partially formatted. Preserve UTF-16 selection.
    [view.textStorage replaceCharactersInRange:range withAttributedString:replacement];
    nativeEditSelect(c, selection);
  }
  c.event("change");
}
} // namespace vb6
