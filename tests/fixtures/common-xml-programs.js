/** Shared compiled VB recipes, used by browser and real Windows COM checks. */
export const XML_TREE_PROGRAM=`Dim d As Object, root As Object, item As Object, n As Object, found As Object
Set d = CreateObject("MSXML2.DOMDocument.6.0")
d.async = False
Debug.Print d.loadXML("<items><item id='1'>First</item><item id='2'>Second</item></items>")
Set root = d.documentElement
Set d.documentElement = root
Debug.Print root.nodeName, root.childNodes.length
Set item = d.selectSingleNode("//item[@id='2']")
Debug.Print item.text, item.getAttribute("id"), item.ownerDocument Is d
Set n = d.createElement("item")
n.setAttribute "id", "3"
n.text = "Third"
root.appendChild n
Set found = d.selectNodes("//item")
Debug.Print found.length, found(2).text, root.lastChild Is n
For Each item In found
Debug.Print item.text
Next item
root.removeChild n
Debug.Print root.childNodes.length
Debug.Print d.loadXML("<broken>")
Debug.Print d.parseError.errorCode <> 0, d.documentElement Is Nothing
Debug.Print d.loadXML("<!DOCTYPE x [<!ENTITY a 'content'>]><x>&a;</x>")
Debug.Print d.parseError.errorCode <> 0`;
export const XML_BINARY_PROGRAM=`Dim d As Object, n As Object, b() As Byte
Set d = CreateObject("MSXML2.DOMDocument.6.0")
d.async = False
d.loadXML "<root xmlns:n='urn:test'><n:item>Value</n:item></root>"
d.setProperty "SelectionNamespaces", "xmlns:n='urn:test'"
Debug.Print d.selectSingleNode("//n:item").text
Set n = d.createElement("bytes")
n.dataType = "bin.base64"
n.text = "AAEC/w=="
b = n.nodeTypedValue
Debug.Print VarType(b), b(0), b(3)
n.dataType = "bin.hex"
n.nodeTypedValue = b
Debug.Print LCase$(n.text)
`;
