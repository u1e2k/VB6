// Synthetic PE metadata fixture; deliberately NOT a runnable Microsoft-compiled EXE.
export function classicPEFixture(dll='MSVBVM60.DLL') {
  const b=Buffer.alloc(1024); b.write('MZ'); b.writeUInt32LE(0x80,0x3c); b.write('PE\0\0',0x80);
  b.writeUInt16LE(0x14c,0x84); b.writeUInt16LE(1,0x86); b.writeUInt16LE(224,0x94); b.writeUInt16LE(0x102,0x96);
  const o=0x98; b.writeUInt16LE(0x10b,o); b.writeUInt32LE(512,o+60); b.writeUInt16LE(2,o+68); b.writeUInt32LE(16,o+92);
  b.writeUInt32LE(0x1000,o+104); b.writeUInt32LE(40,o+108);
  const s=o+224; b.write('.idata',s); b.writeUInt32LE(512,s+8); b.writeUInt32LE(0x1000,s+12); b.writeUInt32LE(512,s+16); b.writeUInt32LE(512,s+20);
  b.writeUInt32LE(0x1050,512+12); b.write(dll+'\0',512+80); return b;
}
