import {el} from '../core/core.js';
import {icon} from '../theme/icons.js';
const GLYPHS={'◇':'method','▣':'property','•':'constant','◆':'class','ϟ':'event','▤':'module'};
/** Fixed-row listbox used by modeless tools. DOM cost depends on viewport, not item count. */
let nextListId=0;
const lists=new WeakMap();
export function refreshToolLists(root){
  for(const node of root.querySelectorAll('.tool-list'))lists.get(node)?.transferDocument();
}
export class ToolList {
  constructor(label,onSelect,onOpen){
    this.rowNodes=new Map();this.paintStats={created:0,reused:0,paints:0};this.paintFrame=null;this.id='tool-list-'+(++nextListId);this.items=[];this.selected=-1;this.rowHeight=19;this.onSelect=onSelect;this.onOpen=onOpen;
    this.root=el('div',{class:'tool-list',role:'listbox',tabindex:0,'aria-label':label});this.spacer=el('div',{class:'tool-list-spacer'});this.layer=el('div',{class:'tool-list-layer'});this.root.append(this.spacer,this.layer);this.root.addEventListener('scroll',()=>this.schedulePaint());
    this.root.addEventListener('click',e=>{const i=e.target.closest('[data-index]')?.dataset.index;if(i!==undefined)this.select(Number(i));});
    this.root.addEventListener('dblclick',()=>this.onOpen?.(this.items[this.selected]));
    this.root.addEventListener('keydown',e=>{const moves={ArrowDown:1,ArrowUp:-1,PageDown:Math.max(1,Math.floor(this.root.clientHeight/this.rowHeight)-1),PageUp:-Math.max(1,Math.floor(this.root.clientHeight/this.rowHeight)-1)};let next;
      if(moves[e.key])next=this.selected+moves[e.key];else if(e.key==='Home')next=0;else if(e.key==='End')next=this.items.length-1;
      else if(e.key==='Enter'){e.preventDefault();this.onOpen?.(this.items[this.selected]);return;}
      else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){const now=performance.now();this.prefix=(now-(this.prefixTime||0)<900?this.prefix||'':'')+e.key.toLowerCase();this.prefixTime=now;const found=this.items.findIndex(i=>i.label.toLowerCase().startsWith(this.prefix));if(found>=0)next=found;}
      if(next!==undefined){e.preventDefault();this.select(next);}
    });lists.set(this.root,this);this.observeDocument();
  }
  observeDocument(){
    this.observerWindow=this.root.ownerDocument.defaultView;
    // DOM writes during observer delivery can change scrollbar geometry and
    // trigger an undelivered-notifications error. Paint on the next frame.
    this.observer=new this.observerWindow.ResizeObserver(()=>this.schedulePaint());
    this.observer.observe(this.root);
  }
  cancelPaint(){
    if(this.paintFrame!==null){this.paintWindow.cancelAnimationFrame(this.paintFrame);this.paintFrame=null;}
  }
  schedulePaint(){
    if(this.disposed)return;
    const view=this.root.ownerDocument.defaultView;
    if(this.paintFrame!==null&&this.paintWindow===view)return;
    this.cancelPaint();this.paintWindow=view;
    this.paintFrame=view.requestAnimationFrame(()=>{
      this.paintFrame=null;
      if(this.disposed)return;
      if(this.root.ownerDocument.defaultView!==view){this.schedulePaint();return;}
      this.paint();
    });
  }
  transferDocument(){
    if(this.disposed)return;
    this.cancelPaint();this.observer.disconnect();this.observeDocument();this.paint();
  }
  set(items,key){this.items=items;this.spacer.style.height=items.length*this.rowHeight+'px';this.selected=key?items.findIndex(i=>i.key===key):0;if(this.selected<0&&items.length)this.selected=0;this.root.scrollTop=0;this.paint();this.onSelect?.(items[this.selected]);}
  select(index,notify=true){if(!this.items.length)return;this.selected=Math.max(0,Math.min(this.items.length-1,index));const top=this.selected*this.rowHeight;if(top<this.root.scrollTop)this.root.scrollTop=top;else if(top+this.rowHeight>this.root.scrollTop+this.root.clientHeight)this.root.scrollTop=top-this.root.clientHeight+this.rowHeight;this.paint();if(notify)this.onSelect?.(this.items[this.selected]);}
  paint(){
    if(this.disposed)return;this.cancelPaint();
    // Read viewport geometry once, then reconcile only changed visible rows.
    // Source: web.dev, Jeremy Wagner / Paul Lewis / Barry Pollard:
    // https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
    // Original implementation. No third-party source code copied.
    const scroll=this.root.scrollTop,height=this.root.clientHeight||190;
    const start=Math.max(0,Math.floor(scroll/this.rowHeight)-2),end=Math.min(this.items.length,start+Math.ceil(height/this.rowHeight)+5),nodes=[],retained=new Map();
    const attribute=(node,name,value)=>{value=String(value);if(node.getAttribute(name)!==value)node.setAttribute(name,value);};
    for(let i=start;i<end;i++){
      const item=this.items[i],selected=i===this.selected,label=String(item.label??''),glyph=GLYPHS[item.glyph]||'property';
      let record=this.rowNodes.get(i);
      if(!record){
        const kind=el('span',{class:'member-kind','aria-hidden':'true'},icon(glyph,16)),text=el('span',{class:'tool-list-label'},label);
        const node=el('div',{class:'tool-list-row',id:this.id+'-'+i,role:'option','data-index':i,style:{top:i*this.rowHeight+'px'}},kind,text);
        record={node,kind,text,glyph,label};this.paintStats.created++;
      }else this.paintStats.reused++;
      const node=record.node;
      if(record.label!==label){record.text.textContent=label;record.label=label;}
      if(record.glyph!==glyph){record.kind.replaceChildren(icon(glyph,16));record.glyph=glyph;}
      if(node.classList.contains('selected')!==selected)node.classList.toggle('selected',selected);
      attribute(node,'title',label);attribute(node,'aria-selected',selected);
      attribute(node,'aria-posinset',i+1);attribute(node,'aria-setsize',this.items.length);
      const top=i*this.rowHeight+'px';if(node.style.top!==top)node.style.top=top;
      nodes.push(node);retained.set(i,record);
    }
    let cursor=this.layer.firstChild;
    for(const node of nodes){if(node===cursor)cursor=cursor.nextSibling;else this.layer.insertBefore(node,cursor);}
    while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
    this.rowNodes=retained;this.paintStats.paints++;
    if(this.selected>=start&&this.selected<end)attribute(this.root,'aria-activedescendant',this.id+'-'+this.selected);
    else if(this.root.hasAttribute('aria-activedescendant'))this.root.removeAttribute('aria-activedescendant');
    if(!this.root.getAttribute('aria-label'))this.root.setAttribute('aria-label','Items');
  }
  dispose(){this.disposed=true;this.cancelPaint();this.observer.disconnect();this.rowNodes?.clear();lists.delete(this.root);}
}
