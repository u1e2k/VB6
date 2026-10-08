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

## Named-argument evaluation

The hosted .NET 10 `defaults` fixture exposed a real ordering failure: the
frontend/VM observed `21` for `Price(extra:=Mark(2), amount:=Mark(1))`, while
ordinary named VB.NET emission observed `12`. A named argument's textual position
is not an evaluation-order guarantee. The original expected trace is unchanged.

`call-order.js` emits a private, typed forwarding method only when supplied named
arguments permute their formal parameter order. Calls use positional arguments in
source order, and the forwarding method invokes the original declaration with
positional references in formal order. These methods are cached per module and
signature/permutation; they introduce no dispatcher, boxed argument vector or
additional runtime dependency. Already ordered calls remain native.

```vb
' Source: Price(extra:=Mark(2), amount:=Mark(1))
__vbCallOrder0(Mark(2), Mark(1))

Private Function __vbCallOrder0(ByVal extra As VbCurrency,
                               ByVal amount As VbCurrency) As VbCurrency
    Return Price(amount, extra)
End Function
```

An instance receiver is the first positional input and is evaluated once.
Matching ByRef storage remains a managed reference, including two aliases to the
same variable and mutations before a propagated exception. Explicit parentheses
still create a value temporary. Omitted defaults use fresh declaration-bound
local storage. No statements are hoisted outside the original expression, so
loop tests, untaken branches and `On Error Resume Next` retain their boundaries.

This adapter covers statically bound, fixed-arity Subs, Functions and property
getters/setters. Reordered event calls and ParamArray signatures require a separate
adapter and remain blocking. Unknown late-bound signatures and every property-value/narrowing copy-back
combination are not certified by this implementation. The source VM is a second execution path, not
a licensed Microsoft VB6 oracle.

Indexed writes capture receiver, lexical index arguments and then the right-hand
value through a typed `Sub` adapter. Ordinary CLR properties remain assignments
inside that Sub; method-backed properties invoke the selected Let or Set method.
A getter call is never used as an assignment location. Mutable index parameters
retain real ByRef references, and getter/Let/Set permutations use distinct cache
keys. The original source VM currently cannot execute named indexed writes, so
setter fixtures use explicit .NET output goldens rather than claiming a source-VM
differential pass for those operations.


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

A nonconstant position now uses an app-local typed positional adapter, capturing
handle, position and then storage in source order. Named framework arguments alone
do not establish that order: `Value` precedes `RecordNumber` in the framework
signature. Scalar reads forward real ByRef storage; writes capture typed scalar,
Currency, fixed-string or proven UDT values before invoking the framework.
Existing Currency and UDT read adapters already have the correct positional
signature. Literal and omitted positions retain direct scalar framework calls.
Binary byte positions and random record positions remain framework operations. Array/Variant/Object wire descriptors, records containing
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

`migration-call-order.test.mjs` and `migration-call-order-dotnet.test.mjs` exercise
receiver capture, omitted defaults, lexical side effects, aliases, parentheses,
exceptions and loop/branch placement in both output styles. The original failing
optional-Currency fixture remains part of the hosted gate.
`migration-setter-order.test.mjs` and `migration-setter-order-dotnet.test.mjs`
add ordinary native properties, write-only mutable indexes, independent Let/Set
selection, aliased indexes, receiver/index/RHS ordering and index exceptions
preventing RHS evaluation. The dedicated source-VM boundary test records its
unsupported named-write reference instead of substituting a modified interpreter.


`migration-file-order.test.mjs` and `migration-file-order-dotnet.test.mjs` check
side-effectful handle/position/storage expressions, a throwing position, and
independent 20-byte output goldens for Long, Currency, a fixed ASCII string and a
UDT. The source VM's file bytes and generated .NET file bytes must separately match
the same literal golden; output text and generated call syntax are also asserted.

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
