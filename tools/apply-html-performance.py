# Temporary, reviewed source transformation. Deleted after its resulting sources
# and generated distributions are committed. Stops on an unexpected source body.
from pathlib import Path
from hashlib import sha256

def replace_region(path, start, end, expected, replacement):
    file = Path(path)
    source = file.read_text()
    a = source.index(start)
    b = source.index(end, a)
    assert sha256(source[a:b].encode()).hexdigest() == expected, path + ': reviewed source changed'
    file.write_text(source[:a] + replacement + source[b:])

replace_region('src/controls/controls.js', 'function updateMnemonic(', 'function units(',
    'dfc792438a4f9edb8be32ed042db1aaa1b58f74102936cad0d88ce5f2917c3cf', r'''// Keep unchanged DOM text stable; see docs/HTML-RENDERING-PERFORMANCE.md for provenance.
const mnemonicCache=new WeakMap(),optionCache=new WeakMap();
function updateMnemonic(node,text){text=String(text??'');if(mnemonicCache.get(node)===text)return;mnemonicCache.set(node,text);node.replaceChildren();let plain='';for(let i=0;i<text.length;i++){if(text[i]==='&'&&text[i+1]){if(text[i+1]==='&'){plain+='&';i++;}else{if(plain)node.append(plain);plain='';node.append(el('u',{},text[++i]));}}else plain+=text[i];}if(plain)node.append(plain);}
function selectOptions(node,items,index){const labels=items.map(String),previous=optionCache.get(node);if(!previous||previous.length!==labels.length||labels.some((v,i)=>v!==previous[i])){node.replaceChildren(...labels.map((text,i)=>el('option',{value:i},text)));optionCache.set(node,labels);}if(node.selectedIndex!==index)node.selectedIndex=index;}
''')

replace_region('src/controls/controls.js', '    n.hidden=', "    if(['Frame'",
    '74e074227ace18549e8f536e7c120003d98cc86fe9602764268cc6ae37f55915', r'''    const hidden=!this.design&&(!truth(p.Visible)||NONVISUAL_TYPES.has(this.type)),disabled=!truth(p.Enabled),title=String(p.ToolTipText||''),tabIndex=truth(p.TabStop)?Number(p.TabIndex)||0:-1,label=stripMnemonic(p.Caption||this.model.name);
    if(n.hidden!==hidden)n.hidden=hidden;n.classList.toggle('disabled',disabled);if(n.title!==title)n.title=title;if(n.tabIndex!==(this.input?-1:tabIndex))n.tabIndex=this.input?-1:tabIndex;if(n.getAttribute('aria-label')!==label)n.setAttribute('aria-label',label);
    if(this.input){if(!['Slider','UpDown','CheckBox','OptionButton'].includes(this.type))this.input.style.backgroundColor=oleColor(p.BackColor);this.input.style.color=oleColor(p.ForeColor);if(this.input.disabled!==disabled)this.input.disabled=disabled;if(this.input.tabIndex!==tabIndex)this.input.tabIndex=tabIndex;}
''')

replace_region('src/designer/designer.js', '  renderSelection(){', '  position(event)',
    'ee866758958cbe0437224712d32564501544a62e0ef85c656861d1592fbd378e', r'''  renderSelection(){
    if(!this.overlay||!this.module)return;
    // Measure all selected boxes before any overlay DOM writes. Reading one
    // box after inserting the previous outline forced one layout per control.
    // Attribution: https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing
    // Original application-specific implementation, not copied sample code.
    const items=this.selected(),views=new Map(this.formView.controls.map(v=>[v.model.id,v]));
    const parent=this.formView.content.getBoundingClientRect(),rectangles=new Map();
    for(const control of this.showTabOrder?this.module.form.controls:items){
      const view=views.get(control.id);if(!view)continue;const r=view.node.getBoundingClientRect();
      rectangles.set(control.id,{x:(r.left-parent.left)/this.zoom,y:(r.top-parent.top)/this.zoom,width:r.width/this.zoom,height:r.height/this.zoom});
    }
    const width=!items.length?this.formView.node.offsetWidth*this.zoom:0,height=!items.length?this.formView.node.offsetHeight*this.zoom:0;
    const nodes=[],handles=[];
    if(!items.length&&this.formSelection){
      for(const [edge,x,y] of [['nw',0,0],['n',width/2,0],['ne',width,0],['w',0,height/2],['e',width,height/2],['sw',0,height],['s',width/2,height],['se',width,height]]){
        const enabled=['e','s','se'].includes(edge);
        handles.push(el('div',{class:'designer-form-handle'+(enabled?'':' disabled'),title:enabled?'Resize form':'Form sizing handle','data-resize-form':edge,style:{left:Math.round(8+x-3)+'px',top:Math.round(8+y-3)+'px'}}));
      }
    }
    for(const control of items){
      const r=rectangles.get(control.id);if(!r)continue;
      const box=el('div',{class:'selection-outline'+(control.id===this.primaryId?' primary-selection':''),style:{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'}});
      for(const handle of ['nw','n','ne','e','se','s','sw','w'])box.append(el('i',{class:'selection-handle '+handle,'data-handle':handle,'data-id':control.id}));
      nodes.push(box);
    }
    if(this.showTabOrder)for(const control of this.module.form.controls){const r=rectangles.get(control.id);if(r)nodes.push(el('button',{class:'tab-order-marker','data-order-id':control.id,style:{left:r.x+'px',top:r.y+'px'},text:control.properties.TabIndex||0}));}
    this.overlay.replaceChildren(...nodes);this.formSelection?.replaceChildren(...handles);
  }
''')

replace_region('src/designer/designer.js', '  refreshControlPositions(){', '  applyProperty(',
    '4b3346d02c606b58e53e8b92aee9c648ed2ce381fea06b087344374f62f0ac76', r'''  refreshControlPositions(ids=null){const models=new Map(this.module.form.controls.map(c=>[c.id,c]));for(const view of this.formView.controls){if(ids&&!ids.has(view.model.id))continue;const model=models.get(view.model.id);if(model){Object.assign(view.props,model.properties);view.refresh();}}this.renderSelection();}
''')

file = Path('src/designer/designer.js')
source = file.read_text()
assert source.count('this.refreshControlPositions();') == 3
file.write_text(source.replace('this.refreshControlPositions();', 'this.refreshControlPositions(this.selection);'))
