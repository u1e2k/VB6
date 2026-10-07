import {COMMON_XML_CLASSES,XML_DOCUMENT_METADATA,XML_NODE_METADATA,XML_ELEMENT_METADATA,XML_LIST_METADATA,XML_ATTRIBUTES_METADATA,XML_ERROR_METADATA,xmlDocumentAdapter} from './xml-dom.js';
/** Common portable Automation services. Importing does not start network or native I/O. */
import {createCommonAutomationRegistry,COMMON_HTTP_CLASSES} from './common-objects.js';
import {HttpTransport,HTTP_LIMIT} from './http-transport.js';
import {HttpRequest,httpMetadata} from './http-request.js';
import {AdoStream,STREAM_METADATA,STREAM_CONSTANTS} from './ado-stream.js';
export {COMMON_XML_CLASSES,XML_DOCUMENT_METADATA,XML_NODE_METADATA,XML_ELEMENT_METADATA,XML_LIST_METADATA,XML_ATTRIBUTES_METADATA,XML_ERROR_METADATA,xmlDocumentAdapter,createCommonAutomationRegistry,COMMON_HTTP_CLASSES,HttpTransport,HTTP_LIMIT,HttpRequest,httpMetadata,AdoStream,STREAM_METADATA,STREAM_CONSTANTS};
export const CommonAutomation=Object.freeze({COMMON_XML_CLASSES,xmlDocumentAdapter,createCommonAutomationRegistry,COMMON_HTTP_CLASSES,HttpTransport,HTTP_LIMIT,HttpRequest,httpMetadata,AdoStream,STREAM_METADATA,STREAM_CONSTANTS});
