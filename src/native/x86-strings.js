/** Checked IA-32 string/flag instructions. Implicit operands are ESI, EDI,
 * ECX and AL/AX/EAX. Callers own pointer validity, counts and direction state;
 * restore CLD before returning to Windows or calling a system function.
 */
const opcodes=Object.freeze({movs:0xa4,cmps:0xa6,stos:0xaa,lods:0xac,scas:0xae});
export const x86StringMethods={
  stringInstruction(name,width=8,repeat=null) {
    if(!Object.hasOwn(opcodes,name)||![8,16,32].includes(width))throw new Error('Invalid x86 string instruction');
    const comparing=name==='cmps'||name==='scas';
    const valid=repeat===null||(comparing?['repe','repz','repne','repnz'].includes(repeat):repeat==='rep');
    if(!valid)throw new Error('Invalid x86 string repeat prefix');
    const bytes=[];
    if(repeat!==null)bytes.push(repeat==='repne'||repeat==='repnz'?0xf2:0xf3);
    if(width===16)bytes.push(0x66);
    return this.emit(...bytes,opcodes[name]+(width===8?0:1));
  },
  repCompare(width=8,equal=true) {
    if(typeof equal!=='boolean')throw new Error('String comparison repeat condition must be Boolean');
    return this.stringInstruction('cmps',width,equal?'repe':'repne');
  },
  repScan(width=8,equal=false) {
    if(typeof equal!=='boolean')throw new Error('String scan repeat condition must be Boolean');
    return this.stringInstruction('scas',width,equal?'repe':'repne');
  },
  std(){return this.emit(0xfd);},
  clc(){return this.emit(0xf8);},stc(){return this.emit(0xf9);},cmc(){return this.emit(0xf5);},
  pushFlags(){return this.emit(0x9c);},popFlags(){return this.emit(0x9d);}
};
