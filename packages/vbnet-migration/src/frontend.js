/** Single adapter to the Studio grammar. Packaging copies its complete dependency
 * closure; the distributed npm package has no imports outside its package root. */
import {logicalLines, splitTop, tokenize} from '../../../src/language/lexer.js';
import {parseExpression, parseCall} from '../../../src/language/expression.js';
import {parseDeclarations, parseParameters, parseProcedureHeader, parseTypeFields} from '../../../src/language/declarations.js';
import {parseModuleHeader, parseEnumMember} from '../../../src/language/module-syntax.js';
import {parseIfHeader, inlineElse} from '../../../src/language/statement-syntax.js';
import {parseForHeader, parseLabel, parseComputedBranch, parseFileStatement} from '../../../src/language/statement-headers.js';
import {findKeyword, statementParts, scanSyntax, stripComment} from '../../../src/language/source-scanner.js';
import {addDefaultTypes, defaultIdentifierType} from '../../../src/language/default-types.js';
import {preprocess} from '../../../src/language/conditional.js';
export const sharedFrontend = Object.freeze({logicalLines, splitTop, tokenize, parseExpression, parseCall,
  parseDeclarations, parseParameters, parseProcedureHeader, parseTypeFields, parseModuleHeader, parseEnumMember,
  parseIfHeader, inlineElse, parseForHeader, parseLabel, parseComputedBranch, parseFileStatement,
  findKeyword, statementParts, scanSyntax, stripComment, addDefaultTypes, defaultIdentifierType, preprocess});
