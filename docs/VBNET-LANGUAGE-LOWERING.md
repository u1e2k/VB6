# Property, optional-argument and binary-record lowering

This extends the native-first VB6 to VB.NET / .NET 10 pipeline. It does not change
its meaning of success: no known converter blockers is not a successful SDK build,
a completed migration of every source construct, or a VB6 differential proof.
Available original files remain in the export. Known unsupported semantics keep
blocking source-linked diagnostics and the generated MSBuild review guard.

## Property representation

`property-plan.js` groups source accessors case-insensitively and selects one
representation for declarations, source-class interfaces and bound call sites.
Ordinary properties with ByVal indexes remain idiomatic VB.NET properties.
A method representation is selected when a source property has independent
`Property Let` and `Property Set`, mutates a ByRef index, or needs an optional
preserving Currency parameter that cannot be stored in CLR optional metadata.

The emitted names are `__vbGet_Name`, `__vbLet_Name` and `__vbSet_Name`. This is a
representation adapter, not a second runtime: it uses ordinary functions/subs
and real managed ByRef parameters. The existing reserved-name diagnostic prevents
silent collisions with source identifiers beginning `__vb`.

```vb
' VB6
Public Property Get Item(ByRef index As Long) As Long
    index = index + 1
    Item = stored
End Property
Public Property Let Item(ByRef index As Long, ByVal amount As Long)
    index = index + 2
    stored = amount
End Property
```

The corresponding getter and setter use `Integer` parameters in VB.NET. A bound
`box.Item(i) = 42` calls `box.__vbLet_Item(i, amount:=42S)`. A bound read calls
`box.__vbGet_Item(i)`. The same live `i` location is passed in both cases. `Set`
assignment selects the Set accessor; value assignment selects Let. Their bodies
are never merged into one ambiguous setter. Write-only binding obtains its type
from the final setter value parameter, not from a nonexistent getter.

An assignment to the current getter's result remains a result assignment, not a
recursive setter call. A missing requested accessor is diagnosed. Statically known
default indexed properties expand to the same bound plan. Companion interfaces
and source `Implements` methods use matching renamed signatures.

### Dynamic dispatch boundary

A CLR reflection lookup of the original property name cannot discover renamed
accessor methods or distinguish independent Let/Set contracts. Migrated calls to
method-backed properties must therefore remain statically bound, or use a verified
application dispatch adapter. Late-bound `Object`/Variant member access and
`CallByName` to these renamed contracts are not preserved by declaration lowering.
The converter does not yet automatically diagnose every such dynamic call. Review
all late-bound call sites before deployment; a known adapter must replace the
complete operation, not just rename one side of the call.

Parameterless default-member coercions, native COM dispatch, and every ByRef
property-value/aliasing combination are not implemented by this accessor plan.
Compatibility array-element references still have their existing separate guard.

## Optional preserving Currency parameters

VB6 Currency is represented by `VbCurrency` when preservation is selected. CLR
optional metadata cannot contain an arbitrary structure value. Instead of boxing
the public contract or adding a runtime dispatcher, `optional-parameters.js` emits
a required, typed core plus a linear set of suffix-forwarding overloads.

```vb
' VB6
Public Function Price(Optional ByVal amount As Currency = 1.2345@) As Currency
    Price = amount
End Function
```

Its preserving VB.NET representation in a standard module has the following shape:

```vb
Public Function Price(ByVal amount As VbCurrency) As VbCurrency
    Return amount
End Function

Public Function Price() As VbCurrency
    Dim __vbDefault_amount As VbCurrency = VbCurrency.FromDecimal(1.2345D)
    Return Price(__vbDefault_amount)
End Function
```

Standard modules overload implicitly, so their declarations omit the `Overloads`
modifier (which would cause compiler error BC36917). Class and interface
declarations retain that modifier consistently across the overload set.

Supplied matching ByRef arguments keep their original storage. Every omitted
ByRef default gets fresh local storage in a forwarding overload. Calls omitting
middle arguments or using named arguments explicitly bind missing defaults while
retaining the lexical order of supplied arguments. No exponential overload set is
created for arbitrary named-argument subsets.

Defaults come from the frontend's declaration-scope `defaultScalars`, not an AST
re-evaluated in the caller's module. Private constants and shadowing therefore do
not redirect defaults. Currency endpoints are emitted from their exact decimal
representation without conversion through a JavaScript binary64 Number. Date,
string, Boolean, numeric and Missing defaults accompanying Currency are retained
in their selected representations. Unbound defaults remain blocking diagnostics.

Ordinary scalar optional parameters are not rewritten. Approved Currency-to-Decimal
modernization also retains native optional metadata and does not select the
preserving overload adapter. Source-class interfaces and their implementing
methods expose consistent overloads. Read-only indexed getters can use the same
plan; unsupported frontend signatures are not relaxed to force acceptance.

## Binary and random file records

`file-record-layout.js` admits a scalar or recursively nested UDT only when its
emitted fields are compatible with the framework's Visual Basic record layout.
Supported scalar fields are Byte, Boolean, Integer, Long, Single, Double, Date and
String. Fixed string lengths may be literals or already bound constant expressions.
Fields containing arrays, Variant/Object, Currency compatibility structures, lazy
As New storage, recursive layouts or unresolved fixed lengths are not certified.

The converter emits `<Microsoft.VisualBasic.VBFixedString(N)>` for fixed UDT string
fields. Scalar fixed-string I/O supplies `StringIsFixedLength:=True` instead of
accidentally writing a variable-string descriptor. Scalar preserving Currency uses
an exact signed 64-bit value scaled by 10,000. A Currency field inside a UDT is not
made eligible by this scalar adapter. Approved Decimal modernization does not
silently redefine a legacy Currency binary file: it remains a blocking mismatch.

Framework `FileGet`/`FilePut` handle the proven UDT layouts. Gets box the structure
as `System.ValueType` and copy the result back in a `Finally` block. This preserves
updated fields if the framework reports an error after partially reading a record.
The adapter is generated in the application's owning module/class. Visual Basic
file channels are keyed by the calling assembly; moving only the Get adapter into
an external compatibility DLL would address a different channel table than an
application-level `FileOpen`. No shared file-channel runtime is added.

Named framework arguments retain source handle, position and storage evaluation
order even though the framework signature declares its value parameter before
its record number. Binary byte positions and random record positions remain
framework operations. Array/Variant/Object wire descriptors, records containing
compatibility-owned storage, and property destinations without a verified file
reference adapter retain explicit diagnostics rather than guessed serialization.

## Permanent regression coverage

`migration-property-accessors.test.mjs` covers mutable indexes, independent
Let/Set dispatch, write-only binding, interfaces, default indexed calls and ordinary
native properties. Dynamic-dispatch compatibility is a separate, unverified
boundary and is not claimed by these statically bound fixtures.

`migration-optional.test.mjs` covers overload counts, ByRef storage contracts,
exact Currency endpoints, declaring-module defaults, interfaces, indexed getters
and native/approved-Decimal output. `migration-optional-dotnet.test.mjs` compiles
and executes native and compatibility fixtures with `Option Strict On`, asserting
named argument side-effect order, omitted defaults, Missing and ByRef writes.

`migration-file-records.test.mjs` covers layout acceptance/rejection, fixed-length
constant binding and argument ordering. The SDK fixtures in
`migration-dotnet.test.mjs` compare independent byte goldens: a two-byte Boolean,
a four-byte fixed ASCII string, a signed scaled Currency value, and a 12-byte
nested record placed at random record number two. These are not just writer/reader
round trips. They do not prove every locale/code-page or legacy file combination.

The shared SDK harness reports installed SDKs, actual commands, exit statuses and
stdout/stderr under `reports/vbnet-migration/dotnet`. Missing SDKs are explicit
skips outside required CI. `VB6_REQUIRE_DOTNET=1` requires a real .NET 10 SDK.
A Node source-generation pass must never be relabeled a .NET execution pass.

## Primary references

- [Visual Basic optional parameters](https://learn.microsoft.com/en-us/dotnet/visual-basic/programming-guide/language-features/procedures/optional-parameters)
- [.NET 10 FileGet overloads and record behavior](https://learn.microsoft.com/en-us/dotnet/api/microsoft.visualbasic.filesystem.fileget?view=net-10.0)
- [.NET 10 FilePut overloads and record behavior](https://learn.microsoft.com/en-us/dotnet/api/microsoft.visualbasic.filesystem.fileput?view=net-10.0)
- [Microsoft Visual Basic FileSystem implementation](https://github.com/dotnet/runtime/blob/v10.0.0/src/libraries/Microsoft.VisualBasic.Core/src/Microsoft/VisualBasic/FileSystem.vb)

Framework documentation, source inspection and .NET tests are not differential
execution against a licensed Microsoft VB6 compiler. Such evidence must be recorded
separately before claiming full behavioral compatibility.
