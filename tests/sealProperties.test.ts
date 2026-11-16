import { describe, expect, it } from 'vitest';
import { applySealBatch, sealFieldStaticText } from '../src/domain/sealProject';
import {
  CUSTOM_SEAL_PROJECT_SCHEMA,
  SEAL_PROJECT_SCHEMA,
} from '../src/domain/sealFieldSchema';
import {
  formatSealPropertyValue,
  planSealPropertyImport,
  replaceSealPropertyDefinitions,
  resolveSealProperty,
  resolveSealPropertyImport,
  sealPropertyChangeImpact,
  sealPropertyValueError,
  withSealPropertyImport,
  type SealPropertyDefinition,
  type SealPropertyImportDecision,
} from '../src/domain/sealProperties';
import { composeSheet } from '../src/domain/paper';
import { decodeProject, emptyProject, schedule } from '../src/domain/model';
import { createSheet, duplicateSheet } from '../src/domain/sheets';
import {
  applySheetTemplate,
  decodeSheetTemplateFile,
  encodeSheetTemplate,
  fieldFromImportedText,
  saveSheetTemplate,
  templateFromSheet,
  type SheetTemplate,
} from '../src/domain/sheetTemplates';
import {
  createDetailPackage,
  readDetailPackage,
} from '../src/domain/detailPackage';
import { createRecoverySession } from '../src/lib/recoverySession';
import { assertDetailEdit } from '../src/domain/detailEditing';
import { toCsv, toSheetDxf, toSheetPdf } from '../src/lib/exports';
import type { Project } from '../src/domain/types';

const unit: SealPropertyDefinition = {
  id: 'unidade',
  name: 'Unidade',
  type: 'text',
  scope: 'project-sheet',
  default: 'cm',
};

/** Two sheets with a template whose imported text "UNID." becomes a field. */
function fixture() {
  const base = emptyProject();
  const second = createSheet(base, 'Segunda');
  const template: SheetTemplate = {
    ...templateFromSheet(base.sheets[0]),
    geometry: [
      {
        layer: 'SELO',
        points: [
          { x: 40, y: 30 },
          { x: 160, y: 30 },
        ],
      },
      {
        layer: 'TEXTOS',
        points: [{ x: 60, y: 50 }],
        text: 'UNID.',
        textHeight: 3.5,
        textRotation: 15,
        textAlign: 'center',
        textFont: { family: 'serif', weight: 'bold', style: 'italic' },
      },
      {
        layer: 'TEXTOS',
        points: [{ x: 60, y: 70 }],
        text: '@UNIDADE',
        textHeight: 2.5,
      },
    ],
    fields: [],
  };
  const converted = fieldFromImportedText(template, 1);
  const p = applySheetTemplate(
    saveSheetTemplate(second.project, converted),
    converted.id,
    second.project.sheets.map((s) => s.id),
  );
  return { project: p, field: converted.fields[0] };
}

function withUnit(p = fixture().project) {
  const field = p.sheets[0].paperTemplate!.fields[0];
  return applySealBatch(p, {
    sheetIds: [p.sheets[0].id],
    template: p.sheets[0].paperTemplate,
    properties: { definitions: [unit] },
    fields: [
      {
        fieldId: field.id,
        definition: { property: 'unidade', prefix: 'Unid.: ', suffix: '.' },
      },
    ],
  });
}

/** Batch on the first sheet unless other sheets are given. */
function on(
  p: Project,
  edit: Omit<Parameters<typeof applySealBatch>[1], 'sheetIds'> & {
    sheetIds?: string[];
  },
) {
  return applySealBatch(p, { sheetIds: [p.sheets[0].id], ...edit });
}

const textOf = (p: Project, sheetIndex: number) =>
  composeSheet(p, p.sheets[sheetIndex].id).sealFields?.[0];

describe('Definições e valores de propriedades personalizadas', () => {
  it('“Unidade” com padrão “cm”: uma folha usa “m” e outra mantém “cm”', () => {
    const p = withUnit();
    // The incorporated revision changed; apply it to the other sheet too.
    const all = applySheetTemplate(
      p,
      p.sheets[0].paperTemplate!.id,
      p.sheets.map((s) => s.id),
    );
    const local = applySealBatch(all, {
      sheetIds: [all.sheets[0].id],
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    expect(local.schema).toBe(CUSTOM_SEAL_PROJECT_SCHEMA);
    expect(textOf(local, 0)).toMatchObject({
      text: 'Unid.: m.',
      origin: 'sheet',
    });
    expect(textOf(local, 1)).toMatchObject({
      text: 'Unid.: cm.',
      origin: 'default',
    });

    // Changing the default keeps explicit values, including an explicit empty.
    const empty = applySealBatch(local, {
      sheetIds: [local.sheets[1].id],
      sheetPropertyValues: [{ property: 'unidade', value: null }],
    });
    const changed = applySealBatch(empty, {
      sheetIds: [empty.sheets[0].id],
      properties: { definitions: [{ ...unit, default: 'mm' }] },
    });
    expect(textOf(changed, 0)?.text).toBe('Unid.: m.');
    expect(textOf(changed, 1)).toMatchObject({
      text: '',
      explicitEmpty: true,
    });
    // Restoring inheritance is an explicit action.
    const restored = applySealBatch(changed, {
      sheetIds: [changed.sheets[1].id],
      sheetPropertyValues: [{ property: 'unidade', inherit: true }],
    });
    expect(textOf(restored, 1)).toMatchObject({
      text: 'Unid.: mm.',
      origin: 'default',
    });
    expect(restored.sheets[1].sealPropertyValues).toBeUndefined();
  });

  it('segue a precedência manual > folha > projeto > padrão e respeita a origem direta', () => {
    const p = withUnit();
    const project = applySealBatch(p, {
      sheetIds: [p.sheets[0].id],
      projectPropertyValues: [{ property: 'unidade', value: 'dm' }],
    });
    expect(textOf(project, 0)).toMatchObject({
      text: 'Unid.: dm.',
      origin: 'project',
      inherited: true,
    });
    const sheet = applySealBatch(project, {
      sheetIds: [project.sheets[0].id],
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    expect(textOf(sheet, 0)?.text).toBe('Unid.: m.');
    const field = sheet.sheets[0].paperTemplate!.fields[0];
    // A direct project source never reads the sheet implicitly.
    const direct = applySealBatch(sheet, {
      sheetIds: [sheet.sheets[0].id],
      template: sheet.sheets[0].paperTemplate,
      fields: [{ fieldId: field.id, source: { kind: 'project' } }],
    });
    expect(textOf(direct, 0)?.text).toBe('Unid.: dm.');
    const manual = applySealBatch(direct, {
      sheetIds: [direct.sheets[0].id],
      template: direct.sheets[0].paperTemplate,
      fields: [{ fieldId: field.id, manualText: 'km' }],
    });
    expect(textOf(manual, 0)).toMatchObject({
      text: 'Unid.: km.',
      source: { kind: 'manual' },
    });
  });

  it('zero, falso, datas e acentos seguem o tipo e sobrevivem a salvar/reabrir', () => {
    const definitions: SealPropertyDefinition[] = [
      {
        id: 'carga',
        name: 'Carga',
        type: 'number',
        scope: 'project',
        rules: { min: 0, decimals: 2 },
      },
      { id: 'aprovado', name: 'Aprovado', type: 'boolean', scope: 'sheet' },
      { id: 'entrega', name: 'Entrega', type: 'date', scope: 'project-sheet' },
      { id: 'obs', name: 'Observação', type: 'text', scope: 'project' },
    ];
    const p = on(withUnit(), {
      properties: { definitions: [unit, ...definitions] },
      projectPropertyValues: [
        { property: 'carga', value: 0 },
        { property: 'entrega', value: '2024-02-29' },
        { property: 'obs', value: 'Fundação — São João' },
      ],
      sheetPropertyValues: [
        { property: 'aprovado', value: false },
        { property: 'entrega', value: null },
      ],
    });
    const reopened = decodeProject(JSON.stringify(p));
    expect(reopened).toEqual(p);
    const sheet = reopened.sheets[0];
    expect(resolveSealProperty(reopened, sheet, 'carga')).toEqual({
      text: '0,00',
      origin: 'project',
    });
    expect(resolveSealProperty(reopened, sheet, 'aprovado')).toEqual({
      text: 'Não',
      origin: 'sheet',
    });
    expect(resolveSealProperty(reopened, sheet, 'entrega')).toEqual({
      text: '',
      origin: 'sheet',
      explicitEmpty: true,
    });
    expect(resolveSealProperty(reopened, sheet, 'entrega', 'project')).toEqual({
      text: '29/02/2024',
      origin: 'project',
    });
    expect(resolveSealProperty(reopened, sheet, 'obs').text).toBe(
      'Fundação — São João',
    );
    // Invalid values are refused before saving.
    expect(sealPropertyValueError(definitions[2], '2023-02-29')).toMatch(
      /data civil/,
    );
    expect(sealPropertyValueError(definitions[0], Number.NaN)).toMatch(
      /finito/,
    );
    expect(sealPropertyValueError(definitions[0], 1.234)).toMatch(/casas/);
    expect(sealPropertyValueError(definitions[0], -1)).toMatch(/maior/);
    expect(() =>
      applySealBatch(p, {
        sheetIds: [p.sheets[0].id],
        projectPropertyValues: [{ property: 'entrega', value: '2024-13-01' }],
      }),
    ).toThrow(/data civil/);
    expect(() =>
      applySealBatch(p, {
        sheetIds: [p.sheets[0].id],
        // Scope "sheet" has no project value.
        projectPropertyValues: [{ property: 'aprovado', value: true }],
      }),
    ).toThrow(/não admite/);
    expect(() =>
      applySealBatch(p, {
        sheetIds: [p.sheets[0].id],
        projectPropertyValues: [{ property: 'inexistente', value: 'x' }],
      }),
    ).toThrow(/inexistente/);
    expect(formatSealPropertyValue({ type: 'boolean' }, true)).toBe('Sim');
  });

  it('recusa IDs e nomes repetidos, tipos desconhecidos, padrões inválidos e excesso', () => {
    const p = withUnit();
    const replace = (definitions: unknown[]) => () =>
      replaceSealPropertyDefinitions(
        p,
        definitions as SealPropertyDefinition[],
      );
    expect(replace([unit, { ...unit, name: 'Outra' }])).toThrow(/repetido/);
    expect(replace([unit, { ...unit, id: 'x', name: 'unidade' }])).toThrow(
      /Já existe/,
    );
    expect(
      replace([unit, { ...unit, id: 'x', name: 'X', type: 'cor' }]),
    ).toThrow();
    expect(
      replace([
        unit,
        { id: 'n', name: 'N', type: 'number', scope: 'project', default: 'a' },
      ]),
    ).toThrow(/padrão/);
    expect(
      replace([
        unit,
        {
          id: 'n',
          name: 'N',
          type: 'text',
          scope: 'project',
          rules: { min: 1 },
        },
      ]),
    ).toThrow(/número/);
    expect(
      replace(
        Array.from({ length: 201 }, (_, i) => ({
          id: 'p' + i,
          name: 'P' + i,
          type: 'text',
          scope: 'project',
        })),
      ),
    ).toThrow();
  });

  it('renomear conserva ID, valores e vínculos', () => {
    const p = on(withUnit(), {
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    const renamed = applySealBatch(p, {
      sheetIds: [p.sheets[0].id],
      properties: { definitions: [{ ...unit, name: 'Unidade de medida' }] },
    });
    expect(renamed.sealPropertyDefinitions?.[0].id).toBe('unidade');
    expect(textOf(renamed, 0)?.text).toBe('Unid.: m.');
    expect(renamed.sheets[0].paperTemplate).toEqual(p.sheets[0].paperTemplate);
  });

  it('mudar tipo em uso mostra o impacto e não converte nem apaga valores', () => {
    const p = on(withUnit(), {
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    const numeric = { ...unit, type: 'number' as const, default: 1 };
    const impact = sealPropertyChangeImpact(p, numeric);
    // The library and the incorporated revision of the sheet.
    expect(impact.usage.fields).toHaveLength(2);
    expect(impact.invalid).toEqual([
      expect.stringMatching(/^Folha .*número finito/),
    ]);
    expect(() =>
      applySealBatch(p, {
        sheetIds: [p.sheets[0].id],
        properties: { definitions: [numeric] },
      }),
    ).toThrow(/não foi aplicada/);
    // Narrowing the scope while a project value exists is refused too.
    const withProject = applySealBatch(p, {
      sheetIds: [p.sheets[0].id],
      projectPropertyValues: [{ property: 'unidade', value: 'dm' }],
    });
    expect(() =>
      applySealBatch(withProject, {
        sheetIds: [p.sheets[0].id],
        properties: { definitions: [{ ...unit, scope: 'sheet' }] },
      }),
    ).toThrow(/escopo/);
    expect(p.sheets[0].sealPropertyValues).toEqual([
      { property: 'unidade', value: 'm' },
    ]);
  });

  it('excluir uma propriedade em uso exige substituta compatível e não deixa órfãos', () => {
    const p = withUnit();
    expect(() =>
      applySealBatch(p, {
        sheetIds: [p.sheets[0].id],
        properties: { definitions: [] },
      }),
    ).toThrow(/está em uso: “Texto importado 2” em/);
    const target: SealPropertyDefinition = {
      id: 'medida',
      name: 'Medida',
      type: 'text',
      scope: 'project-sheet',
    };
    expect(() =>
      applySealBatch(p, {
        sheetIds: [p.sheets[0].id],
        properties: {
          definitions: [{ ...target, type: 'number' }],
          remaps: [{ from: 'unidade', to: 'medida' }],
        },
      }),
    ).toThrow(/não substitui/);
    const remapped = applySealBatch(p, {
      sheetIds: [p.sheets[0].id],
      properties: {
        definitions: [target],
        remaps: [{ from: 'unidade', to: 'medida' }],
      },
    });
    expect(
      [
        ...remapped.sheetTemplates!,
        ...remapped.sheets.flatMap((s) => s.paperTemplate ?? []),
      ].flatMap((t) => t.fields.map((f) => f.sealBinding?.property)),
    ).not.toContain('unidade');
    expect(remapped.sheets[0].paperTemplate!.fields[0].sealBinding).toEqual({
      property: 'medida',
      prefix: 'Unid.: ',
      suffix: '.',
    });
    expect(decodeProject(JSON.stringify(remapped))).toEqual(remapped);
  });
});

describe('Converter texto em campo e voltar a texto', () => {
  const presentation = (field: SheetTemplate['fields'][number]) => ({
    origin: field.origin,
    box: field.box,
    font: field.font,
    height: field.height,
    align: field.align,
    rotation: field.rotation,
    fontWeight: field.fontWeight,
    fontStyle: field.fontStyle,
  });

  it('converte um texto importado preservando apresentação, sem duplicar, e volta a texto', () => {
    const { project, field } = fixture();
    const template = project.sheets[0].paperTemplate!;
    expect(field).toMatchObject({
      origin: { x: 60, y: 50 },
      font: 'times',
      height: 3.5,
      align: 'center',
      rotation: 15,
      fontWeight: 'bold',
      fontStyle: 'italic',
    });
    // The original text is not kept underneath the field.
    expect(template.geometry.filter((g) => g.text === 'UNID.')).toHaveLength(0);
    // A literal "@" text stays literal while not associated.
    const page = composeSheet(project, project.sheets[0].id);
    expect(page.decorations.some((line) => line.text === '@UNIDADE')).toBe(
      true,
    );

    // The box is enlarged for the prefixed value; presentation stays the same.
    const wider = withUnit(
      (() => {
        const t = {
          ...template,
          fields: [{ ...field, box: { x: 30, y: 20, width: 80, height: 60 } }],
        };
        const saved = saveSheetTemplate(project, t);
        return applySheetTemplate(
          saved,
          t.id,
          saved.sheets.map((s) => s.id),
        );
      })(),
    );
    const bound = wider.sheets[0].paperTemplate!.fields[0];
    const before = presentation(bound);
    const page2 = composeSheet(wider, wider.sheets[0].id);
    const line = page2.decorations.find((l) => l.text === 'Unid.: cm.')!;
    expect(line).toMatchObject({
      points: [bound.origin],
      textHeight: 3.5,
      textRotation: 15,
      textAlign: 'center',
      textFont: { family: 'serif', weight: 'bold', style: 'italic' },
    });

    // Switching the binding keeps presentation.
    const other: SealPropertyDefinition = {
      id: 'fase',
      name: 'Fase',
      type: 'text',
      scope: 'project',
      default: 'Executivo',
    };
    const switched = applySealBatch(wider, {
      sheetIds: [wider.sheets[0].id],
      template: wider.sheets[0].paperTemplate,
      properties: { definitions: [unit, other] },
      fields: [{ fieldId: bound.id, definition: { property: 'fase' } }],
    });
    const switchedField = switched.sheets[0].paperTemplate!.fields[0];
    expect(presentation(switchedField)).toEqual(before);
    expect(switchedField.id).toBe(bound.id);

    // "Voltar a texto" freezes the visible resolved text, with affixes.
    const text = sealFieldStaticText(wider, wider.sheets[0].id, bound.id);
    expect(text).toBe('Unid.: cm.');
    const frozen = applySealBatch(wider, {
      sheetIds: [wider.sheets[0].id],
      template: wider.sheets[0].paperTemplate,
      fields: [{ fieldId: bound.id, definition: null, staticText: text }],
    });
    const frozenField = frozen.sheets[0].paperTemplate!.fields[0];
    expect(frozenField.sealBinding).toBeUndefined();
    expect(frozenField.text).toBe('Unid.: cm.');
    expect(presentation(frozenField)).toEqual(before);
    // It no longer updates.
    const later = applySealBatch(frozen, {
      sheetIds: [frozen.sheets[0].id],
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    expect(
      composeSheet(later, later.sheets[0].id).decorations.filter((l) =>
        l.text?.startsWith('Unid.'),
      ),
    ).toEqual([expect.objectContaining({ text: 'Unid.: cm.' })]);
    // Repeating convert/freeze does not drift.
    const again = applySealBatch(frozen, {
      sheetIds: [frozen.sheets[0].id],
      template: frozen.sheets[0].paperTemplate,
      fields: [
        {
          fieldId: bound.id,
          definition: { property: 'unidade', prefix: 'Unid.: ', suffix: '.' },
        },
      ],
    });
    expect(presentation(again.sheets[0].paperTemplate!.fields[0])).toEqual(
      before,
    );
  });

  it('não congela um campo inválido nem executa valores com aparência de código', () => {
    const p = withUnit();
    const field = p.sheets[0].paperTemplate!.fields[0];
    // The original box is too small for the prefixed value: overflow is reported.
    expect(() => sealFieldStaticText(p, p.sheets[0].id, field.id)).toThrow(
      /ultrapassa a caixa/,
    );
    const code = '<script>alert(1)</script>${x}=1+1';
    const values = applySealBatch(p, {
      sheetIds: [p.sheets[0].id],
      projectPropertyValues: [{ property: 'unidade', value: code }],
    });
    expect(resolveSealProperty(values, undefined, 'unidade').text).toBe(code);
  });
});

describe('Transporte das definições com o modelo', () => {
  function exported() {
    const p = on(withUnit(), {
      projectPropertyValues: [{ property: 'unidade', value: 'dm' }],
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    return encodeSheetTemplate(p.sheets[0].paperTemplate!, p);
  }
  const decide = (
    items: ReturnType<typeof planSealPropertyImport>,
    override: Record<string, SealPropertyImportDecision> = {},
  ) =>
    new Map(
      items.map((item) => [
        item.external.id,
        override[item.external.id] ?? item.proposal,
      ]),
    );
  let next = 0;
  const newId = () => 'novo-' + ++next;

  it('carrega definições e vínculos sem dados particulares das folhas', () => {
    const raw = exported();
    const file = JSON.parse(raw);
    expect(file.schema).toBe('armadurastruct.sheet-template/3');
    expect(file.properties).toEqual([unit]);
    expect(raw).not.toContain('"dm"');
    expect(raw).not.toContain('"m"');
    expect(decodeSheetTemplateFile(raw).properties).toEqual([unit]);
    // Older template versions cannot carry custom properties.
    expect(() =>
      decodeSheetTemplateFile(
        JSON.stringify({ ...file, schema: 'armadurastruct.sheet-template/2' }),
      ),
    ).toThrow(/versão 3/);
    expect(() =>
      decodeSheetTemplateFile(JSON.stringify({ ...file, properties: [] })),
    ).toThrow(/inexistente/);
  });

  it('propriedade homônima não sobrescreve valores locais nem é associada pelo nome', () => {
    const { template, properties } = decodeSheetTemplateFile(exported());
    let target = on(fixture().project, {
      properties: {
        definitions: [{ ...unit, id: 'local', default: 'pol' }],
      },
      projectPropertyValues: [{ property: 'local', value: 'pé' }],
    });
    const plan = planSealPropertyImport(target, properties);
    expect(plan[0]).toMatchObject({
      status: 'homonym',
      proposal: { kind: 'create', name: 'Unidade (2)' },
    });
    expect(plan[0].candidates.map((c) => c.id)).toEqual(['local']);
    const result = resolveSealPropertyImport(
      target,
      { ...template, id: 'modelo-importado', name: 'Importado' },
      properties,
      decide(plan),
      newId,
    );
    expect(result.additions).toEqual([{ ...unit, name: 'Unidade (2)' }]);
    target = saveSheetTemplate(
      withSealPropertyImport(target, result),
      result.template,
    );
    expect(target.sealPropertyValues).toEqual([
      { property: 'local', value: 'pé' },
    ]);
    expect(target.sealPropertyDefinitions?.[0]).toMatchObject({
      id: 'local',
      default: 'pol',
    });
    // Reimport recognizes the same ID and creates no duplicate.
    const again = planSealPropertyImport(target, properties);
    expect(again[0]).toMatchObject({
      status: 'identical',
      proposal: { kind: 'map', to: 'unidade' },
    });
  });

  it('ID coincidente com conteúdo divergente exige resolução; o mapeamento explícito é lembrado', () => {
    const { template, properties } = decodeSheetTemplateFile(exported());
    const base = on(fixture().project, {
      properties: {
        definitions: [
          { ...unit, type: 'number', default: 2, name: 'Unidade antiga' },
          { ...unit, id: 'medida', name: 'Medida', default: 'mm' },
        ],
      },
    });
    const plan = planSealPropertyImport(base, properties);
    expect(plan[0].status).toBe('conflict');
    expect(plan[0].candidates.map((c) => c.id)).toEqual(['medida']);
    // Mapping to an incompatible definition is refused.
    expect(() =>
      resolveSealPropertyImport(
        base,
        template,
        properties,
        decide(plan, { unidade: { kind: 'map', to: 'unidade' } }),
        newId,
      ),
    ).toThrow(/mesmo tipo/);
    const result = resolveSealPropertyImport(
      base,
      { ...template, id: 'outro', name: 'Outro' },
      properties,
      decide(plan, { unidade: { kind: 'map', to: 'medida' } }),
      newId,
    );
    expect(result.additions).toEqual([]);
    expect(result.template.fields[0].sealBinding?.property).toBe('medida');
    const saved = saveSheetTemplate(
      withSealPropertyImport(base, result),
      result.template,
    );
    expect(
      saved.sealPropertyDefinitions?.find((d) => d.id === 'medida')?.aliases,
    ).toEqual(['unidade']);
    // The type of the existing "unidade" was not replaced.
    expect(saved.sealPropertyDefinitions?.[0].type).toBe('number');
    // The confirmed mapping is remembered on reimport.
    const reimport = planSealPropertyImport(saved, properties);
    expect(reimport[0]).toMatchObject({
      status: 'confirmed',
      proposal: { kind: 'map', to: 'medida' },
    });
    // Creating an independent copy gets a new ID and remembers the origin.
    const created = resolveSealPropertyImport(
      base,
      template,
      properties,
      decide(plan),
      newId,
    );
    expect(created.additions[0]).toMatchObject({
      id: expect.stringMatching(/^novo-/),
      aliases: ['unidade'],
    });
  });
});

describe('Persistência, duplicação e isolamento físico', () => {
  it('salva em 41, recusa dados novos em formato antigo e reabre o legado', () => {
    const p = withUnit();
    expect(p.schema).toBe(CUSTOM_SEAL_PROJECT_SCHEMA);
    expect(() =>
      decodeProject(JSON.stringify({ ...p, schema: SEAL_PROJECT_SCHEMA })),
    ).toThrow(/formato 41/);
    // A reference to an unknown property is refused when opening.
    expect(() =>
      decodeProject(
        JSON.stringify({ ...p, sealPropertyDefinitions: undefined }),
      ),
    ).toThrow(/inexistente/);
    const legacy = fixture().project;
    expect(decodeProject(JSON.stringify(legacy))).toEqual(legacy);
    // Removing data does not downgrade the format.
    const removed = applySealBatch(p, {
      sheetIds: [p.sheets[0].id],
      template: p.sheets[0].paperTemplate,
      fields: [
        { fieldId: p.sheets[0].paperTemplate!.fields[0].id, definition: null },
      ],
      properties: { definitions: [] },
    });
    expect(removed.schema).toBe(CUSTOM_SEAL_PROJECT_SCHEMA);
  });

  it('duplicar folha mantém vínculos e valores independentes; recuperação e pacote preservam o contrato', async () => {
    const p = on(withUnit(), {
      sheetPropertyValues: [{ property: 'unidade', value: 'm' }],
    });
    const { id, project } = duplicateSheet(p, p.sheets[0].id);
    const copy = project.sheets.find((s) => s.id === id)!;
    expect(copy.sealPropertyValues).toEqual(p.sheets[0].sealPropertyValues);
    expect(copy.sealPropertyValues).not.toBe(p.sheets[0].sealPropertyValues);
    const edited = applySealBatch(project, {
      sheetIds: [id],
      sheetPropertyValues: [{ property: 'unidade', value: 'km' }],
    });
    expect(composeSheet(edited, id).sealFields?.[0].text).toBe('Unid.: km.');
    expect(composeSheet(edited, p.sheets[0].id).sealFields?.[0].text).toBe(
      'Unid.: m.',
    );

    const values: Record<string, string | undefined> = {};
    const recovery = createRecoverySession({
      read: async () => ({ ...values }),
      write: async ({ put, remove }) => {
        Object.assign(values, put);
        for (const key of remove ?? []) delete values[key];
      },
    });
    await recovery.save(JSON.stringify(edited));
    const restored = await recovery.start();
    if (restored.closed) throw Error('Recuperação inesperadamente fechada.');
    expect(decodeProject(restored.raw!)).toEqual(edited);

    const pack = createDetailPackage(edited, edited.hierarchy.details[0].id, {
      producer: { app: 'ArmaduraStruct', version: '0.6.1' },
    });
    expect(JSON.stringify(pack)).not.toContain('sealProperty');
    expect(JSON.stringify(pack)).not.toContain('unidade');
    const exchanged = readDetailPackage(JSON.stringify(pack)).project;
    expect(exchanged.sealPropertyDefinitions).toBeUndefined();
    // Global registry is protected during isolated detail editing.
    expect(() =>
      assertDetailEdit(
        edited,
        {
          ...edited,
          sealPropertyValues: [{ property: 'unidade', value: 'x' }],
        },
        edited.hierarchy.details[0].id,
      ),
    ).toThrow(/edição isolada/);
  });

  it('prévia, PDF e DXF da folha mostram o mesmo valor e nada físico muda', () => {
    const base = fixture().project;
    const t = base.sheets[0].paperTemplate!;
    const wide = {
      ...t,
      fields: [
        { ...t.fields[0], box: { x: 30, y: 20, width: 80, height: 60 } },
      ],
    };
    const saved = saveSheetTemplate(base, wide);
    const applied = applySheetTemplate(
      saved,
      wide.id,
      saved.sheets.map((s) => s.id),
    );
    const p = applySealBatch(withUnit(applied), {
      sheetIds: [applied.sheets[0].id],
      sheetPropertyValues: [{ property: 'unidade', value: 'Ação' }],
    });
    const sheetId = p.sheets[0].id;
    const page = composeSheet(p, sheetId);
    expect(page.issues).toEqual([]);
    expect(page.sealFields?.[0].text).toBe('Unid.: Ação.');
    expect(toSheetDxf(p, [sheetId])).toContain('Unid.: A');
    expect(Buffer.from(toSheetPdf(p, [sheetId])).toString('latin1')).toContain(
      'Unid.: A',
    );
    expect(toSheetDxf(p, [sheetId])).not.toContain('unidade');
    expect(schedule(p)).toEqual(schedule(base));
    expect(toCsv(p)).toEqual(toCsv(base));
    // Long text is diagnosed, not cut or shrunk.
    const long = applySealBatch(p, {
      sheetIds: [sheetId],
      sheetPropertyValues: [{ property: 'unidade', value: 'x'.repeat(280) }],
    });
    const overflow = composeSheet(long, sheetId);
    expect(overflow.issues.map((i) => i.code)).toContain('seal-field-overflow');
    expect(overflow.sealFields?.[0]).toMatchObject({ invalid: true });
    expect(() => toSheetPdf(long, [sheetId])).toThrow();
  });
});
