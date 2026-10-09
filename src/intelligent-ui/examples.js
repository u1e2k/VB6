export const UI_EXAMPLES=Object.freeze({
  app:{title:'Isolated interactive app',source:`<AppBlock title="Counter app" app_block_id="counter"><h2>Isolated counter</h2><button id="increment">Count: 0</button><script>let count=0;document.querySelector('#increment').onclick=event=>{event.target.textContent='Count: '+(++count)};</script></AppBlock>`},
  references:{title:'Inspected reference',source:'<title>Inspected project reference</title><Cite ref="preview-project" />'},
  calculator:{title:'Reactive estimate',source:`{@body const [seats, setSeats] = DIL.useState(8)}
{@body const monthly = seats * 29}
<box padding={3} border={true}>
<title>Team estimate</title>
<text>Drag the slider. The calculation stays local; no model request is made.</text>
<slider label="Seats" min={1} max={40} step={1} value={seats} onChange={v => setSeats(v)} />
<metric label="Monthly total" value={monthly} unit="USD" />
<button onClick={() => GenUI.issueNewTurn("Explain the estimate for " + seats + " seats at $" + monthly + " per month.")}>Queue a follow-up</button>
</box>`},
  controls:{title:'Real VB6 controls',source:`{@body const [name, setName] = DIL.useState("Ada")}
{@body const [enabled, setEnabled] = DIL.useState(true)}
<column gap={3} padding={3} border={true}>
<title>Existing VB6 control renderer</title>
<VB6TextBox label="Your name" value={name} onChange={value => setName(value)} />
<VB6CheckBox caption="Enable greeting" checked={enabled} onChange={value => setEnabled(value)} />
<VB6Label caption={enabled ? "Hello, " + name : "Greeting disabled"} />
<VB6Button caption="Copy greeting" disabled={!enabled} onClick={() => GenUI.copy("Hello, " + name)} />
</column>`},
  project:{title:'Bound project inventory',source:`# Project inventory
<text>Data below is bound from an inspected project snapshot.</text>
<metric label="Project" value={data.project.name} />
<table label="Modules" rows={data.project.documents} columns={[{key:"name",label:"Module"},{key:"kind",label:"Kind"},{key:"lines",label:"Lines"}]} pageSize={8} />
<chart label="Lines per module" data={data.project.documents} x="name" y="lines" kind="bar" />`}
});
export const INTELLIGENT_UI_INSTRUCTIONS=`
Interactive UI is available as an optional presentation, not an authority grant. Call vb6.ui.catalog for the exact component catalog and inspected data bindings. Use vb6.ui.present({source,title,dataRefs:{alias:"exact previously inspected tool name"}}) for grounded interactive tool results; never invent inspected data or references. Updates require the returned ui.revision as expectedUIRevision. Small explanations may instead stream an explicit fenced block labelled vb6-ui (not ordinary JavaScript). Syntax: <slider value={seats} onChange={v => setSeats(v)} />, {@body const [seats,setSeats] = DIL.useState(8)}, {seats * 29}, {#if test}...{:else}...{/if}, {#each items as item,i (item.id)}...{/each}. Use literal component names and catalog properties. Expressions are a bounded subset, not JavaScript: no host globals, import, fetch, eval, new, template strings or arbitrary statements. Use GenUI.issueNewTurn(text), copy(text), openUrl(url), callTool(name,args), updateContext(data) only in event callbacks. IDE message/tool/context actions are reviewed and queued, not automatically sent or executed. Project permissions and current revision checks still apply. Images and citations use host-resolved references; no URLs are fetched without a local action. Raw AppBlock execution requires an explicitly configured separate-origin sandbox and user approval. It never inherits project or tool permission. Provide useful explanatory text outside the UI fence as a fallback.`;
