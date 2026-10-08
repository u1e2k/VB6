/** Native dense grid storage bounds. HWND painting is virtualized; one cell never
 * creates a child window. These are exporter limits, not Microsoft VB6 limits. */
export const NATIVE_GRID_TYPES = new Set(['MSFlexGrid', 'MSHFlexGrid', 'DataGrid']);
export const NATIVE_GRID_MAX_CELLS = 1048576;
export const NATIVE_GRID_FIELDS = Object.freeze({
  hwnd:0, epoch:1, rows:2, cols:3, fixedrows:4, fixedcols:5, row:6, col:7,
  rowsel:8, colsel:9, toprow:10, leftcol:11, redraw:12, locked:13, cells:14,
  widths:15, heights:16, rowdata:17, coldata:18, alignment:19,
  selectionmode:20, scrollbars:21, gridlines:22, backcolorfixed:23,
  forecolorfixed:24, backcolorsel:25, forecolorsel:26, gridcolor:27,
  edit:28, editrow:29, editcol:30, editversion:31, version:32, changing:33,
  cachedwidth:34, cachedheight:35, mousewheel:36, format:37
});
export const NATIVE_GRID_PROPERTIES = Object.freeze([
 'Rows','Cols','FixedRows','FixedCols','Row','Col','RowSel','ColSel','TopRow','LeftCol',
 'Redraw','Locked','SelectionMode','ScrollBars','GridLines','BackColorFixed',
 'ForeColorFixed','BackColorSel','ForeColorSel','GridColor'
]);
const integer=(value,name,min,max)=>{value=Number(value);if(!Number.isInteger(value)||value<min||value>max)throw new TypeError(`Native grid ${name} must be ${min}..${max}`);return value;};
export function nativeGridSeed(control) {
 const p=control.properties||{},type=control.type;
 if(!NATIVE_GRID_TYPES.has(type))throw new TypeError('Unknown native grid type: '+type);
 const rows=integer(p.Rows??5,'Rows',0,100001),cols=integer(p.Cols??3,'Cols',1,10000);
 if(rows*cols>NATIVE_GRID_MAX_CELLS)throw new TypeError('Native grid exceeds 1048576 cells');
 const fixedrows=integer(p.FixedRows??(type==='DataGrid'?1:1),'FixedRows',0,rows),fixedcols=integer(p.FixedCols??(type==='DataGrid'?0:1),'FixedCols',0,cols);
 const row=integer(p.Row??Math.min(fixedrows,Math.max(0,rows-1)),'Row',0,Math.max(0,rows-1)),col=integer(p.Col??Math.min(fixedcols,cols-1),'Col',0,cols-1);
 const data=p.GridData??[];if(!Array.isArray(data)||data.length>rows)throw new TypeError('Native GridData requires rows within the authored grid');
 const cells=[];
 for(let r=0;r<data.length;r++){if(!Array.isArray(data[r])||data[r].length>cols)throw new TypeError('Native GridData requires bounded row arrays');for(let c=0;c<data[r].length;c++){
  const value=data[r][c]??'';if(!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw new TypeError('Native GridData cells require scalar text');
  const text=String(value);if(text.length>1048576)throw new TypeError('Native GridData cell exceeds the String bound');if(text)cells.push({row:r,col:c,text});
 }}
 const fields={rows,cols,fixedrows,fixedcols,row,col,rowsel:integer(p.RowSel??row,'RowSel',0,Math.max(0,rows-1)),colsel:integer(p.ColSel??col,'ColSel',0,cols-1),toprow:fixedrows,leftcol:fixedcols,redraw:p.Redraw===0?0:-1,locked:p.Locked?-1:0,selectionmode:integer(p.SelectionMode??0,'SelectionMode',0,2),scrollbars:integer(p.ScrollBars??3,'ScrollBars',0,3),gridlines:integer(p.GridLines??1,'GridLines',0,1)};
 for(const [name,value]of [['backcolorfixed',p.BackColorFixed??-2147483633],['forecolorfixed',p.ForeColorFixed??-2147483630],['backcolorsel',p.BackColorSel??-2147483635],['forecolorsel',p.ForeColorSel??-2147483634],['gridcolor',p.GridColor??-2147483633]])fields[name]=integer(value,name,-2147483648,4294967295)|0;
 const sizes=(input,count,fallback,name)=>{if(input===undefined)return Array(count).fill(fallback);if(!Array.isArray(input)||input.length>count)throw new TypeError('Invalid native grid '+name);return Array.from({length:count},(_,i)=>integer(input[i]??fallback,name,0,300000));};
 return Object.freeze({fields:Object.freeze(fields),cells:Object.freeze(cells),widths:Object.freeze(sizes(p.ColWidths,cols,1200,'ColWidths')),heights:Object.freeze(sizes(p.RowHeights,rows,315,'RowHeights')),formatString:p.FormatString===undefined?'':String(p.FormatString)});
}
