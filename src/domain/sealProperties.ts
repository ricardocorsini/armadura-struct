import { z } from 'zod';
import { formatDrawingDate, isValidDrawingDate } from './drawingMetadata';
import type { Project, Sheet } from './types';
import type { SheetTemplate, SheetTemplateField } from './sheetTemplates';

/**
 * Custom seal properties (AS-14). A definition is identified by a stable ID;
 * values live separately in the project and in each sheet, and template fields
 * reference the definition ID. Names are labels only.
 */
export const SEAL_PROPERTY_LIMITS = {
  definitions: 200,
  name: 80,
  text: 300,
  aliases: 50,
  decimals: 6,
} as const;

export const sealPropertyTypes = {
  text: 'Texto',
  number: 'Número',
  date: 'Data civil',
  boolean: 'Sim/Não',
} as const;
export const sealPropertyScopes = {
  project: 'Projeto',
  sheet: 'Folha',
  'project-sheet': 'Projeto, com valor por folha',
} as const;

export type SealPropertyType = keyof typeof sealPropertyTypes;
export type SealPropertyScope = keyof typeof sealPropertyScopes;
/** `null` is an explicit empty value; an absent entry inherits. */
export type SealPropertyValue = string | number | boolean | null;

const controlChars = /[\x00-\x1f\x7f]/;
export const sealPropertyIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,200}$/, 'Identificador de propriedade inválido.');

const valueSchema = z.union([
  z.string().max(SEAL_PROPERTY_LIMITS.text),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const rulesSchema = z.strictObject({
  maxLength: z.number().int().min(1).max(SEAL_PROPERTY_LIMITS.text).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  decimals: z
    .number()
    .int()
    .min(0)
    .max(SEAL_PROPERTY_LIMITS.decimals)
    .optional(),
});
export type SealPropertyRules = z.infer<typeof rulesSchema>;

const definitionShape = z.strictObject({
  id: sealPropertyIdSchema,
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da propriedade.')
    .max(SEAL_PROPERTY_LIMITS.name)
    .refine((text) => !controlChars.test(text), 'Use um nome sem controles.'),
  type: z.enum(['text', 'number', 'date', 'boolean']),
  scope: z.enum(['project', 'sheet', 'project-sheet']),
  default: valueSchema.optional(),
  rules: rulesSchema.optional(),
  /** External IDs confirmed to mean this definition (template import, AS-15). */
  aliases: z
    .array(sealPropertyIdSchema)
    .max(SEAL_PROPERTY_LIMITS.aliases)
    .optional(),
});

export type SealPropertyDefinition = z.infer<typeof definitionShape>;

/** Message for a value that does not satisfy the definition, if any. */
export function sealPropertyValueError(
  definition: Pick<SealPropertyDefinition, 'type' | 'rules'>,
  value: SealPropertyValue,
): string | undefined {
  if (value === null) return undefined;
  const rules = definition.rules ?? {};
  switch (definition.type) {
    case 'text': {
      if (typeof value !== 'string') return 'Informe um texto.';
      if (controlChars.test(value))
        return 'Use texto em uma linha, sem caracteres de controle.';
      const limit = rules.maxLength ?? SEAL_PROPERTY_LIMITS.text;
      if (value.length > limit) return `Use até ${limit} caracteres.`;
      return undefined;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        return 'Informe um número finito.';
      if (rules.min !== undefined && value < rules.min)
        return `Informe um número maior ou igual a ${formatNumber(rules.min)}.`;
      if (rules.max !== undefined && value > rules.max)
        return `Informe um número menor ou igual a ${formatNumber(rules.max)}.`;
      if (rules.decimals !== undefined) {
        const scaled = value * 10 ** rules.decimals;
        if (
          Math.abs(scaled - Math.round(scaled)) >
          1e-7 * Math.max(1, Math.abs(scaled))
        )
          return `Use até ${rules.decimals} casas decimais.`;
      }
      return undefined;
    }
    case 'date':
      return typeof value === 'string' && isValidDrawingDate(value)
        ? undefined
        : 'Informe uma data civil válida (AAAA-MM-DD), sem horário.';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Escolha Sim ou Não.';
  }
}

export const sealPropertyDefinitionSchema = definitionShape.superRefine(
  (definition, ctx) => {
    const rules = definition.rules ?? {};
    if (definition.type !== 'text' && rules.maxLength !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['rules', 'maxLength'],
        message: 'Limite de caracteres só se aplica a texto.',
      });
    if (
      definition.type !== 'number' &&
      (rules.min !== undefined ||
        rules.max !== undefined ||
        rules.decimals !== undefined)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['rules'],
        message: 'Mínimo, máximo e casas decimais só se aplicam a número.',
      });
    if (
      rules.min !== undefined &&
      rules.max !== undefined &&
      rules.min > rules.max
    )
      ctx.addIssue({
        code: 'custom',
        path: ['rules', 'min'],
        message: 'O mínimo não pode superar o máximo.',
      });
    if (definition.default === null)
      ctx.addIssue({
        code: 'custom',
        path: ['default'],
        message: 'Deixe o padrão ausente em vez de vazio.',
      });
    else if (definition.default !== undefined) {
      const error = sealPropertyValueError(definition, definition.default);
      if (error)
        ctx.addIssue({
          code: 'custom',
          path: ['default'],
          message: 'Valor padrão inválido. ' + error,
        });
    }
    if (definition.aliases?.includes(definition.id))
      ctx.addIssue({
        code: 'custom',
        path: ['aliases'],
        message: 'O identificador já pertence à propriedade.',
      });
  },
);

export const nameKey = (name: string) =>
  name.normalize('NFC').trim().toLocaleLowerCase('pt-BR');

export const sealPropertyDefinitionsSchema = z
  .array(sealPropertyDefinitionSchema)
  .max(SEAL_PROPERTY_LIMITS.definitions)
  .superRefine((definitions, ctx) => {
    const ids = new Set<string>();
    const aliases = new Set<string>();
    const names = new Set<string>();
    for (const [index, definition] of definitions.entries()) {
      if (ids.has(definition.id))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `Identificador repetido em “${definition.name}”.`,
        });
      ids.add(definition.id);
      // An external ID maps to at most one local definition.
      for (const alias of definition.aliases ?? []) {
        if (aliases.has(alias))
          ctx.addIssue({
            code: 'custom',
            path: [index, 'aliases'],
            message: `Associação externa repetida em “${definition.name}”.`,
          });
        aliases.add(alias);
      }
      const name = nameKey(definition.name);
      if (names.has(name))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'name'],
          message: `Já existe uma propriedade chamada “${definition.name}”.`,
        });
      names.add(name);
    }
  });

export const sealPropertyValuesSchema = z
  .array(z.strictObject({ property: sealPropertyIdSchema, value: valueSchema }))
  .max(SEAL_PROPERTY_LIMITS.definitions)
  .superRefine((values, ctx) => {
    const seen = new Set<string>();
    for (const [index, entry] of values.entries()) {
      if (seen.has(entry.property))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'property'],
          message: 'A propriedade já tem valor neste cadastro.',
        });
      seen.add(entry.property);
    }
  });
export type SealPropertyValueEntry = z.infer<
  typeof sealPropertyValuesSchema
>[number];

const allowsProject = (scope: SealPropertyScope) => scope !== 'sheet';
const allowsSheet = (scope: SealPropertyScope) => scope !== 'project';

function formatNumber(value: number, decimals?: number) {
  const text = decimals === undefined ? String(value) : value.toFixed(decimals);
  return text.replace('.', ',');
}

/** Plain text for the seal. Values are data: nothing is evaluated. */
export function formatSealPropertyValue(
  definition: Pick<SealPropertyDefinition, 'type' | 'rules'>,
  value: SealPropertyValue,
): string {
  if (value === null) return '';
  switch (definition.type) {
    case 'number':
      return typeof value === 'number'
        ? formatNumber(value, definition.rules?.decimals)
        : '';
    case 'date':
      return typeof value === 'string' ? formatDrawingDate(value) : '';
    case 'boolean':
      return value === true ? 'Sim' : value === false ? 'Não' : '';
    case 'text':
      return typeof value === 'string' ? value : '';
  }
}

export function sealPropertyValue(
  values: readonly SealPropertyValueEntry[] | undefined,
  id: string,
): SealPropertyValueEntry | undefined {
  return values?.find((entry) => entry.property === id);
}

export type SealPropertyOrigin = 'sheet' | 'project' | 'default' | 'none';
export type ResolvedSealProperty = {
  text: string;
  origin: SealPropertyOrigin;
  /** The winning value is an explicit empty, not an absence. */
  explicitEmpty?: true;
  invalid?: string;
  missing?: true;
  unsupported?: true;
};

/**
 * Pure precedence: sheet value, project value, definition default. The
 * binding source restricts the chain: a direct project source never reads
 * the sheet, and a sheet-only property has no project value.
 */
export function resolveSealProperty(
  project: Pick<Project, 'sealPropertyDefinitions' | 'sealPropertyValues'>,
  sheet: Pick<Sheet, 'sealPropertyValues'> | undefined,
  propertyId: string,
  source?: 'project' | 'sheet',
): ResolvedSealProperty {
  const definition = project.sealPropertyDefinitions?.find(
    (item) => item.id === propertyId,
  );
  if (!definition) return { text: '', origin: 'none', missing: true };
  const kind = source ?? (allowsSheet(definition.scope) ? 'sheet' : 'project');
  if (
    (kind === 'project' && !allowsProject(definition.scope)) ||
    (kind === 'sheet' && !allowsSheet(definition.scope))
  )
    return { text: '', origin: 'none', unsupported: true };
  const chain: [SealPropertyOrigin, SealPropertyValueEntry | undefined][] = [];
  if (kind === 'sheet')
    chain.push([
      'sheet',
      sealPropertyValue(sheet?.sealPropertyValues, propertyId),
    ]);
  if (allowsProject(definition.scope))
    chain.push([
      'project',
      sealPropertyValue(project.sealPropertyValues, propertyId),
    ]);
  if (definition.default !== undefined)
    chain.push([
      'default',
      { property: propertyId, value: definition.default },
    ]);
  for (const [origin, entry] of chain) {
    if (!entry) continue;
    const invalid = sealPropertyValueError(definition, entry.value);
    if (invalid) return { text: '', origin, invalid };
    return {
      text: formatSealPropertyValue(definition, entry.value),
      origin,
      ...(entry.value === null ? { explicitEmpty: true as const } : {}),
    };
  }
  return { text: '', origin: 'none' };
}

/** Every template (library and incorporated revisions) of the project. */
function projectTemplates(project: Project) {
  return [
    ...(project.sheetTemplates ?? []).map((template) => ({
      template,
      sheet: undefined as Sheet | undefined,
    })),
    ...project.sheets.flatMap((sheet) =>
      sheet.paperTemplate ? [{ template: sheet.paperTemplate, sheet }] : [],
    ),
  ];
}

export type SealPropertyUsage = {
  fields: {
    templateId: string;
    templateName: string;
    fieldId: string;
    fieldLabel: string;
    /** Sheet that incorporates this revision; absent for the library. */
    sheetName?: string;
  }[];
  projectValue: boolean;
  sheetValues: string[];
};

export function sealPropertyUsage(
  project: Project,
  propertyId: string,
): SealPropertyUsage {
  const fields: SealPropertyUsage['fields'] = [];
  for (const { template, sheet } of projectTemplates(project))
    for (const field of template.fields)
      if (field.sealBinding?.property === propertyId)
        fields.push({
          templateId: template.id,
          templateName: template.name,
          fieldId: field.id,
          fieldLabel: field.label,
          ...(sheet ? { sheetName: sheet.name } : {}),
        });
  return {
    fields,
    projectValue: !!sealPropertyValue(project.sealPropertyValues, propertyId),
    sheetValues: project.sheets
      .filter((sheet) =>
        sealPropertyValue(sheet.sealPropertyValues, propertyId),
      )
      .map((sheet) => sheet.name),
  };
}

export function describeSealPropertyUsage(usage: SealPropertyUsage): string {
  const parts = usage.fields.map(
    (field) =>
      `“${field.fieldLabel}” em ${field.sheetName ? `${field.sheetName} (${field.templateName})` : `${field.templateName} (biblioteca)`}`,
  );
  if (usage.projectValue) parts.push('valor do projeto');
  for (const name of usage.sheetValues) parts.push(`valor da folha ${name}`);
  return parts.join('; ');
}

function checkTemplateReferences(
  template: SheetTemplate,
  definitions: ReadonlyMap<string, SealPropertyDefinition>,
  where: string,
) {
  for (const field of template.fields) {
    const binding = field.sealBinding;
    if (!binding?.property) continue;
    const definition = definitions.get(binding.property);
    if (!definition)
      throw Error(
        `O campo “${field.label}” de ${where} usa uma propriedade personalizada inexistente.`,
      );
    if (
      binding.source &&
      !(
        (binding.source === 'project' && allowsProject(definition.scope)) ||
        (binding.source === 'sheet' && allowsSheet(definition.scope))
      )
    )
      throw Error(
        `O campo “${field.label}” de ${where} usa uma origem incompatível com “${definition.name}”.`,
      );
  }
}

/** Refuses unknown references, invalid values and values outside the scope. */
export function validateSealPropertyData(project: Project): void {
  const parsed = sealPropertyDefinitionsSchema.safeParse(
    project.sealPropertyDefinitions ?? [],
  );
  if (!parsed.success)
    throw Error(
      'Propriedade personalizada inválida. ' + parsed.error.issues[0].message,
    );
  const definitions = new Map(parsed.data.map((item) => [item.id, item]));
  const checkValues = (
    values: readonly SealPropertyValueEntry[] | undefined,
    where: string,
    allowed: (scope: SealPropertyScope) => boolean,
  ) => {
    sealPropertyValuesSchema.parse(values ?? []);
    for (const entry of values ?? []) {
      const definition = definitions.get(entry.property);
      if (!definition)
        throw Error(`${where} tem valor de propriedade inexistente.`);
      if (!allowed(definition.scope))
        throw Error(
          `${where} não admite valor para “${definition.name}” (escopo ${sealPropertyScopes[definition.scope]}).`,
        );
      const error = sealPropertyValueError(definition, entry.value);
      if (error) throw Error(`${where}, “${definition.name}”. ${error}`);
    }
  };
  checkValues(project.sealPropertyValues, 'O projeto', allowsProject);
  for (const sheet of project.sheets)
    checkValues(sheet.sealPropertyValues, `A folha ${sheet.name}`, allowsSheet);
  for (const { template, sheet } of projectTemplates(project))
    checkTemplateReferences(
      template,
      definitions,
      sheet ? `${template.name} na folha ${sheet.name}` : template.name,
    );
}

export function assertTemplatePropertyReferences(
  project: Project,
  template: SheetTemplate,
) {
  checkTemplateReferences(
    template,
    new Map(
      (project.sealPropertyDefinitions ?? []).map((item) => [item.id, item]),
    ),
    template.name,
  );
}

/** A value change instruction: set a typed value (null = explicit empty) or inherit. */
export type SealPropertyValuePatch =
  | { property: string; value: SealPropertyValue }
  | { property: string; inherit: true };

export function patchSealPropertyValues(
  current: SealPropertyValueEntry[] | undefined,
  patches: readonly SealPropertyValuePatch[],
): SealPropertyValueEntry[] | undefined {
  let next = current ?? [];
  for (const patch of patches) {
    const rest = next.filter((entry) => entry.property !== patch.property);
    next =
      'inherit' in patch
        ? rest
        : [...rest, { property: patch.property, value: patch.value }];
  }
  if (JSON.stringify(next) === JSON.stringify(current ?? [])) return current;
  return next.length ? next : undefined;
}

export type SealPropertyRemap = { from: string; to: string };

function rewriteTemplate(
  template: SheetTemplate,
  remaps: ReadonlyMap<string, string>,
): SheetTemplate {
  if (!template.fields.some((f) => remaps.has(f.sealBinding?.property ?? '')))
    return template;
  return {
    ...template,
    fields: template.fields.map((field): SheetTemplateField => {
      const to = remaps.get(field.sealBinding?.property ?? '');
      return to
        ? { ...field, sealBinding: { ...field.sealBinding!, property: to } }
        : field;
    }),
  };
}

/**
 * Replace the registry in one pure step. Removing a property in use requires a
 * remap to a compatible definition; changing type, rules or scope never
 * converts or deletes stored values: it is refused while a value would become
 * invalid. Values of a removed property are discarded only with the removal.
 */
export function replaceSealPropertyDefinitions(
  project: Project,
  nextDefinitions: SealPropertyDefinition[],
  remapList: readonly SealPropertyRemap[] = [],
): Project {
  const parsed = sealPropertyDefinitionsSchema.safeParse(nextDefinitions);
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  const next = parsed.data;
  const before = project.sealPropertyDefinitions ?? [];
  const nextIds = new Map(next.map((item) => [item.id, item]));
  const remaps = new Map<string, string>();
  for (const remap of remapList) {
    const target = nextIds.get(remap.to);
    const source = before.find((item) => item.id === remap.from);
    if (!source || nextIds.has(remap.from))
      throw Error('Só é possível remapear uma propriedade removida.');
    if (!target)
      throw Error(
        `Escolha uma propriedade existente para substituir “${source.name}”.`,
      );
    if (target.type !== source.type)
      throw Error(
        `“${target.name}” é do tipo ${sealPropertyTypes[target.type]} e não substitui “${source.name}” (${sealPropertyTypes[source.type]}).`,
      );
    remaps.set(remap.from, remap.to);
  }
  for (const removed of before.filter((item) => !nextIds.has(item.id))) {
    const usage = sealPropertyUsage(project, removed.id);
    if (usage.fields.length && !remaps.has(removed.id))
      throw Error(
        `“${removed.name}” está em uso: ${describeSealPropertyUsage({ ...usage, projectValue: false, sheetValues: [] })}. Escolha uma propriedade substituta ou desfaça os vínculos antes de excluir.`,
      );
  }
  const removedIds = new Set(
    before.filter((item) => !nextIds.has(item.id)).map((item) => item.id),
  );
  const keep = (values?: SealPropertyValueEntry[]) => {
    if (!values?.some((entry) => removedIds.has(entry.property))) return values;
    const kept = values.filter((entry) => !removedIds.has(entry.property));
    return kept.length ? kept : undefined;
  };
  const result: Project = {
    ...project,
    sealPropertyDefinitions: next.length ? next : undefined,
    sealPropertyValues: keep(project.sealPropertyValues),
    sheetTemplates: project.sheetTemplates?.map((t) =>
      rewriteTemplate(t, remaps),
    ),
    sheets: project.sheets.map((sheet) => {
      const values = keep(sheet.sealPropertyValues);
      const template =
        sheet.paperTemplate && rewriteTemplate(sheet.paperTemplate, remaps);
      return values === sheet.sealPropertyValues &&
        template === sheet.paperTemplate
        ? sheet
        : { ...sheet, sealPropertyValues: values, paperTemplate: template };
    }),
  };
  try {
    validateSealPropertyData(result);
  } catch (failure) {
    throw Error(
      'A alteração afetaria dados existentes e não foi aplicada. ' +
        (failure as Error).message +
        ' Corrija ou remova esses valores antes de mudar a definição.',
    );
  }
  return result;
}

/** Which existing values and fields a definition change would touch. */
export function sealPropertyChangeImpact(
  project: Project,
  definition: SealPropertyDefinition,
) {
  const usage = sealPropertyUsage(project, definition.id);
  const invalid: string[] = [];
  const check = (
    entry: SealPropertyValueEntry | undefined,
    where: string,
    allowed: boolean,
  ) => {
    if (!entry) return;
    if (!allowed) invalid.push(`${where}: fora do escopo`);
    else {
      const error = sealPropertyValueError(definition, entry.value);
      if (error) invalid.push(`${where}: ${error}`);
    }
  };
  check(
    sealPropertyValue(project.sealPropertyValues, definition.id),
    'Projeto',
    allowsProject(definition.scope),
  );
  for (const sheet of project.sheets)
    check(
      sealPropertyValue(sheet.sealPropertyValues, definition.id),
      `Folha ${sheet.name}`,
      allowsSheet(definition.scope),
    );
  return { usage, invalid };
}

export function newSealPropertyName(
  definitions: readonly SealPropertyDefinition[],
  base: string,
): string {
  const used = new Set(definitions.map((item) => nameKey(item.name)));
  const root =
    base.trim().slice(0, SEAL_PROPERTY_LIMITS.name - 14) || 'Propriedade';
  if (!used.has(nameKey(root))) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root} (${n})`;
    if (!used.has(nameKey(candidate))) return candidate;
  }
}

/* ---------- Transport with templates ---------- */

/** Definitions a template needs, without aliases or any project/sheet value. */
export function templatePropertyDefinitions(
  project: Pick<Project, 'sealPropertyDefinitions'>,
  template: SheetTemplate,
): SealPropertyDefinition[] {
  const ids = new Set(
    template.fields.flatMap((field) =>
      field.sealBinding?.property ? [field.sealBinding.property] : [],
    ),
  );
  return (project.sealPropertyDefinitions ?? [])
    .filter((item) => ids.has(item.id))
    .map(({ aliases: _aliases, ...definition }) => structuredClone(definition));
}

const contract = (item: SealPropertyDefinition) =>
  JSON.stringify([
    item.type,
    item.scope,
    item.rules ?? {},
    item.default ?? null,
  ]);
const compatible = (a: SealPropertyDefinition, b: SealPropertyDefinition) =>
  a.type === b.type && a.scope === b.scope;

export type SealPropertyImportStatus =
  | 'identical'
  | 'confirmed'
  | 'conflict'
  | 'homonym'
  | 'new';
export type SealPropertyImportDecision =
  | { kind: 'map'; to: string }
  | { kind: 'create'; name: string };
export type SealPropertyImportItem = {
  external: SealPropertyDefinition;
  status: SealPropertyImportStatus;
  message: string;
  /** Local definitions of the same type and scope that can be associated. */
  candidates: SealPropertyDefinition[];
  proposal: SealPropertyImportDecision;
};

/**
 * Compare identity (ID and confirmed aliases), contract and name. Only an
 * identical ID or a previously confirmed alias maps automatically; a name never
 * does.
 */
export function planSealPropertyImport(
  project: Pick<Project, 'sealPropertyDefinitions'>,
  externals: readonly SealPropertyDefinition[],
): SealPropertyImportItem[] {
  const locals = project.sealPropertyDefinitions ?? [];
  const reserved = [...locals];
  return externals.map((external) => {
    const byId = locals.find((item) => item.id === external.id);
    const byAlias = locals.find((item) => item.aliases?.includes(external.id));
    // A mapping confirmed earlier wins over a divergent local ID.
    const known =
      byAlias && compatible(byAlias, external)
        ? byAlias
        : byId && contract(byId) === contract(external)
          ? byId
          : (byId ?? byAlias);
    const candidates = locals.filter((item) => compatible(item, external));
    const create = (): SealPropertyImportDecision => {
      const name = newSealPropertyName(reserved, external.name);
      reserved.push({ ...external, name });
      return { kind: 'create', name };
    };
    if (
      known &&
      (known === byAlias
        ? compatible(known, external)
        : contract(known) === contract(external))
    )
      return {
        external,
        status: known === byId ? 'identical' : 'confirmed',
        message:
          known === byId
            ? `Mesma propriedade: “${known.name}”.`
            : `Associação confirmada anteriormente com “${known.name}”.`,
        candidates,
        proposal: { kind: 'map', to: known.id },
      };
    if (known)
      return {
        external,
        status: 'conflict',
        message: `O identificador corresponde a “${known.name}”, mas o tipo, o escopo, as regras ou o padrão diferem. Escolha como importar.`,
        candidates,
        proposal: create(),
      };
    const homonym = locals.find(
      (item) => nameKey(item.name) === nameKey(external.name),
    );
    if (homonym)
      return {
        external,
        status: 'homonym',
        message: `Já existe “${homonym.name}” com outra identidade. Nomes iguais não são associados automaticamente.`,
        candidates,
        proposal: create(),
      };
    return {
      external,
      status: 'new',
      message: 'Propriedade nova neste projeto.',
      candidates,
      proposal: create(),
    };
  });
}

export type SealPropertyImportResult = {
  template: SheetTemplate;
  /** Applied together with the template, in the same history step. */
  additions: SealPropertyDefinition[];
  aliases: { property: string; alias: string }[];
};

export function resolveSealPropertyImport(
  project: Pick<Project, 'sealPropertyDefinitions'>,
  template: SheetTemplate,
  externals: readonly SealPropertyDefinition[],
  decisions: ReadonlyMap<string, SealPropertyImportDecision>,
  newId: () => string,
): SealPropertyImportResult {
  const locals = project.sealPropertyDefinitions ?? [];
  const usedIds = new Set(locals.map((item) => item.id));
  const usedAliases = new Set(locals.flatMap((item) => item.aliases ?? []));
  const remap = new Map<string, string>();
  const additions: SealPropertyDefinition[] = [];
  const aliases: SealPropertyImportResult['aliases'] = [];
  const referenced = new Set(
    template.fields.flatMap((f) =>
      f.sealBinding?.property ? [f.sealBinding.property] : [],
    ),
  );
  for (const id of referenced)
    if (!externals.some((item) => item.id === id))
      throw Error(
        'O arquivo de modelo não traz a definição de uma propriedade usada pelos campos.',
      );
  for (const external of externals) {
    const decision = decisions.get(external.id);
    if (!decision) throw Error(`Escolha como importar “${external.name}”.`);
    if (decision.kind === 'map') {
      const target = locals.find((item) => item.id === decision.to);
      if (!target || !compatible(target, external))
        throw Error(
          `“${external.name}” só pode ser associada a uma propriedade do mesmo tipo e escopo.`,
        );
      remap.set(external.id, target.id);
      if (target.id !== external.id && !target.aliases?.includes(external.id)) {
        if (usedAliases.has(external.id))
          throw Error(
            `“${external.name}” já está associada a outra propriedade deste projeto.`,
          );
        aliases.push({ property: target.id, alias: external.id });
        usedAliases.add(external.id);
      }
      continue;
    }
    const id = usedIds.has(external.id) ? newId() : external.id;
    usedIds.add(id);
    if (id !== external.id && usedAliases.has(external.id))
      throw Error(
        `“${external.name}” já está associada a outra propriedade deste projeto. Associe-a em vez de criar uma cópia.`,
      );
    if (id !== external.id) usedAliases.add(external.id);
    additions.push({
      ...structuredClone(external),
      id,
      name: decision.name,
      ...(id === external.id ? {} : { aliases: [external.id] }),
    });
    remap.set(external.id, id);
  }
  const all = [...locals, ...additions];
  const parsed = sealPropertyDefinitionsSchema.safeParse(all);
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  const rewritten = rewriteTemplate(
    template,
    new Map([...remap].filter(([from, to]) => from !== to)),
  );
  return { template: rewritten, additions, aliases };
}

/** Adds the definitions/aliases confirmed in an import; validated again on apply. */
export function withSealPropertyImport(
  project: Project,
  result: Pick<SealPropertyImportResult, 'additions' | 'aliases'>,
): Project {
  if (!result.additions.length && !result.aliases.length) return project;
  const locals = project.sealPropertyDefinitions ?? [];
  for (const { property } of result.aliases)
    if (!locals.some((item) => item.id === property))
      throw Error(
        'Uma propriedade escolhida no mapeamento não existe mais. Importe o modelo novamente.',
      );
  const definitions = [
    ...locals.map((item) => {
      const extra = result.aliases
        .filter((alias) => alias.property === item.id)
        .map((alias) => alias.alias);
      return extra.length
        ? { ...item, aliases: [...(item.aliases ?? []), ...extra] }
        : item;
    }),
    ...result.additions,
  ];
  const parsed = sealPropertyDefinitionsSchema.safeParse(definitions);
  if (!parsed.success)
    throw Error(
      'O cadastro mudou desde a importação. ' + parsed.error.issues[0].message,
    );
  return { ...project, sealPropertyDefinitions: parsed.data };
}
