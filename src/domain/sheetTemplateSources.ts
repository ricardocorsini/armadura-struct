import { z } from 'zod';
import type { Project, Sheet } from './types';
import {
  applySheetTemplate,
  pruneUnusedTemplateSources,
  saveSheetTemplate,
  sheetTemplateSchema,
  validateSheetTemplate,
  type SheetTemplate,
  type SheetTemplateField,
  type SheetTemplateFileFormat,
} from './sheetTemplates';
import {
  planSealPropertyImport,
  resolveSealPropertyImport,
  sealPropertyDefinitionSchema,
  withSealPropertyImport,
  type SealPropertyDefinition,
  type SealPropertyImportDecision,
  type SealPropertyImportItem,
} from './sealProperties';
import { withSealDataVersion } from './sealFieldSchema';

/**
 * External template sources (AS-15). The project keeps, per link, the identity
 * of the template in the office file, the accepted revision and content hash,
 * and the accepted content used as base for a three-way comparison. Each sheet
 * keeps its own immutable copy (`paperTemplate`) with a `sourceLink` naming
 * the accepted revision it corresponds to. File access is never persisted:
 * `hint` is a display label only.
 */
export const TEMPLATE_SOURCE_LIMITS = {
  bytes: 30 * 1024 * 1024,
  readMs: 20_000,
  sources: 1000,
} as const;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const templateSourceSchema = z.strictObject({
  id,
  /** Template ID inside the external file (identity, not a path). */
  templateId: z.string().min(1).max(200),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  format: z.enum([
    'armadurastruct.sheet-template/1',
    'armadurastruct.sheet-template/2',
    'armadurastruct.sheet-template/3',
  ]),
  contentHash: hash,
  /** File name for display. Never an authorization to read. */
  hint: z
    .string()
    .max(255)
    .refine((text) => !/[\x00-\x1f\x7f]/.test(text))
    .optional(),
  /** Accepted content, already expressed in local IDs, for comparison. */
  base: z.strictObject({
    template: sheetTemplateSchema,
    properties: z.array(sealPropertyDefinitionSchema).max(200),
  }),
});
export type TemplateSource = Omit<
  z.infer<typeof templateSourceSchema>,
  'base'
> & {
  base: { template: SheetTemplate; properties: SealPropertyDefinition[] };
};

export const templateSourcesSchema = z
  .array(templateSourceSchema)
  .max(TEMPLATE_SOURCE_LIMITS.sources);

/** Contents of a template file accepted as a source revision. */
export type TemplateSourceFile = {
  template: SheetTemplate;
  properties: SealPropertyDefinition[];
  format: SheetTemplateFileFormat;
  contentHash: string;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ':' +
            canonical((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

/**
 * What the comparison covers: paper, regions, geometry with styles, fields
 * (boxes, typography, static text, bindings and affixes) and the definitions
 * they reference. Identity (template ID), revision number, file name and
 * dates are not content. The hash detects differences; it does not prove
 * authenticity.
 */
export function templateComparableContent(
  template: SheetTemplate,
  properties: readonly SealPropertyDefinition[],
) {
  const {
    id: _id,
    revision: _revision,
    sourceLink: _link,
    ...content
  } = template;
  return {
    template: content,
    properties: [...properties]
      .map(({ aliases: _aliases, ...item }) => item)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

export async function templateContentHash(
  template: SheetTemplate,
  properties: readonly SealPropertyDefinition[],
): Promise<string> {
  const bytes = new TextEncoder().encode(
    canonical(templateComparableContent(template, properties)),
  );
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return (
    'sha256:' +
    [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function templateSource(project: Project, linkId: string) {
  return project.sheetTemplateSources?.find((item) => item.id === linkId);
}

/** Library template and sheets whose copy is linked to the source. */
export function templateSourceUsage(project: Project, linkId: string) {
  return {
    library: (project.sheetTemplates ?? []).find(
      (template) => template.sourceLink?.id === linkId,
    ),
    sheets: project.sheets.filter(
      (sheet) => sheet.paperTemplate?.sourceLink?.id === linkId,
    ),
  };
}

/** Sources referenced by no template are dropped; snapshots are never dropped. */
export function pruneTemplateSources(project: Project): Project {
  return pruneUnusedTemplateSources(project);
}
export function validateTemplateSources(project: Project): void {
  const sources = templateSourcesSchema.parse(
    project.sheetTemplateSources ?? [],
  );
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw Error('Origem de modelo repetida.');
    ids.add(source.id);
    validateSheetTemplate(source.base.template);
  }
  const templates = [
    ...(project.sheetTemplates ?? []).map((t) => [t, 'biblioteca'] as const),
    ...project.sheets.flatMap((sheet) =>
      sheet.paperTemplate
        ? [[sheet.paperTemplate, 'folha ' + sheet.name] as const]
        : [],
    ),
  ];
  for (const [template, where] of templates)
    if (template.sourceLink && !ids.has(template.sourceLink.id))
      throw Error(
        `O modelo “${template.name}” (${where}) aponta para uma origem externa inexistente.`,
      );
  const linkedLibrary = (project.sheetTemplates ?? []).filter(
    (t) => t.sourceLink,
  );
  const seen = new Set<string>();
  for (const template of linkedLibrary) {
    if (seen.has(template.sourceLink!.id))
      throw Error('Dois modelos da biblioteca usam a mesma origem externa.');
    seen.add(template.sourceLink!.id);
  }
}

/* ---------------- Status (informative, never applies content) ---------------- */

export type SourceCheck =
  | { state: 'unchecked' }
  | { state: 'reading' }
  | { state: 'unavailable'; reason: string; checkedAt: number }
  | { state: 'invalid'; reason: string; checkedAt: number }
  | {
      state: 'read';
      checkedAt: number;
      contentHash: string;
      templateId: string;
      revision: number;
    };

export type SourceState =
  | 'unchecked'
  | 'reading'
  | 'current'
  | 'update'
  | 'unavailable'
  | 'invalid'
  | 'other-template';

export const sourceStateLabels: Record<SourceState, string> = {
  unchecked: 'Ainda não verificado',
  reading: 'Verificando…',
  current: 'Atualizado',
  update: 'Atualização disponível',
  unavailable: 'Origem indisponível',
  invalid: 'Arquivo inválido ou incompatível',
  'other-template': 'O arquivo é outro modelo',
};

/** State of one application (library or sheet) against the last check. */
export function sourceState(
  source: Pick<TemplateSource, 'templateId'>,
  applied: { contentHash: string },
  check: SourceCheck | undefined,
): SourceState {
  if (!check || check.state === 'unchecked') return 'unchecked';
  if (check.state !== 'read') return check.state;
  if (check.templateId !== source.templateId) return 'other-template';
  return check.contentHash === applied.contentHash ? 'current' : 'update';
}

/* ---------------- Link ---------------- */

export type TemplateLinkPlan = {
  base: Project;
  file: TemplateSourceFile;
  hint?: string;
  properties: SealPropertyImportItem[];
};

export function planTemplateLink(
  project: Project,
  file: TemplateSourceFile,
  hint?: string,
): TemplateLinkPlan {
  return {
    base: project,
    file,
    hint,
    properties: planSealPropertyImport(project, file.properties),
  };
}

const nameKey = (name: string) => name.normalize('NFC').toLowerCase();

function freeTemplateName(project: Project, name: string) {
  const used = new Set(
    (project.sheetTemplates ?? []).map((t) => nameKey(t.name)),
  );
  if (!used.has(nameKey(name))) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name.slice(0, 136)} (${n})`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}

/**
 * Adds the file revision to the library as a linked template and applies it to
 * the chosen sheets, in one pure change. Field IDs from the file are kept so a
 * later revision recognizes renamed fields. The external file is not touched.
 */
export function applyTemplateLink(
  project: Project,
  plan: TemplateLinkPlan,
  options: {
    sheetIds: string[];
    decisions: ReadonlyMap<string, SealPropertyImportDecision>;
    newId: () => string;
  },
): Project {
  if (project !== plan.base)
    throw Error('O projeto mudou desde a prévia. Gere a prévia novamente.');
  const { file } = plan;
  const resolved = resolveSealPropertyImport(
    project,
    file.template,
    file.properties,
    options.decisions,
    options.newId,
  );
  const library = project.sheetTemplates ?? [];
  const templateId = library.some((t) => t.id === file.template.id)
    ? options.newId()
    : file.template.id;
  const linkId = options.newId();
  const local: SheetTemplate = {
    ...resolved.template,
    id: templateId,
    name: freeTemplateName(project, resolved.template.name),
    revision: 1,
    sourceLink: {
      id: linkId,
      contentHash: file.contentHash,
      revision: file.template.revision,
    },
  };
  let next = withSealPropertyImport(project, resolved);
  const baseProperties = localProperties(next, local);
  next = saveSheetTemplate(
    {
      ...next,
      sheetTemplateSources: [
        ...(next.sheetTemplateSources ?? []),
        {
          id: linkId,
          templateId: file.template.id,
          revision: file.template.revision,
          format: file.format,
          contentHash: file.contentHash,
          ...(plan.hint ? { hint: plan.hint.slice(0, 255) } : {}),
          base: { template: withoutLink(local), properties: baseProperties },
        },
      ],
    },
    local,
  );
  if (options.sheetIds.length)
    next = applySheetTemplate(next, templateId, options.sheetIds);
  return withSealDataVersion(next);
}

function withoutLink(template: SheetTemplate): SheetTemplate {
  const { sourceLink: _link, ...rest } = template;
  return structuredClone(rest);
}

function localProperties(project: Project, template: SheetTemplate) {
  const ids = new Set(
    template.fields.flatMap((f) =>
      f.sealBinding?.property ? [f.sealBinding.property] : [],
    ),
  );
  return (project.sealPropertyDefinitions ?? [])
    .filter((item) => ids.has(item.id))
    .map(({ aliases: _aliases, ...item }) => structuredClone(item));
}

/* ---------------- Update (three-way) ---------------- */

const fieldAttributes = [
  'label',
  'box',
  'origin',
  'text',
  'font',
  'height',
  'align',
  'rotation',
  'fontWeight',
  'fontStyle',
  'sealBinding',
] as const satisfies readonly (keyof SheetTemplateField)[];

const attributeLabels: Record<(typeof fieldAttributes)[number], string> = {
  label: 'nome',
  box: 'caixa',
  origin: 'inserção',
  text: 'texto estático',
  font: 'fonte',
  height: 'altura do texto',
  align: 'alinhamento',
  rotation: 'rotação',
  fontWeight: 'peso da fonte',
  fontStyle: 'estilo da fonte',
  sealBinding: 'vínculo/prefixo/sufixo',
};

type TemplatePart = 'name' | 'paper' | 'useful' | 'seal' | 'geometry';
const partLabels: Record<TemplatePart, string> = {
  name: 'Nome do modelo',
  paper: 'Formato, orientação e tamanho do papel',
  useful: 'Área útil',
  seal: 'Reserva do selo',
  geometry: 'Geometria, estilos e textos do desenho',
};
const part = (template: SheetTemplate, key: TemplatePart) =>
  key === 'paper'
    ? {
        format: template.format,
        orientation: template.orientation,
        customSize: template.customSize,
      }
    : template[key];

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

export type TemplateChange = {
  key: string;
  label: string;
  /** Who changed it since the accepted base. */
  origin: 'model' | 'local' | 'both-same' | 'conflict';
};
export type RemovedField = {
  fieldId: string;
  label: string;
  /** Sheets with manual text or a chosen origin for this field. */
  sheetData: string[];
};

export type TemplateUpdatePlan = {
  base: Project;
  linkId: string;
  file: TemplateSourceFile;
  hint?: string;
  /** The chosen file is another template (different identity). */
  identityChange: boolean;
  current: SheetTemplate;
  properties: SealPropertyImportItem[];
  changes: TemplateChange[];
  removed: RemovedField[];
  added: { fieldId: string; label: string }[];
  dependents: {
    id: string;
    name: string;
    revision: number;
    current: boolean;
  }[];
};

/** Prepare the before/after comparison. Nothing is written. */
export function planTemplateUpdate(
  project: Project,
  linkId: string,
  file: TemplateSourceFile,
  hint?: string,
): TemplateUpdatePlan {
  const source = templateSource(project, linkId);
  const { library, sheets } = templateSourceUsage(project, linkId);
  if (!source || !library)
    throw Error(
      'O modelo vinculado não está mais na biblioteca. Reabra o editor de modelos.',
    );
  const properties = planSealPropertyImport(project, file.properties);
  const plan: TemplateUpdatePlan = {
    base: project,
    linkId,
    file,
    hint,
    identityChange: file.template.id !== source.templateId,
    current: library,
    properties,
    changes: [],
    removed: [],
    added: [],
    dependents: sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      revision: sheet.paperTemplate!.revision,
      current:
        sheet.paperTemplate!.sourceLink!.contentHash === file.contentHash,
    })),
  };
  // Compare in local terms: proposed mapping of the incoming properties.
  const incoming = remapIncoming(project, file, properties);
  diff(plan, source.base.template, library, incoming);
  return plan;
}

function remapIncoming(
  project: Project,
  file: TemplateSourceFile,
  items: SealPropertyImportItem[],
  decisions?: ReadonlyMap<string, SealPropertyImportDecision>,
) {
  // Field binding IDs are compared after mapping; creations keep the external ID.
  const map = new Map<string, string>();
  for (const item of items) {
    const decision = decisions?.get(item.external.id) ?? item.proposal;
    if (decision.kind === 'map') map.set(item.external.id, decision.to);
  }
  void project;
  return {
    ...file.template,
    fields: file.template.fields.map((field) => {
      const to = map.get(field.sealBinding?.property ?? '');
      return to
        ? { ...field, sealBinding: { ...field.sealBinding!, property: to } }
        : field;
    }),
  };
}

function diff(
  plan: TemplateUpdatePlan,
  base: SheetTemplate,
  local: SheetTemplate,
  incoming: SheetTemplate,
) {
  const classify = (b: unknown, l: unknown, i: unknown) => {
    const modelChanged = !same(b, i);
    const localChanged = !same(b, l);
    if (!modelChanged && !localChanged) return undefined;
    if (modelChanged && !localChanged) return 'model' as const;
    if (!modelChanged && localChanged) return 'local' as const;
    return same(l, i) ? ('both-same' as const) : ('conflict' as const);
  };
  for (const key of Object.keys(partLabels) as TemplatePart[]) {
    const origin = classify(
      part(base, key),
      part(local, key),
      part(incoming, key),
    );
    if (origin) plan.changes.push({ key, label: partLabels[key], origin });
  }
  const byId = (t: SheetTemplate) => new Map(t.fields.map((f) => [f.id, f]));
  const b = byId(base),
    l = byId(local),
    i = byId(incoming);
  for (const [fieldId, field] of i) {
    if (!b.has(fieldId) && !l.has(fieldId)) {
      plan.added.push({ fieldId, label: field.label });
      continue;
    }
    if (!l.has(fieldId)) {
      // Removed locally; only a model change makes it a decision.
      if (!same(b.get(fieldId), field))
        plan.changes.push({
          key: `field:${fieldId}:exists`,
          label: `Campo “${field.label}” removido localmente e alterado no modelo`,
          origin: 'conflict',
        });
      continue;
    }
    for (const attribute of fieldAttributes) {
      const origin = classify(
        b.get(fieldId)?.[attribute],
        l.get(fieldId)![attribute],
        field[attribute],
      );
      if (origin)
        plan.changes.push({
          key: `field:${fieldId}:${attribute}`,
          label: `Campo “${l.get(fieldId)!.label}”: ${attributeLabels[attribute]}${
            attribute === 'label' && origin !== 'local'
              ? ` (“${l.get(fieldId)!.label}” → “${field.label}”)`
              : ''
          }`,
          origin,
        });
    }
  }
  for (const [fieldId, field] of b)
    if (!i.has(fieldId) && l.has(fieldId))
      plan.removed.push({
        fieldId,
        label: l.get(fieldId)!.label,
        sheetData: plan.base.sheets
          .filter((sheet) =>
            sheet.sealBindings?.some(
              (binding) =>
                binding.templateId === plan.current.id &&
                binding.fieldId === fieldId,
            ),
          )
          .map((sheet) => sheet.name),
      });
  void base;
}

export type TemplateUpdateChoices = {
  /** Sheets to move to the new revision; the others keep their copy. */
  sheetIds: string[];
  /** Conflict key → which side wins. Every conflict needs an answer. */
  conflicts: ReadonlyMap<string, 'local' | 'model'>;
  /** Removed field → keep it as a local field or remove it. */
  removed: ReadonlyMap<string, 'keep' | 'remove'>;
  decisions: ReadonlyMap<string, SealPropertyImportDecision>;
  newId: () => string;
};

export function pendingTemplateUpdateDecisions(
  plan: TemplateUpdatePlan,
  choices: Pick<TemplateUpdateChoices, 'conflicts' | 'removed'>,
) {
  return [
    ...plan.changes
      .filter((c) => c.origin === 'conflict' && !choices.conflicts.has(c.key))
      .map((c) => c.label),
    ...plan.removed
      .filter((r) => !choices.removed.has(r.fieldId))
      .map((r) => `Campo “${r.label}” removido no modelo`),
  ];
}

/**
 * One atomic change: new library revision, accepted base, property mapping,
 * and the chosen sheets. Sheet data (name, revision, notes, documentary values,
 * custom values, manual texts, sources, views, scales, schedule) is untouched;
 * only bindings of fields explicitly removed are dropped, as listed in the plan.
 */
export function applyTemplateUpdate(
  project: Project,
  plan: TemplateUpdatePlan,
  choices: TemplateUpdateChoices,
): Project {
  if (project !== plan.base)
    throw Error('O projeto mudou desde a prévia. Gere a prévia novamente.');
  const pending = pendingTemplateUpdateDecisions(plan, choices);
  if (pending.length)
    throw Error(
      'Resolva os conflitos antes de atualizar: ' + pending.join('; ') + '.',
    );
  const source = templateSource(project, plan.linkId)!;
  const local = plan.current;
  const dependents = new Set(plan.dependents.map((d) => d.id));
  for (const sheetId of choices.sheetIds)
    if (!dependents.has(sheetId))
      throw Error('Uma folha escolhida não usa este modelo vinculado.');

  const resolved = resolveSealPropertyImport(
    project,
    plan.file.template,
    plan.file.properties,
    choices.decisions,
    choices.newId,
  );
  const incoming = resolved.template;
  const base = source.base.template;
  const pick = <T>(key: string, b: T, l: T, i: T): T => {
    const modelChanged = !same(b, i);
    const localChanged = !same(b, l);
    if (!modelChanged) return l;
    if (!localChanged) return i;
    if (same(l, i)) return l;
    return choices.conflicts.get(key) === 'model' ? i : l;
  };
  const merged: SheetTemplate = { ...local };
  merged.name = pick('name', base.name, local.name, incoming.name);
  const paper = pick(
    'paper',
    part(base, 'paper'),
    part(local, 'paper'),
    part(incoming, 'paper'),
  ) as ReturnType<typeof part> &
    Pick<SheetTemplate, 'format' | 'orientation' | 'customSize'>;
  merged.format = paper.format;
  merged.orientation = paper.orientation;
  merged.customSize = paper.customSize;
  merged.useful = pick('useful', base.useful, local.useful, incoming.useful);
  merged.seal = pick('seal', base.seal, local.seal, incoming.seal);
  merged.geometry = pick(
    'geometry',
    base.geometry,
    local.geometry,
    incoming.geometry,
  );

  const b = new Map(base.fields.map((f) => [f.id, f]));
  const l = new Map(local.fields.map((f) => [f.id, f]));
  const fields: SheetTemplateField[] = [];
  const removedIds = new Set<string>();
  const i = new Map(incoming.fields.map((f) => [f.id, f]));
  // Local order is kept; fields new in the model are appended.
  for (const localField of local.fields) {
    const field = i.get(localField.id);
    const baseField = b.get(localField.id);
    if (!field) {
      if (baseField && choices.removed.get(localField.id) === 'remove')
        removedIds.add(localField.id);
      else fields.push(localField); // local addition, or removed field kept
      continue;
    }
    const next: SheetTemplateField = { ...localField };
    for (const attribute of fieldAttributes) {
      const value = pick(
        `field:${field.id}:${attribute}`,
        baseField?.[attribute],
        localField[attribute],
        field[attribute],
      );
      if (value === undefined) delete next[attribute];
      else
        (next as Record<string, unknown>)[attribute] = structuredClone(value);
    }
    fields.push(next);
  }
  for (const field of incoming.fields) {
    if (l.has(field.id)) continue;
    const baseField = b.get(field.id);
    if (
      !baseField ||
      (!same(baseField, field) &&
        choices.conflicts.get(`field:${field.id}:exists`) === 'model')
    )
      fields.push(structuredClone(field));
  }
  merged.fields = fields;
  merged.sourceLink = {
    id: plan.linkId,
    contentHash: plan.file.contentHash,
    revision: plan.file.template.revision,
  };

  let next = withSealPropertyImport(project, resolved);
  next = {
    ...next,
    sheetTemplateSources: next.sheetTemplateSources!.map((item) =>
      item.id === plan.linkId
        ? {
            ...item,
            templateId: plan.file.template.id,
            revision: plan.file.template.revision,
            format: plan.file.format,
            contentHash: plan.file.contentHash,
            ...(plan.hint ? { hint: plan.hint.slice(0, 255) } : {}),
            base: {
              template: withoutLink(incoming),
              properties: localProperties(next, incoming),
            },
          }
        : item,
    ),
  };
  next = saveSheetTemplate(next, merged);
  if (choices.sheetIds.length)
    next = applySheetTemplate(next, local.id, choices.sheetIds);
  if (removedIds.size) {
    const updated = new Set(choices.sheetIds);
    next = {
      ...next,
      sheets: next.sheets.map((sheet) => {
        if (!updated.has(sheet.id) || !sheet.sealBindings) return sheet;
        const bindings = sheet.sealBindings.filter(
          (binding) =>
            !(
              binding.templateId === local.id && removedIds.has(binding.fieldId)
            ),
        );
        return bindings.length === sheet.sealBindings.length
          ? sheet
          : { ...sheet, sealBindings: bindings.length ? bindings : undefined };
      }),
    };
  }
  return withSealDataVersion(next);
}

/* ---------------- Relocate and unlink ---------------- */

export type RelocateResult =
  | { kind: 'same'; project: Project }
  | { kind: 'different'; plan: TemplateUpdatePlan };

/**
 * Same identity and content only restores access (and the display hint).
 * Anything else requires the comparison; nothing is applied here.
 */
export function relocateTemplateSource(
  project: Project,
  linkId: string,
  file: TemplateSourceFile,
  hint?: string,
): RelocateResult {
  const source = templateSource(project, linkId);
  if (!source) throw Error('Origem de modelo inexistente.');
  if (
    file.template.id === source.templateId &&
    file.contentHash === source.contentHash
  ) {
    if (!hint || hint === source.hint) return { kind: 'same', project };
    return {
      kind: 'same',
      project: {
        ...project,
        sheetTemplateSources: project.sheetTemplateSources!.map((item) =>
          item.id === linkId ? { ...item, hint: hint.slice(0, 255) } : item,
        ),
      },
    };
  }
  return {
    kind: 'different',
    plan: planTemplateUpdate(project, linkId, file, hint),
  };
}

/**
 * Removes the external dependency of the chosen applications. The copies keep
 * appearance, fields, definitions, mappings and values.
 */
export function unlinkTemplateSource(
  project: Project,
  linkId: string,
  options: { sheetIds: string[]; library: boolean },
): Project {
  const selected = new Set(options.sheetIds);
  const strip = (template: SheetTemplate) => {
    const { sourceLink: _link, ...rest } = template;
    return rest as SheetTemplate;
  };
  let changed = false;
  const sheets: Sheet[] = project.sheets.map((sheet) => {
    if (
      !selected.has(sheet.id) ||
      sheet.paperTemplate?.sourceLink?.id !== linkId
    )
      return sheet;
    changed = true;
    return { ...sheet, paperTemplate: strip(sheet.paperTemplate) };
  });
  const sheetTemplates = options.library
    ? project.sheetTemplates?.map((template) => {
        if (template.sourceLink?.id !== linkId) return template;
        changed = true;
        return strip(template);
      })
    : project.sheetTemplates;
  if (!changed) return project;
  return pruneTemplateSources({ ...project, sheets, sheetTemplates });
}
