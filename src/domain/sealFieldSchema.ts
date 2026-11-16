import { z } from 'zod';
import { DRAWING_METADATA_LIMITS, isValidDrawingDate } from './drawingMetadata';

export const SEAL_PROJECT_SCHEMA = 'armadurastruct/39' as const;
/** /40 is reserved by a parallel contribution; /41 adds custom seal properties. */
export const CUSTOM_SEAL_PROJECT_SCHEMA = 'armadurastruct/41' as const;

/** Formats that read the documentary seal data of /39. */
export const isSealProjectSchema = (schema: unknown) =>
  schema === SEAL_PROJECT_SCHEMA || schema === CUSTOM_SEAL_PROJECT_SCHEMA;

function templateHasCustomBindings(template: unknown) {
  if (!template || typeof template !== 'object') return false;
  const fields = (template as { fields?: unknown }).fields;
  return (
    Array.isArray(fields) &&
    fields.some((field) => {
      const binding =
        field && typeof field === 'object'
          ? (field as { sealBinding?: unknown }).sealBinding
          : undefined;
      return (
        !!binding &&
        typeof binding === 'object' &&
        ('property' in binding || 'prefix' in binding || 'suffix' in binding)
      );
    })
  );
}

/** Custom properties, affixes and their values cannot be read before /41. */
export function hasCustomSealData(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const data = input as Record<string, unknown>;
  return (
    data.sealPropertyDefinitions !== undefined ||
    data.sealPropertyValues !== undefined ||
    (Array.isArray(data.sheetTemplates) &&
      data.sheetTemplates.some(templateHasCustomBindings)) ||
    (Array.isArray(data.sheets) &&
      data.sheets.some(
        (sheet) =>
          !!sheet &&
          typeof sheet === 'object' &&
          ((sheet as Record<string, unknown>).sealPropertyValues !==
            undefined ||
            templateHasCustomBindings(
              (sheet as Record<string, unknown>).paperTemplate,
            )),
      ))
  );
}

/** Inspect raw data before a reader can discard fields from an older format. */
export function hasSealData(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const data = input as Record<string, unknown>;
  const templateHasBindings = (template: unknown) => {
    if (!template || typeof template !== 'object') return false;
    const fields = (template as { fields?: unknown }).fields;
    return (
      Array.isArray(fields) &&
      fields.some(
        (field) =>
          field &&
          typeof field === 'object' &&
          (field.sealBinding !== undefined ||
            field.fontWeight !== undefined ||
            field.fontStyle !== undefined),
      )
    );
  };
  return (
    data.sealProperties !== undefined ||
    (Array.isArray(data.sheetTemplates) &&
      data.sheetTemplates.some(templateHasBindings)) ||
    (Array.isArray(data.sheets) &&
      data.sheets.some(
        (sheet) =>
          sheet &&
          typeof sheet === 'object' &&
          (sheet.sealProperties !== undefined ||
            sheet.sealBindings !== undefined ||
            templateHasBindings(sheet.paperTemplate)),
      ))
  );
}

/** Raises the format only as needed; a /41 project never returns to /39. */
export function withSealDataVersion<T extends { schema: string }>(
  project: T,
): T {
  if (project.schema === CUSTOM_SEAL_PROJECT_SCHEMA) return project;
  if (hasCustomSealData(project))
    return { ...project, schema: CUSTOM_SEAL_PROJECT_SCHEMA };
  return hasSealData(project)
    ? { ...project, schema: SEAL_PROJECT_SCHEMA }
    : project;
}

const singleLine = (limit: number) =>
  z
    .string()
    .max(limit)
    .refine(
      (text) => !/[\x00-\x1f\x7f]/.test(text),
      'Use texto sem caracteres de controle.',
    );

const date = z
  .string()
  .refine(
    (text) => text === '' || isValidDrawingDate(text),
    'Informe uma data documental válida (AAAA-MM-DD) sem horário.',
  );

const documentaryFields = {
  work: singleLine(150),
  code: singleLine(80),
  address: singleLine(300),
  client: singleLine(150),
  responsible: singleLine(150),
  date,
};

export const projectSealPropertiesSchema = z
  .strictObject(documentaryFields)
  .partial();

const inherited = z.strictObject({ mode: z.literal('inherit') });
const sheetValue = (value: z.ZodString) =>
  z.discriminatedUnion('mode', [
    inherited,
    z.strictObject({ mode: z.literal('local'), value }),
  ]);

export const sheetSealPropertiesSchema = z
  .strictObject({
    work: sheetValue(documentaryFields.work),
    code: sheetValue(documentaryFields.code),
    address: sheetValue(documentaryFields.address),
    client: sheetValue(documentaryFields.client),
    responsible: sheetValue(documentaryFields.responsible),
    author: sheetValue(singleLine(DRAWING_METADATA_LIMITS.author)),
    date: sheetValue(date),
    revision: z.literal('inherit'),
  })
  .partial();

export type ProjectSealProperties = z.infer<typeof projectSealPropertiesSchema>;
export type SheetSealProperties = z.infer<typeof sheetSealPropertiesSchema>;
export type SheetSealValue = NonNullable<SheetSealProperties['author']>;

const identity = singleLine(200).min(1);
const portableSource = z.enum(['project', 'sheet', 'aggregate']);

/** Literal text around the resolved value; never interpreted as code or markup. */
export const sealAffixSchema = singleLine(100);

export const templateSealBindingSchema = z
  .strictObject({
    field: z
      .string()
      .max(80)
      .regex(/^@[A-Z][A-Z0-9_]*$/, 'Identificador de campo inválido.')
      .optional(),
    /** Stable ID of a custom property (format 41). Never a name. */
    property: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,200}$/, 'Identificador de propriedade inválido.')
      .optional(),
    source: portableSource.optional(),
    prefix: sealAffixSchema.optional(),
    suffix: sealAffixSchema.optional(),
  })
  .refine(
    (binding) =>
      (binding.field === undefined) !== (binding.property === undefined),
    'Associe o campo a um dado nativo ou a uma propriedade personalizada.',
  );

const sealFieldSourceSchema = z.union([
  z.strictObject({ kind: portableSource }),
  z.strictObject({ kind: z.literal('drawing'), drawingId: identity }),
]);

export type SealFieldSource = z.infer<typeof sealFieldSourceSchema>;

const sheetSealBindingSchema = z
  .strictObject({
    templateId: identity,
    fieldId: identity,
    source: sealFieldSourceSchema.optional(),
    manualText: z
      .string()
      .max(DRAWING_METADATA_LIMITS.notes)
      .refine(
        (text) => !/[\x00-\x09\x0b-\x1f\x7f]/.test(text),
        'Use texto sem caracteres de controle inválidos.',
      )
      .optional(),
  })
  .refine(
    (binding) =>
      binding.source !== undefined || binding.manualText !== undefined,
    'Informe uma origem ou um texto manual.',
  );

export const sheetSealBindingsSchema = z
  .array(sheetSealBindingSchema)
  .max(1000)
  .superRefine((bindings, ctx) => {
    const keys = new Set<string>();
    for (const [index, binding] of bindings.entries()) {
      const key = JSON.stringify([binding.templateId, binding.fieldId]);
      if (keys.has(key))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'fieldId'],
          message: 'O campo do selo já tem uma configuração nesta folha.',
        });
      keys.add(key);
    }
  });

export type TemplateSealBinding = z.infer<typeof templateSealBindingSchema>;
export type SheetSealBinding = z.infer<typeof sheetSealBindingSchema>;
