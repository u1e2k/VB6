param([string]$OutputPath, [switch]$Child)
$ErrorActionPreference = 'Stop'
# Diagnostic only: these observations never turn a failing executable into a pass.
# Run in the same 32-bit ABI as the PE32 target, independently of generated code.
if (-not $Child -and [Environment]::Is64BitProcess) {
  & "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -File $PSCommandPath -OutputPath $OutputPath -Child
  if ($LASTEXITCODE -ne 0) { throw 'The x86 Variant diagnostic probe failed' }
  exit 0
}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NativeVariantArithmeticProbe {
  [StructLayout(LayoutKind.Explicit, Size=16)]
  public struct Variant {
    [FieldOffset(0)] public ushort Type;
    [FieldOffset(8)] public long Bits;
    [FieldOffset(8)] public double Double;
    [FieldOffset(8)] public float Single;
  }
  [DllImport("oleaut32.dll", PreserveSig=true)]
  public static extern int VarDiv(ref Variant left, ref Variant right, out Variant result);
  [DllImport("oleaut32.dll", PreserveSig=true)]
  public static extern int VariantClear(ref Variant value);
  public static string[] Run() {
    var lines = new System.Collections.Generic.List<string>();
    foreach (ushort type in new ushort[]{2,3,4,5,6,7,11,17}) {
      foreach (int numerator in new int[]{0,1,-1}) {
        var a = new Variant { Type=type };
        var b = new Variant { Type=type };
        if (type==4) a.Single=numerator;
        else if (type==5 || type==7) a.Double=numerator;
        else a.Bits=type==6 ? numerator*10000L : numerator;
        Variant result;
        int hr=VarDiv(ref a,ref b,out result);
        lines.Add(String.Format("vt={0},left={1},right=0,hr=0x{2:X8},resultType={3},resultBits=0x{4:X16}",type,numerator,hr,result.Type,result.Bits));
        VariantClear(ref result);
      }
    }
    return lines.ToArray();
  }
}
'@
$report = [ordered]@{architecture=if([Environment]::Is64BitProcess){'x64'}else{'x86'};platform=[Environment]::OSVersion.VersionString;observations=[NativeVariantArithmeticProbe]::Run()}
$json = $report | ConvertTo-Json -Depth 6
$json | Write-Host
if ($OutputPath) { $json | Set-Content -Encoding utf8 $OutputPath }
