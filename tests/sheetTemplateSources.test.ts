import { afterEach, describe, expect, it } from 'vitest';
import { decodeProject, emptyProject, schedule } from '../src/domain/model';
import { composeSheet } from '../src/domain/paper';
import { createSheet, duplicateSheet, updateSheet } from '../src/domain/sheets';
import {
  decodeSheetTemplateFile,
  duplicateSheetTemplate,
  encodeSheetTemplate,
  templateFromSheet,
  type SheetTemplate,
} from '../src/domain/sheetTemplates';
import { applySealBatch } from '../src/domain/sealProject';
import type { SealPropertyDefinition } from '../src/domain/sealProperties';
import {
  applyTemplateLink,
  applyTemplateUpdate,
  pendingTemplateUpdateDecisions,
  planTemplateLink,
  planTemplateUpdate,
  relocateTemplateSource,
  sourceState,
  templateContentHash,
  templateSource,
  unlinkTemplateSource,
  type TemplateSourceFile,
  type TemplateUpdatePlan,
} from '../src/domain/sheetTemplateSources';
import {
  checkSource,
  grantSourceAccess,
  readTemplateSourceFile,
  resetSourceAccess,
  sourceCheck,
} from '../src/lib/templateSourceAccess';
import { toCsv, toSheetDxf, toSheetPdf } from '../src/lib/exports';
import { TEMPLATE_SOURCE_PROJECT_SCHEMA } from '../src/domain/sealFieldSchema';
import { assertDetailEdit } from '../src/domain/detailEditing';
import type { Project } from '../src/domain/types';

const fase: SealPropertyDefinition = {
  id: 'fase',
  name: 'Fase',
  type: 'text',
  scope: 'project-sheet',
  default: 'Executivo',
};

/** Office model (fictitious) as it would be written to a file. */
function officeModel(): SheetTemplate {
  const base = templateFromSheet(emptyProject().sheets[0]);
  return {
    ...base,
    id: 'modelo-escritorio',
    name: 'Selo do escritório',
    revision: 4,
    geometry: [
      {
        layer: 'SELO',
        points: [
          { x: 10, y: 10 },
          { x: 200, y: 10 },
        ],
      },
    ],
    fields: [
      {
        id: 'campo-titulo',
        label: 'Título',
        box: { x: 20, y: 20, width: 150, height: 15 },
        origin: { x: 25, y: 27 },
        text: '',
        font: 'helvetica',
        height: 3,
        align: 'left',
        rotation: 0,
        sealBinding: { field: '@PRANCHA' },
      },
      {
        id: 'campo-fase',
        label: 'Fase',
        box: { x: 20, y: 40, width: 150, height: 15 },
        origin: { x: 25, y: 47 },
        text: '',
        font: 'helvetica',
        height: 3,
        align: 'left',
        rotation: 0,
        sealBinding: { property: 'fase', prefix: 'Fase: ' },
      },
      {
        id: 'campo-obs',
        label: 'Observação',
        box: { x: 20, y: 60, width: 150, height: 15 },
        origin: { x: 25, y: 67 },
        text: 'Medidas em cm',
        font: 'helvetica',
        height: 3,
        align: 'left',
        rotation: 0,
      },
    ],
  };
}

async function fileOf(
  template: SheetTemplate,
  properties: SealPropertyDefinition[] = [fase],
): Promise<TemplateSourceFile> {
  const raw = encodeSheetTemplate(template, {
    sealPropertyDefinitions: properties,
  });
  const decoded = decodeSheetTemplateFile(raw);
  return {
    ...decoded,
    contentHash: await templateContentHash(
      decoded.template,
      decoded.properties,
    ),
  };
}

let ids = 0;
const newId = () => 'id-' + ++ids;

/** Three sheets with distinct titles, revisions and values. */
function threeSheets() {
  let p = emptyProject();
  const b = createSheet(p, 'Cortes');
  const c = createSheet(b.project, 'Detalhes');
  p = updateSheet(c.project, c.id, {
    properties: { revision: 'R3', notes: 'Nota C' },
  });
  return p;
}

async function linked() {
  const p = threeSheets();
  const file = await fileOf(officeModel());
  const plan = planTemplateLink(p, file, 'selo-escritorio.json');
  const next = applyTemplateLink(p, plan, {
    sheetIds: p.sheets.map((s) => s.id),
    decisions: new Map(plan.properties.map((i) => [i.external.id, i.proposal])),
    newId,
  });
  // Local data that must survive updates.
  const withValues = applySealBatch(next, {
    sheetIds: [next.sheets[1].id],
    sheetPropertyValues: [{ property: 'fase', value: 'Básico' }],
  });
  const withManual = applySealBatch(withValues, {
    sheetIds: [withValues.sheets[2].id],
    template: withValues.sheets[2].paperTemplate,
    fields: [{ fieldId: 'campo-titulo', manualText: 'Título manual' }],
  });
  return {
    project: withManual,
    file,
    linkId: withManual.sheetTemplateSources![0].id,
  };
}

const texts = (p: Project, index: number) =>
  composeSheet(p, p.sheets[index].id).sealFields?.map((f) => f.text);

function choose(
  plan: TemplateUpdatePlan,
  sheetIds: string[],
  conflicts: [string, 'local' | 'model'][] = [],
  removed: [string, 'keep' | 'remove'][] = [],
) {
  return {
    sheetIds,
    conflicts: new Map(conflicts),
    removed: new Map(removed),
    decisions: new Map(plan.properties.map((i) => [i.external.id, i.proposal])),
    newId,
  };
}

afterEach(() => resetSourceAccess());

describe('Vínculo, identidade e cópia incorporada', () => {
  it('vincula a revisão a três folhas sem alterar seus dados e salva em 42', async () => {
    const { project, file, linkId } = await linked();
    expect(project.schema).toBe(TEMPLATE_SOURCE_PROJECT_SCHEMA);
    const source = templateSource(project, linkId)!;
    expect(source).toMatchObject({
      templateId: 'modelo-escritorio',
      revision: 4,
      format: 'armadurastruct.sheet-template/3',
      contentHash: file.contentHash,
      hint: 'selo-escritorio.json',
    });
    for (const sheet of project.sheets)
      expect(sheet.paperTemplate?.sourceLink).toEqual({
        id: linkId,
        contentHash: file.contentHash,
        revision: 4,
      });
    expect(texts(project, 0)).toEqual(['Folha 1', 'Fase: Executivo']);
    expect(texts(project, 1)).toEqual(['Cortes', 'Fase: Básico']);
    expect(texts(project, 2)).toEqual(['Título manual', 'Fase: Executivo']);
    expect(project.sheets[2].properties).toEqual({
      revision: 'R3',
      notes: 'Nota C',
    });
    expect(decodeProject(JSON.stringify(project))).toEqual(project);
    // The exported model never carries the local link.
    expect(
      encodeSheetTemplate(project.sheetTemplates![0], project),
    ).not.toContain('sourceLink');
  });

  it('o hash detecta conteúdo, não nome, revisão ou identidade do arquivo', async () => {
    const a = await fileOf(officeModel());
    const renamed = await fileOf({ ...officeModel(), revision: 9 });
    expect(renamed.contentHash).toBe(a.contentHash);
    const moved = await fileOf({
      ...officeModel(),
      fields: officeModel().fields.map((f, i) =>
        i === 2 ? { ...f, text: 'Medidas em mm' } : f,
      ),
    });
    expect(moved.contentHash).not.toBe(a.contentHash);
    const style = await fileOf(officeModel(), [{ ...fase, default: 'Básico' }]);
    expect(style.contentHash).not.toBe(a.contentHash);
  });

  it('recusa dados de vínculo em formato antigo e referências quebradas', async () => {
    const { project } = await linked();
    expect(() =>
      decodeProject(
        JSON.stringify({ ...project, schema: 'armadurastruct/41' }),
      ),
    ).toThrow(/formato 42/);
    expect(() =>
      decodeProject(JSON.stringify({ ...project, sheetTemplateSources: [] })),
    ).toThrow(/origem externa inexistente/);
  });
});

describe('Situação do vínculo', () => {
  it('distingue não verificado, atualizado, atualização disponível, indisponível e inválido', async () => {
    const { project, file, linkId } = await linked();
    const source = templateSource(project, linkId)!;
    const applied = project.sheets[0].paperTemplate!.sourceLink!;
    expect(sourceState(source, applied, undefined)).toBe('unchecked');
    // Without a file picked in this session, nothing is read from the hint.
    const none = await checkSource(linkId);
    expect(none.check).toMatchObject({ state: 'unavailable' });

    const raw = encodeSheetTemplate(officeModel(), {
      sealPropertyDefinitions: [fase],
    });
    grantSourceAccess(linkId, new File([raw], 'selo-escritorio.json'));
    const current = await checkSource(linkId);
    expect(sourceState(source, applied, current.check)).toBe('current');
    expect(current.file?.contentHash).toBe(file.contentHash);

    const changed = encodeSheetTemplate(
      { ...officeModel(), geometry: [] },
      { sealPropertyDefinitions: [fase] },
    );
    grantSourceAccess(linkId, new File([changed], 'selo-escritorio.json'));
    const update = await checkSource(linkId);
    expect(sourceState(source, applied, update.check)).toBe('update');

    grantSourceAccess(
      linkId,
      new File(['{corrompido'], 'selo-escritorio.json'),
    );
    const invalid = await checkSource(linkId);
    expect(sourceState(source, applied, invalid.check)).toBe('invalid');
    // Checking never changes the project.
    expect(templateSource(project, linkId)).toBe(source);
  });

  it('uma resposta atrasada não sobrescreve a verificação mais recente', async () => {
    const { linkId } = await linked();
    const raw = encodeSheetTemplate(officeModel(), {
      sealPropertyDefinitions: [fase],
    });
    let release!: () => void;
    const slow = new File([raw], 'a.json');
    const gate = new Promise<void>((resolve) => (release = resolve));
    const original = slow.arrayBuffer.bind(slow);
    slow.arrayBuffer = async () => {
      await gate;
      return original();
    };
    grantSourceAccess(linkId, slow);
    const first = checkSource(linkId);
    grantSourceAccess(linkId, new File(['{x'], 'b.json'));
    await checkSource(linkId);
    release();
    await first;
    expect(sourceCheck(linkId).state).toBe('invalid');
  });

  it('limita o tempo de leitura', async () => {
    const never = new File(['x'], 'lento.json');
    never.text = () => new Promise<string>(() => {});
    await expect(readTemplateSourceFile(never, undefined, 20)).rejects.toThrow(
      /tempo limite/,
    );
  });
});

describe('Prévia e atualização das folhas', () => {
  async function newRevision(change: (t: SheetTemplate) => SheetTemplate) {
    const t = change(structuredClone(officeModel()));
    return fileOf({ ...t, revision: 5 });
  }

  it('atualiza geometria/estilo em duas folhas; a terceira fica na revisão anterior', async () => {
    const { project, linkId, file } = await linked();
    const incoming = await newRevision((t) => ({
      ...t,
      geometry: [
        ...t.geometry,
        {
          layer: 'SELO',
          points: [
            { x: 10, y: 30 },
            { x: 200, y: 30 },
          ],
        },
      ],
      fields: t.fields.map((f) =>
        f.id === 'campo-obs' ? { ...f, height: 3.5 } : f,
      ),
    }));
    const plan = planTemplateUpdate(project, linkId, incoming);
    expect(plan.identityChange).toBe(false);
    expect(plan.changes.map((c) => [c.key, c.origin])).toEqual([
      ['geometry', 'model'],
      ['field:campo-obs:height', 'model'],
    ]);
    const two = project.sheets.slice(0, 2).map((s) => s.id);
    const updated = applyTemplateUpdate(project, plan, choose(plan, two));
    expect(updated.sheets[0].paperTemplate?.geometry).toHaveLength(2);
    expect(updated.sheets[1].paperTemplate?.sourceLink?.contentHash).toBe(
      incoming.contentHash,
    );
    expect(updated.sheets[2].paperTemplate).toEqual(
      project.sheets[2].paperTemplate,
    );
    expect(updated.sheets[2].paperTemplate?.sourceLink?.contentHash).toBe(
      file.contentHash,
    );
    // Sheet data preserved.
    expect(texts(updated, 1)).toEqual(['Cortes', 'Fase: Básico']);
    expect(texts(updated, 2)).toEqual(['Título manual', 'Fase: Executivo']);
    for (const [i, sheet] of updated.sheets.entries()) {
      expect(sheet.name).toBe(project.sheets[i].name);
      expect(sheet.properties).toEqual(project.sheets[i].properties);
      expect(sheet.sealBindings).toEqual(project.sheets[i].sealBindings);
      expect(sheet.sealPropertyValues).toEqual(
        project.sheets[i].sealPropertyValues,
      );
      expect(sheet.id).toBe(project.sheets[i].id);
    }
    expect(updated.hierarchy.placements).toEqual(project.hierarchy.placements);
    // Survives save/reopen; each application reports its own revision.
    const reopened = decodeProject(JSON.stringify(updated));
    expect(reopened).toEqual(updated);
    const check = {
      state: 'read' as const,
      checkedAt: 0,
      contentHash: incoming.contentHash,
      templateId: 'modelo-escritorio',
      revision: 5,
    };
    const source = templateSource(reopened, linkId)!;
    expect(
      reopened.sheets.map((s) =>
        sourceState(source, s.paperTemplate!.sourceLink!, check),
      ),
    ).toEqual(['current', 'current', 'update']);
    // The project registry itself is unchanged for documentary data.
    expect(updated.sealProperties).toEqual(project.sealProperties);
    expect(schedule(updated)).toEqual(schedule(project));
    expect(toCsv(updated)).toEqual(toCsv(project));
  });

  it('campo renomeado conserva o vínculo pelo ID; removido exige decisão sem apagar dados', async () => {
    const { project, linkId } = await linked();
    const incoming = await newRevision((t) => ({
      ...t,
      fields: t.fields
        .filter((f) => f.id !== 'campo-titulo')
        .map((f) => (f.id === 'campo-fase' ? { ...f, label: 'Etapa' } : f)),
    }));
    const plan = planTemplateUpdate(project, linkId, incoming);
    expect(plan.changes).toContainEqual(
      expect.objectContaining({
        key: 'field:campo-fase:label',
        origin: 'model',
      }),
    );
    expect(plan.removed).toEqual([
      { fieldId: 'campo-titulo', label: 'Título', sheetData: ['Detalhes'] },
    ]);
    const all = project.sheets.map((s) => s.id);
    expect(pendingTemplateUpdateDecisions(plan, choose(plan, all))).toEqual([
      'Campo “Título” removido no modelo',
    ]);
    expect(() => applyTemplateUpdate(project, plan, choose(plan, all))).toThrow(
      /Resolva os conflitos/,
    );
    const kept = applyTemplateUpdate(
      project,
      plan,
      choose(plan, all, [], [['campo-titulo', 'keep']]),
    );
    expect(texts(kept, 2)).toEqual(['Título manual', 'Fase: Executivo']);
    expect(kept.sheets[2].sealBindings).toEqual(project.sheets[2].sealBindings);
    expect(
      kept.sheets[0].paperTemplate!.fields.find((f) => f.id === 'campo-fase')!
        .label,
    ).toBe('Etapa');
    const removed = applyTemplateUpdate(
      project,
      plan,
      choose(plan, all, [], [['campo-titulo', 'remove']]),
    );
    expect(removed.sheets[2].paperTemplate!.fields.map((f) => f.id)).toEqual([
      'campo-fase',
      'campo-obs',
    ]);
    expect(removed.sheets[2].sealBindings).toBeUndefined();
    expect(decodeProject(JSON.stringify(removed))).toEqual(removed);
  });

  it('mudança local e do modelo no mesmo atributo exige escolha visível', async () => {
    const { project, linkId } = await linked();
    // Local adjustment in the library, then applied to the sheets.
    const libraryTemplate = project.sheetTemplates![0];
    const { saveSheetTemplate, applySheetTemplate } = await import(
      '../src/domain/sheetTemplates'
    );
    const local = applySheetTemplate(
      saveSheetTemplate(project, {
        ...libraryTemplate,
        fields: libraryTemplate.fields.map((f) =>
          f.id === 'campo-obs' ? { ...f, text: 'Unidades em cm' } : f,
        ),
      }),
      libraryTemplate.id,
      project.sheets.map((s) => s.id),
    );
    const incoming = await newRevision((t) => ({
      ...t,
      fields: t.fields.map((f) =>
        f.id === 'campo-obs' ? { ...f, text: 'Medidas em mm', height: 2.8 } : f,
      ),
    }));
    const plan = planTemplateUpdate(local, linkId, incoming);
    expect(plan.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'field:campo-obs:text',
          origin: 'conflict',
        }),
        expect.objectContaining({
          key: 'field:campo-obs:height',
          origin: 'model',
        }),
      ]),
    );
    const all = local.sheets.map((s) => s.id);
    const keepLocal = applyTemplateUpdate(
      local,
      plan,
      choose(plan, all, [['field:campo-obs:text', 'local']]),
    );
    const obs = keepLocal.sheets[0].paperTemplate!.fields.find(
      (f) => f.id === 'campo-obs',
    )!;
    expect(obs).toMatchObject({ text: 'Unidades em cm', height: 2.8 });
    const takeModel = applyTemplateUpdate(
      local,
      plan,
      choose(plan, all, [['field:campo-obs:text', 'model']]),
    );
    expect(
      takeModel.sheets[0].paperTemplate!.fields.find(
        (f) => f.id === 'campo-obs',
      )!.text,
    ).toBe('Medidas em mm');
  });

  it('tipo incompatível ou homônimo vira conflito de propriedade sem perder valores', async () => {
    const { project, linkId } = await linked();
    const incoming = await fileOf({ ...officeModel(), revision: 5 }, [
      { ...fase, type: 'number', default: 1 },
    ]);
    const plan = planTemplateUpdate(project, linkId, incoming);
    expect(plan.properties[0]).toMatchObject({ status: 'conflict' });
    expect(plan.properties[0].proposal.kind).toBe('create');
    const all = project.sheets.map((s) => s.id);
    const next = applyTemplateUpdate(project, plan, choose(plan, all));
    const created = next.sealPropertyDefinitions!.find(
      (d) => d.type === 'number',
    )!;
    expect(created.id).not.toBe('fase');
    expect(next.sheets[1].sealPropertyValues).toEqual([
      { property: 'fase', value: 'Básico' },
    ]);
    expect(
      next.sealPropertyDefinitions!.find((d) => d.id === 'fase'),
    ).toMatchObject({ type: 'text' });
  });

  it('um plano obsoleto não é aplicado; nada é parcial', async () => {
    const { project, linkId } = await linked();
    const incoming = await newRevision((t) => ({ ...t, geometry: [] }));
    const plan = planTemplateUpdate(project, linkId, incoming);
    const changed = updateSheet(project, project.sheets[0].id, {
      properties: { revision: 'R9', notes: '' },
    });
    expect(() =>
      applyTemplateUpdate(changed, plan, choose(plan, [project.sheets[0].id])),
    ).toThrow(/mudou/);
    expect(() =>
      applyTemplateUpdate(project, plan, choose(plan, ['inexistente'])),
    ).toThrow(/não usa/);
  });

  it('papel menor gera diagnósticos sem mover vistas nem mudar escalas', async () => {
    const { project, linkId } = await linked();
    const incoming = await newRevision((t) => ({
      ...t,
      useful: { x: 10, y: 10, width: 100, height: 100 },
    }));
    const plan = planTemplateUpdate(project, linkId, incoming);
    const next = applyTemplateUpdate(
      project,
      plan,
      choose(plan, [project.sheets[0].id]),
    );
    expect(next.hierarchy.placements).toEqual(project.hierarchy.placements);
    expect(next.sheets[0].paperTemplate?.useful).toEqual({
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    });
  });
});

describe('Localizar novamente, desvincular e portabilidade', () => {
  it('localizar a mesma revisão só restaura a associação; outro modelo exige comparação', async () => {
    const { project, linkId, file } = await linked();
    const same = relocateTemplateSource(project, linkId, file, 'movido.json');
    expect(same.kind).toBe('same');
    if (same.kind !== 'same') throw Error();
    expect(templateSource(same.project, linkId)?.hint).toBe('movido.json');
    expect(same.project.sheets).toBe(project.sheets);
    const other = await fileOf({ ...officeModel(), id: 'outro-modelo' });
    const different = relocateTemplateSource(project, linkId, other);
    expect(different.kind).toBe('different');
    if (different.kind !== 'different') throw Error();
    expect(different.plan.identityChange).toBe(true);
  });

  it('desvincular folhas escolhidas preserva aparência e mantém as demais vinculadas', async () => {
    const { project, linkId } = await linked();
    const before = project.sheets.map(
      (s) => composeSheet(project, s.id).decorations,
    );
    const next = unlinkTemplateSource(project, linkId, {
      sheetIds: [project.sheets[0].id],
      library: false,
    });
    expect(next.sheets[0].paperTemplate?.sourceLink).toBeUndefined();
    expect(next.sheets[1].paperTemplate?.sourceLink?.id).toBe(linkId);
    expect(composeSheet(next, next.sheets[0].id).decorations).toEqual(
      before[0],
    );
    const all = unlinkTemplateSource(next, linkId, {
      sheetIds: next.sheets.map((s) => s.id),
      library: true,
    });
    expect(all.sheetTemplateSources).toBeUndefined();
    expect(all.sheets.map((s) => composeSheet(all, s.id).decorations)).toEqual(
      before,
    );
    const reopened = decodeProject(JSON.stringify(all));
    expect(
      toSheetPdf(reopened, [reopened.sheets[0].id]).length,
    ).toBeGreaterThan(0);
    expect(toSheetDxf(reopened, [reopened.sheets[1].id])).toContain('Cortes');
  });

  it('duplicação, isolamento e exportações usam a cópia incorporada, offline', async () => {
    const { project, linkId } = await linked();
    const copy = duplicateSheet(project, project.sheets[1].id);
    const sheet = copy.project.sheets.find((s) => s.id === copy.id)!;
    expect(sheet.paperTemplate?.sourceLink?.id).toBe(linkId);
    expect(sheet.paperTemplate).not.toBe(project.sheets[1].paperTemplate);
    expect(decodeProject(JSON.stringify(copy.project))).toEqual(copy.project);
    // No access in this session: render and export still work.
    const pdf = Buffer.from(
      toSheetPdf(project, [project.sheets[1].id]),
    ).toString('latin1');
    expect(pdf).toContain('Fase: B');
    expect(toSheetDxf(project, [project.sheets[1].id])).toContain('Fase: B');
    expect(() =>
      assertDetailEdit(
        project,
        { ...project, sheetTemplateSources: undefined },
        project.hierarchy.details[0].id,
      ),
    ).toThrow(/edição isolada/);
    // A duplicated library template is independent from the source.
    expect(
      duplicateSheetTemplate(project.sheetTemplates![0], 'Cópia').sourceLink,
    ).toBe(undefined);
  });
});
