import {
  TEMPLATE_SOURCE_LIMITS,
  templateContentHash,
  type SourceCheck,
  type TemplateSourceFile,
} from '../domain/sheetTemplateSources';
import { decodeSheetTemplateFile } from '../domain/sheetTemplates';
import { isTauri } from '@tauri-apps/api/core';
import { nativePathOf } from './files';

/**
 * Session-only access to external template files. Only files the person
 * picked in this session can be read again; nothing here is saved in the
 * project, and a stored hint or path never grants access.
 */
type Access = { reread: () => Promise<File> };

const access = new Map<string, Access>();
const checks = new Map<string, SourceCheck>();
const sequence = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function publish() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeSourceChecks(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const sourceChecksVersion = () => version;
export const sourceCheck = (linkId: string): SourceCheck =>
  checks.get(linkId) ?? { state: 'unchecked' };
export const hasSourceAccess = (linkId: string) => access.has(linkId);

/** Reads with size and time limits; a corrupt or future file is rejected. */
export async function readTemplateSourceFile(
  file: File,
  signal?: AbortSignal,
  timeoutMs: number = TEMPLATE_SOURCE_LIMITS.readMs,
): Promise<TemplateSourceFile> {
  if (file.size > TEMPLATE_SOURCE_LIMITS.bytes)
    throw Error('Escolha um arquivo de modelo com até 30 MB.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Error('A leitura do modelo excedeu o tempo limite.')),
      timeoutMs,
    );
  });
  const aborted = new Promise<never>((_, reject) => {
    signal?.addEventListener('abort', () =>
      reject(Error('Leitura cancelada.')),
    );
  });
  try {
    const raw = await Promise.race([file.text(), timeout, aborted]);
    const decoded = decodeSheetTemplateFile(raw);
    return {
      ...decoded,
      contentHash: await templateContentHash(
        decoded.template,
        decoded.properties,
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Remember a file picked explicitly in this session for later checks. */
export function grantSourceAccess(linkId: string, file: File) {
  const path = nativePathOf(file);
  access.set(linkId, {
    reread: async () => {
      if (path && isTauri()) {
        const { readFile } = await import('@tauri-apps/plugin-fs');
        const data = await readFile(path);
        return new File([new Uint8Array(data).buffer], file.name);
      }
      // Browsers only keep the picked snapshot; a changed file needs a new pick.
      return new File([await file.arrayBuffer()], file.name);
    },
  });
}

export function forgetSourceAccess(linkId: string) {
  access.delete(linkId);
  checks.delete(linkId);
  publish();
}

/** Records a result for a file read outside `checkSource` (pick, relocate). */
export function recordSourceRead(linkId: string, file: TemplateSourceFile) {
  sequence.set(linkId, (sequence.get(linkId) ?? 0) + 1);
  checks.set(linkId, {
    state: 'read',
    checkedAt: Date.now(),
    contentHash: file.contentHash,
    templateId: file.template.id,
    revision: file.template.revision,
  });
  publish();
}

/**
 * Re-reads the authorized file. Only the latest request updates the state, so
 * a slow answer cannot overwrite a newer one. Never applies content.
 */
export async function checkSource(
  linkId: string,
  signal?: AbortSignal,
): Promise<{ check: SourceCheck; file?: TemplateSourceFile }> {
  const ticket = (sequence.get(linkId) ?? 0) + 1;
  sequence.set(linkId, ticket);
  const handle = access.get(linkId);
  const settle = (check: SourceCheck, file?: TemplateSourceFile) => {
    if (sequence.get(linkId) === ticket) {
      checks.set(linkId, check);
      publish();
    }
    return { check, file };
  };
  if (!handle)
    return settle({
      state: 'unavailable',
      reason:
        'Sem acesso ao arquivo nesta sessão. Use Localizar novamente para escolher o arquivo.',
      checkedAt: Date.now(),
    });
  checks.set(linkId, { state: 'reading' });
  publish();
  let picked: File;
  try {
    picked = await handle.reread();
  } catch {
    return settle({
      state: 'unavailable',
      reason: isTauri()
        ? 'O arquivo foi movido, removido ou está sem permissão de leitura.'
        : 'O navegador não consegue reler o arquivo depois de alterado. Escolha-o novamente em Localizar novamente.',
      checkedAt: Date.now(),
    });
  }
  try {
    const file = await readTemplateSourceFile(picked, signal);
    return settle(
      {
        state: 'read',
        checkedAt: Date.now(),
        contentHash: file.contentHash,
        templateId: file.template.id,
        revision: file.template.revision,
      },
      file,
    );
  } catch (failure) {
    return settle({
      state: 'invalid',
      reason: failure instanceof Error ? failure.message : String(failure),
      checkedAt: Date.now(),
    });
  }
}

/** Test helper: forget every session handle and state. */
export function resetSourceAccess() {
  access.clear();
  checks.clear();
  sequence.clear();
  publish();
}
