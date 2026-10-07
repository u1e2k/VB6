import type {Diagnostic, VB6Project} from './index.js';
export const MIGRATION_USAGE: string;
export interface MigrationCliSettings {
  out?: string; target?: string; platform?: string; root?: string; entry?: string;
  namespace?: string; review?: boolean; strict?: boolean; 'no-originals'?: boolean;
  inspect?: boolean; help?: boolean;
}
export function parseMigrationArguments(args: string[]): {input?: string; settings: MigrationCliSettings};
export function loadMigrationInput(file: string, settings?: Pick<MigrationCliSettings, 'root' | 'entry'>): Promise<{project: VB6Project; diagnostics: Diagnostic[]}>;
export function runMigrationCli(args: string[], streams?: {stdout?: (message: string) => void; stderr?: (message: string) => void}): Promise<number>;
