export type MigrationTarget = 'auto' | 'console' | 'library' | 'winforms';
export type MigrationPlatform = 'x86' | 'x64' | 'AnyCPU' | 'arm64';
export interface Diagnostic { readonly code: string; readonly severity: 'error' | 'warning' | 'info'; readonly message: string; readonly source: string; readonly line: number; readonly column: number; readonly project?: string; }
export interface SourceMapping { generatedFile: string; generatedLine: number; source: string; sourceLine: number; }
export interface VB6Module { name: string; kind: 'module' | 'class' | 'form'; code: string; form?: Record<string, unknown>; [key: string]: unknown; }
export interface VB6Project { name: string; modules: VB6Module[]; startup?: string; settings?: Record<string, unknown>; [key: string]: unknown; }
export type MigrationFiles = Record<string, string | Uint8Array>;
export interface MigrationOptions { target?: MigrationTarget; platform?: MigrationPlatform; includeOriginals?: boolean; includeUnresolved?: boolean; strict?: boolean; maxSourceBytes?: number; signal?: AbortSignal; assemblyName?: string; rootNamespace?: string; plugins?: readonly MigrationPlugin[]; }
export interface ExpressionUsage { assignment?: boolean; argument?: boolean; callee?: boolean; receiver?: boolean; reference?: boolean; }
export type MigrationExpression =
  | {kind: 'literal'; value: string | number | boolean | null; valueType?: string}
  | {kind: 'id' | 'new' | 'addressOf'; name: string}
  | {kind: 'currency' | 'date'; value: string}
  | {kind: 'nothing' | 'empty' | 'missing' | 'with'}
  | {kind: 'group' | 'byval'; expr: MigrationExpression}
  | {kind: 'unary'; op: string; expr: MigrationExpression}
  | {kind: 'binary'; op: string; left: MigrationExpression; right: MigrationExpression}
  | {kind: 'named'; name: string; expr: MigrationExpression}
  | {kind: 'typeof'; name: string; expr: MigrationExpression}
  | {kind: 'member'; object: MigrationExpression; name: string}
  | {kind: 'call'; callee: MigrationExpression; args: MigrationExpression[]};
export interface MigrationContext { readonly project: VB6Project; readonly options: MigrationOptions; readonly diagnostics: Diagnostic[]; readonly files: MigrationFiles; readonly module?: Record<string, unknown>; readonly proc?: Record<string, unknown>; readonly target: MigrationTarget; add?(code: string, message: string, severity?: Diagnostic['severity'], details?: Record<string,unknown>): Diagnostic; addFile?(path: string, content: string | Uint8Array): void; [key: string]: unknown; }
export interface ControlExtension { type: string; initialization?: string[]; }
/** Hooks are synchronous and trusted JavaScript. They are never loaded from project data. */
export interface MigrationPlugin {
  id: string;
  analyze?(project: VB6Project, context: MigrationContext): void;
  expression?(input: {node: MigrationExpression | null | undefined; usage: ExpressionUsage}, context: MigrationContext): string | null | undefined;
  statement?(input: {text: string; procedure: Record<string,unknown>}, context: MigrationContext): string | null | undefined;
  control?(input: {node: Record<string,unknown>; module: Record<string,unknown>}, context: MigrationContext): ControlExtension | null | undefined;
  finalize?(files: MigrationFiles, context: MigrationContext): void;
}
export interface MigrationReport { schema: number; success: boolean; errors: number; warnings: number; diagnostics: Diagnostic[]; target?: MigrationTarget; targetFramework?: 'net10.0' | 'net10.0-windows'; platform?: MigrationPlatform; validation: {dotnetBuild: 'not-run'; behavioralEquivalence: 'not-certified'; generated?: boolean}; [key: string]: unknown; }
export interface MigrationResult { success: boolean; files: MigrationFiles; report: MigrationReport; diagnostics: Diagnostic[]; sourceMap: SourceMapping[]; projectFile: string | null; }
export interface MigrationArchive extends MigrationResult { bytes: Uint8Array; fileName: string; }
export interface VbNetMigrator { convertProject(project: VB6Project, options?: MigrationOptions): MigrationResult; exportProject(project: VB6Project, options?: MigrationOptions): MigrationArchive; }
export class MigrationError extends Error { readonly diagnostics: Diagnostic[]; constructor(message: string, diagnostics?: Diagnostic[]); }
export function createVbNetMigrator(options?: {plugins?: readonly MigrationPlugin[]; compile?: (project: VB6Project, options: {retainSyntax: true}) => unknown}): VbNetMigrator;
export function convertVbNetProject(project: VB6Project, options?: MigrationOptions): MigrationResult;
export function exportVbNetProject(project: VB6Project, options?: MigrationOptions): MigrationArchive;
export function migrationZip(files: MigrationFiles): Uint8Array;
export const MIGRATION_SCHEMA: 1;
export const MIGRATION_VERSION: '0.1.0';
export const CONTROL_MAPPINGS: Readonly<Record<string,string>>;
export const SIMPLE_MEMBERS: Readonly<Record<string,string>>;
export const INTRINSICS: Readonly<Record<string,string>>;
export const CAPABILITIES: Readonly<Record<string,string>>;
