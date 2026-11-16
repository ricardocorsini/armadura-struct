import { z } from 'zod';
import type { Project, Sheet } from './types';
import {
  patchProjectSealProperties,
  patchSheetSealBindings,
  patchSheetSealProperties,
  type SealPatch,
} from './sealFieldEdits';
import {
  withSealDataVersion,
  type ProjectSealProperties,
  type SheetSealProperties,
  type SheetSealBinding,
  type TemplateSealBinding,
} from './sealFieldSchema';
import {
  patchSealPropertyValues,
  replaceSealPropertyDefinitions,
  validateSealPropertyData,
  type SealPropertyDefinition,
  type SealPropertyRemap,
  type SealPropertyValuePatch,
} from './sealProperties';
import { composeSheet } from './paper';
import {
  applySheetTemplate,
  saveSheetTemplate,
  type SheetTemplate,
} from './sheetTemplates';

export type SealFieldEdit = {
  fieldId: string;
  definition?: TemplateSealBinding | null;
  /**
   * "Voltar a texto": with `definition: null`, fixes this literal as the static
   * text of the field. It stops updating from that revision on.
   */
  staticText?: string;
} & SealPatch<Pick<SheetSealBinding, 'source' | 'manualText'>>;

export type SealBatchEdit = {
  sheetIds: string[];
  name?: string;
  author?: string;
  projectProperties?: SealPatch<ProjectSealProperties>;
  sheetProperties?: SealPatch<SheetSealProperties>;
  revision?: string;
  template?: SheetTemplate;
  fields?: SealFieldEdit[];
  /** Whole custom property registry after the edit, with remaps for removals. */
  properties?: {
    definitions: SealPropertyDefinition[];
    remaps?: SealPropertyRemap[];
  };
  projectPropertyValues?: SealPropertyValuePatch[];
  /** Applied to each selected sheet. */
  sheetPropertyValues?: SealPropertyValuePatch[];
};

export const sameSealTemplate = (a?: SheetTemplate, b?: SheetTemplate) =>
  !!a &&
  !!b &&
  a.id === b.id &&
  a.revision === b.revision &&
  (a === b || JSON.stringify(a) === JSON.stringify(b));

/** One pure document change. The application commits it once to its history. */
export function applySealBatch(project: Project, edit: SealBatchEdit): Project {
  const selected = new Set(edit.sheetIds);
  if (
    !selected.size ||
    [...selected].some((id) => !project.sheets.some((s) => s.id === id))
  )
    throw Error('Selecione folhas existentes para preencher o selo.');
  const name =
    edit.name === undefined
      ? project.name
      : z.string().trim().min(1).max(150).parse(edit.name);
  const author =
    edit.author === undefined
      ? project.author
      : z.string().max(150).parse(edit.author);
  const revision =
    edit.revision === undefined
      ? undefined
      : z.string().max(40).parse(edit.revision);
  const properties = patchProjectSealProperties(
    project.sealProperties,
    edit.projectProperties ?? {},
  );
  const fields = edit.fields ?? [];
  // Additions and changes first; removals and remaps after the field edits,
  // so one confirmation can unbind a field and delete its property.
  const removed = (project.sealPropertyDefinitions ?? []).filter(
    (item) =>
      edit.properties &&
      !edit.properties.definitions.some((next) => next.id === item.id),
  );
  let next = edit.properties
    ? replaceSealPropertyDefinitions(project, [
        ...edit.properties.definitions,
        ...removed,
      ])
    : project;
  const editedTemplate = edit.template;
  if (edit.projectPropertyValues?.length)
    next = {
      ...next,
      sealPropertyValues: patchSealPropertyValues(
        next.sealPropertyValues,
        edit.projectPropertyValues,
      ),
    };
  const eligible = next.sheets.filter(
    (s) =>
      selected.has(s.id) && sameSealTemplate(s.paperTemplate, editedTemplate),
  );
  if (fields.length && !eligible.length)
    throw Error(
      'Selecione uma folha com a revisão do modelo que está sendo editada.',
    );
  const definitions = fields.filter((field) => field.definition !== undefined);
  if (definitions.length && editedTemplate) {
    const catalog = next.sheetTemplates?.find(
      (t) => t.id === editedTemplate.id,
    );
    if (catalog && !sameSealTemplate(catalog, editedTemplate))
      throw Error(
        'Há outra revisão do modelo na biblioteca. Aplique a revisão atual antes de alterar seus vínculos.',
      );
    const template = {
      ...editedTemplate,
      fields: editedTemplate.fields.map((field) => {
        const change = definitions.find((item) => item.fieldId === field.id);
        if (!change) return field;
        if (change.definition === null && change.staticText !== undefined)
          return { ...field, text: change.staticText, sealBinding: undefined };
        return { ...field, sealBinding: change.definition ?? undefined };
      }),
    };
    next = saveSheetTemplate(next, template);
    next = applySheetTemplate(
      next,
      template.id,
      eligible.map((s) => s.id),
    );
  }
  if (
    fields.some(
      (field) => !editedTemplate?.fields.some((f) => f.id === field.fieldId),
    )
  )
    throw Error(
      'O campo do modelo não existe mais. Reabra o preenchimento do selo.',
    );
  const eligibleIds = new Set(eligible.map((s) => s.id));
  const sheets: Sheet[] = next.sheets.map((sheet) => {
    if (!selected.has(sheet.id)) return sheet;
    let bindings = sheet.sealBindings;
    if (eligibleIds.has(sheet.id) && editedTemplate)
      for (const field of fields)
        bindings = patchSheetSealBindings(
          bindings,
          {
            templateId: editedTemplate.id,
            fieldId: field.fieldId,
          },
          field.staticText !== undefined
            ? { source: null, manualText: null }
            : { source: field.source, manualText: field.manualText },
        );
    return {
      ...sheet,
      sealProperties: patchSheetSealProperties(
        sheet.sealProperties,
        edit.sheetProperties ?? {},
      ),
      sealBindings: bindings,
      sealPropertyValues: edit.sheetPropertyValues?.length
        ? patchSealPropertyValues(
            sheet.sealPropertyValues,
            edit.sheetPropertyValues,
          )
        : sheet.sealPropertyValues,
      properties:
        revision === undefined
          ? sheet.properties
          : { ...sheet.properties, revision },
    };
  });
  const staged = {
    ...next,
    name,
    author,
    sealProperties: properties,
    sheets,
  };
  const result = withSealDataVersion(
    edit.properties
      ? replaceSealPropertyDefinitions(
          staged,
          edit.properties.definitions,
          edit.properties.remaps,
        )
      : staged,
  );
  validateSealPropertyData(result);
  const document = (p: Project) =>
    JSON.stringify([
      p.name,
      p.author,
      p.sealProperties,
      p.sealPropertyDefinitions,
      p.sealPropertyValues,
      p.sheetTemplates,
      p.sheets,
    ]);
  return document(result) === document(project) ? project : result;
}

/**
 * Text that "Voltar a texto" fixes: the visible resolved text of the sheet,
 * with prefix and suffix. An invalid field cannot be frozen as if correct.
 */
export function sealFieldStaticText(
  project: Project,
  sheetId: string,
  fieldId: string,
): string {
  const page = composeSheet(project, sheetId);
  const issue = page.issues.find((item) => item.fieldId === fieldId);
  if (issue)
    throw Error(
      issue.message +
        ' Corrija o campo ou informe um texto manual antes de voltar a texto.',
    );
  const field = page.sealFields?.find((item) => item.id === fieldId);
  if (!field) throw Error('O campo não está vinculado nesta folha.');
  return field.text;
}
