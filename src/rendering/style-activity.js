/** Event-driven CSSOM / Web Animations invalidation, scoped to a Window.
 * CSSOM mutations do not generate DOM MutationRecords. Subscribe while painting
 * a canvas backend, restore native descriptors on the last release, and never
 * poll an idle document. All wrappers preserve receiver, exceptions, return
 * value (including Promise identity) and third-party descriptor replacements.
 *
 * Original implementation; API behavior/reference attribution:
 * https://drafts.csswg.org/cssom/#the-cssstylesheet-interface
 * https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 * https://www.w3.org/TR/web-animations-1/#the-animation-interface
 * https://www.w3.org/TR/web-animations-1/#extensions-to-the-element-interface
 */
const HUB = Symbol.for('vb6.rendering.styleActivity.v1');
const SHADOW_HOSTS = Symbol.for('vb6.rendering.nativeShadowHosts.v1');
/** Closed roots are intentionally opaque. Remember roots created while the
 * renderer observes the realm; custom elements conservatively stay native even
 * when their closed root predates subscription. No DOM attributes are changed.
 * Source: https://dom.spec.whatwg.org/#dom-element-attachshadow
 */
export function requiresNativeShadowPaint(node) {
  return !!node.shadowRoot || node.localName?.includes('-') ||
    !!node.ownerDocument?.defaultView?.[SHADOW_HOSTS]?.has(node);
}
export function subscribeStyleActivity(view, callback) {
  if (typeof callback !== 'function') throw new TypeError('A style activity callback is required');
  let hub = view[HUB];
  if (!hub) {
    hub = {listeners: new Set(), restore: [], unavailable: [], installed: 0};
    Object.defineProperty(view, HUB, {configurable: true, value: hub});
    const notify = (kind, receiver) => {
      if (kind === 'shadow') {
        let hosts = view[SHADOW_HOSTS];
        if (!hosts) {
          hosts = new WeakSet();
          Object.defineProperty(view, SHADOW_HOSTS, {configurable: true, value: hosts});
        }
        hosts.add(receiver);
      }
      // Own canvas style writes must never invalidate the renderer recursively.
      if (receiver?.nodeType === 1 && receiver.hasAttribute?.('data-vb-render-layer')) return;
      for (const listener of [...hub.listeners]) {
        try { listener(kind); } catch { /* Observation cannot change native semantics. */ }
      }
    };
    const patch = (prototype, name, kind, {async = false, ruleOnly = false} = {}) => {
      if (!prototype) return;
      const original = Object.getOwnPropertyDescriptor(prototype, name);
      if (!original || (!original.set && typeof original.value !== 'function')) return;
      if (!original.configurable) { hub.unavailable.push(name); return; }
      const operation = original.set || original.value;
      function observed(...args) {
        const result = Reflect.apply(operation, this, args); // Native brand checks and throws first.
        if (ruleOnly && !this.parentRule) return result; // Inline style is already a DOM mutation.
        if (async) {
          // Do not substitute a chained Promise or turn a rejection into success.
          Promise.resolve(result).then(() => notify(kind, this), () => {});
        } else notify(kind, this);
        return result;
      }
      const installed = original.set ? {...original, set: observed} : {...original, value: observed};
      try {
        Object.defineProperty(prototype, name, installed); hub.installed++;
        hub.restore.push(() => {
          const current = Object.getOwnPropertyDescriptor(prototype, name);
          if ((original.set ? current?.set : current?.value) === observed) {
            Object.defineProperty(prototype, name, original.set ? {...current, set: original.set} : {...current, value: original.value});
          }
        });
      } catch { hub.unavailable.push(name); }
    };
    // Chromium exposes named CSS properties as configurable instance properties,
    // not prototype setters. Instrument only declarations actually accessed by
    // script after subscription, not every rule in a large loaded stylesheet.
    // Keep the native declaration object (no Proxy, no identity/brand changes).
    const seen = new WeakSet(), accessors = new Map();
    const declarationPrototype = view.CSSStyleDeclaration?.prototype;
    const getProperty = declarationPrototype?.getPropertyValue;
    const setProperty = declarationPrototype?.setProperty;
    const watchDeclaration = declaration => {
      if (!declaration || seen.has(declaration) || !getProperty || !setProperty) return;
      seen.add(declaration);
      const installed = [];
      for (const name of Object.getOwnPropertyNames(declaration)) {
        const old = Object.getOwnPropertyDescriptor(declaration,name);
        if (!old?.configurable || !old.writable || typeof old.value !== 'string' || /^\d+$/.test(name)) continue;
        const property = name === 'cssFloat' ? 'float' : name.replace(/^webkit(?=[A-Z])/,'Webkit').replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
        if (!view.CSS?.supports?.(property,'initial')) continue;
        let pair = accessors.get(name);
        if (!pair) {
          pair = {
            get() { return Reflect.apply(getProperty,this,[property]); },
            set(value) { Reflect.apply(setProperty,this,[property,value]); notify('stylesheet',this); }
          }; accessors.set(name,pair);
        }
        try { Object.defineProperty(declaration,name,{configurable:true,enumerable:old.enumerable,...pair}); installed.push([name,pair]); } catch {}
      }
      // Do not restore an old value: removing our accessor reveals the native
      // named-property interceptor with the CURRENT declaration's CSS value.
      const reference = typeof WeakRef === 'function' ? new WeakRef(declaration) : {deref:()=>declaration};
      hub.restore.push(() => {
        const object = reference.deref(); if (!object) return;
        for (const [name,pair] of installed) {
          const current=Object.getOwnPropertyDescriptor(object,name);
          if(current?.get===pair.get && current?.set===pair.set) delete object[name];
        }
      });
    };
    for (const ctor of ['CSSStyleRule','CSSKeyframeRule','CSSPageRule','CSSFontFaceRule']) {
      const prototype=view[ctor]?.prototype, original=prototype && Object.getOwnPropertyDescriptor(prototype,'style');
      if (!original?.get || !original.configurable) continue;
      function get() { const declaration=Reflect.apply(original.get,this,[]);watchDeclaration(declaration);return declaration; }
      try {
        Object.defineProperty(prototype,'style',{...original,get}); hub.installed++;
        hub.restore.push(() => {
          const current = Object.getOwnPropertyDescriptor(prototype, 'style');
          if (current?.get === get) Object.defineProperty(prototype, 'style', {...current, get: original.get});
        });
      } catch { hub.unavailable.push(ctor+'.style'); }
    }
    for (const name of ['insertRule','deleteRule','addRule','removeRule','replaceSync']) patch(view.CSSStyleSheet?.prototype, name, 'stylesheet');
    patch(view.CSSStyleSheet?.prototype, 'replace', 'stylesheet', {async: true});
    for (const ctor of ['StyleSheet','HTMLStyleElement','HTMLLinkElement']) patch(view[ctor]?.prototype, 'disabled', 'stylesheet');
    for (const ctor of ['CSSGroupingRule','CSSKeyframesRule']) {
      for (const name of ['insertRule','deleteRule','appendRule','name']) patch(view[ctor]?.prototype, name, 'stylesheet');
    }
    for (const ctor of ['CSSRule','CSSStyleRule','CSSKeyframeRule']) {
      for (const name of ['cssText','selectorText','keyText']) patch(view[ctor]?.prototype, name, 'stylesheet');
    }
    for (const name of ['appendMedium','deleteMedium','mediaText']) patch(view.MediaList?.prototype, name, 'stylesheet');
    // Rule declarations expose both setProperty() and generated longhand setters.
    const declarations = view.CSSStyleDeclaration?.prototype;
    if (declarations) for (const name of Object.getOwnPropertyNames(declarations)) {
      if (Object.getOwnPropertyDescriptor(declarations,name)?.set || ['setProperty','removeProperty'].includes(name)) {
        patch(declarations, name, 'stylesheet', {ruleOnly: true});
      }
    }
    // adoptedStyleSheets is an ObservableArray. Preserve its identity (no
    // Proxy), its native range/type checks and mutator return values. Getter
    // access invalidates before a following indexed assignment, and saved array
    // references keep working through observed push/splice/etc. The explicit
    // invalidateStyles hook still covers a saved reference's direct index writes.
    // Source: https://drafts.csswg.org/cssom/#dom-documentorshadowroot-adoptedstylesheets
    const arrays = new WeakSet();
    const watchArray = array => {
      if (!array || arrays.has(array)) return;
      arrays.add(array);
      for (const name of ['push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin']) {
        const original = Object.getOwnPropertyDescriptor(array, name), operation = array[name];
        if (typeof operation !== 'function' || (original && !original.configurable)) continue;
        function observed(...args) {
          // A failed native operation can have partially modified an array.
          // Invalidating on failure preserves pixels without swallowing errors.
          try { return Reflect.apply(operation, this, args); }
          finally { notify('stylesheet', this); }
        }
        try {
          Object.defineProperty(array, name, {configurable: true, writable: true, enumerable: original?.enumerable || false, value: observed});
          const reference = typeof WeakRef === 'function' ? new WeakRef(array) : {deref: () => array};
          hub.restore.push(() => {
            const object = reference.deref();
            if (object && Object.getOwnPropertyDescriptor(object, name)?.value === observed) {
              if (original) Object.defineProperty(object, name, original); else delete object[name];
            }
          });
        } catch { hub.unavailable.push('adoptedStyleSheets.' + name); }
      }
    };
    for (const ctor of ['Document','ShadowRoot']) {
      const prototype = view[ctor]?.prototype;
      patch(prototype, 'adoptedStyleSheets', 'stylesheet');
      const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, 'adoptedStyleSheets');
      if (!descriptor?.get || !descriptor.configurable) continue;
      function get() {
        const result = Reflect.apply(descriptor.get, this, []);
        watchArray(result); notify('stylesheet', this); return result;
      }
      try {
        Object.defineProperty(prototype, 'adoptedStyleSheets', {...descriptor, get}); hub.installed++;
        hub.restore.push(() => {
          const current = Object.getOwnPropertyDescriptor(prototype, 'adoptedStyleSheets');
          if (current?.get === get) Object.defineProperty(prototype, 'adoptedStyleSheets', {...current, get: descriptor.get});
        });
      } catch { hub.unavailable.push(ctor + '.adoptedStyleSheets'); }
    }
    patch(view.Element?.prototype, 'attachShadow', 'shadow');
    patch(view.Element?.prototype, 'animate', 'animation');
    for (const name of ['play','pause','reverse','finish','cancel','updatePlaybackRate','currentTime','startTime','playbackRate','effect','timeline']) patch(view.Animation?.prototype, name, 'animation');
    for (const ctor of ['AnimationEffect','KeyframeEffect']) for (const name of ['setKeyframes','updateTiming','target','composite','iterationComposite']) patch(view[ctor]?.prototype, name, 'animation');
  }
  hub.listeners.add(callback);
  let active = true;
  const release = () => {
    if (!active) return; active = false; hub.listeners.delete(callback);
    if (!hub.listeners.size) {
      for (const restore of hub.restore.splice(0).reverse()) { try { restore(); } catch {} }
      if (view[HUB] === hub) delete view[HUB];
    }
  };
  Object.defineProperty(release, 'capabilities', {get: () => ({installed: hub.installed, unavailable: [...hub.unavailable]})});
  return release;
}
