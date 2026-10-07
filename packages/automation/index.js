/** Framework-independent Automation/COM adapters and the VM value contract. */
export {AutomationRegistry,automationInvoke,automationMember,automationReference,automationEnumerate,automationSubscribe,isAutomationObject} from '../../src/runtime/automation.js';
export {registerComClass,createComAutomationRegistry} from '../../src/runtime/com-automation.js';
export {encodeAutomationValue,decodeAutomationValue} from '../../src/runtime/automation-wire.js';
export {VBError} from '../../src/language/errors.js';
export {NOTHING,MISSING,VBArray,VBCollection,VBDictionary,VBErrorValue,VBCurrency,VBDecimal,VBScalar,Cell,Ref,tagScalar,scalarType,unbox,readScalar} from '../../src/runtime/values.js';
export {COMMON_XML_CLASSES,xmlDocumentAdapter,CommonAutomation,createCommonAutomationRegistry,COMMON_HTTP_CLASSES,HttpTransport,HTTP_LIMIT,HttpRequest,httpMetadata,AdoStream,STREAM_METADATA,STREAM_CONSTANTS} from '../../src/automation/index.js';
export {VirtualFileSystem} from '../../src/runtime/filesystem.js';
