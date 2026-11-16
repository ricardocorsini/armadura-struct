import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { emptyProject } from '../../src/domain/model';
import { createSheet, updateSheet } from '../../src/domain/sheets';
import {
  encodeSheetTemplate,
  templateFromSheet,
  type SheetTemplate,
} from '../../src/domain/sheetTemplates';
import type { Project } from '../../src/domain/types';

/** Fictitious office model, written as a template file. */
function officeModel(revision = 1, extraLine = false): SheetTemplate {
  const base = templateFromSheet(emptyProject().sheets[0]);
  return {
    ...base,
    id: 'modelo-escritorio-ficticio',
    name: 'Selo fictício do escritório',
    revision,
    geometry: [
      {
        layer: 'SELO',
        points: [
          { x: 10, y: 10 },
          { x: 200, y: 10 },
        ],
      },
      ...(extraLine
        ? [
            {
              layer: 'SELO',
              points: [
                { x: 10, y: 30 },
                { x: 200, y: 30 },
              ],
            },
          ]
        : []),
    ],
    fields: [
      {
        id: 'campo-titulo',
        label: 'Título',
        box: { x: 20, y: 40, width: 150, height: 15 },
        origin: { x: 25, y: 47 },
        text: '',
        font: 'helvetica',
        height: 3,
        align: 'left',
        rotation: 0,
        sealBinding: { field: '@PRANCHA' },
      },
    ],
  };
}

const fileOf = (template: SheetTemplate) => ({
  name: 'selo-escritorio.json',
  mimeType: 'application/json',
  buffer: Buffer.from(encodeSheetTemplate(template)),
});

function threeSheets(): Project {
  const p = emptyProject();
  const b = createSheet(p, 'Cortes');
  const c = createSheet(b.project, 'Detalhes');
  return updateSheet(c.project, c.id, {
    properties: { revision: 'R3', notes: 'Nota local' },
  });
}

async function open(page: Page, project: Project) {
  await page.goto('/');
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await page.getByTestId('project-input').setInputFiles({
    name: 'origens.armstruct.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole('tab', { name: 'Pranchas', exact: true }).click();
  await page
    .getByRole('button', { name: 'Abrir Folha 1', exact: true })
    .click();
}

async function openTemplates(page: Page) {
  await page
    .getByRole('button', { name: 'Modelos de margem e selo', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Modelos de margem e selo' });
}

async function choose(
  page: Page,
  button: Locator,
  file: ReturnType<typeof fileOf>,
) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(file);
}

async function saveProject(page: Page): Promise<Project> {
  const download = page.waitForEvent('download');
  await page
    .locator('.quick-tools')
    .getByRole('button', { name: 'Salvar projeto', exact: true })
    .click();
  const saved = await (await download).path();
  if (!saved) throw new Error('O navegador não informou o arquivo salvo.');
  return JSON.parse(await readFile(saved, 'utf8'));
}

test('vincula, atualiza só as folhas escolhidas, desfaz/refaz e desvincula preservando a aparência', async ({
  page,
}) => {
  await open(page, threeSheets());
  const before = await saveProject(page);
  let dialog = await openTemplates(page);

  // Cancel at the preview changes nothing.
  await choose(
    page,
    dialog.getByRole('button', {
      name: 'Vincular modelo do escritório (.json)',
    }),
    fileOf(officeModel()),
  );
  let preview = dialog.getByRole('region', { name: 'Prévia do vínculo' });
  await expect(preview).toContainText('Selo fictício do escritório');
  await preview.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(await saveProject(page)).toEqual(before);

  dialog = await openTemplates(page);
  await choose(
    page,
    dialog.getByRole('button', {
      name: 'Vincular modelo do escritório (.json)',
    }),
    fileOf(officeModel()),
  );
  preview = dialog.getByRole('region', { name: 'Prévia do vínculo' });
  for (const name of ['Cortes', 'Detalhes'])
    await preview.getByRole('checkbox', { name, exact: true }).check();
  const confirm = preview.getByRole('button', { name: 'Confirmar vínculo' });
  await confirm.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(dialog.getByRole('status').first()).toContainText('Atualizado');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const linked = await saveProject(page);
  expect(linked.schema).toBe('armadurastruct/42');
  expect(linked.sheetTemplates).toHaveLength(1);
  expect(linked.sheetTemplateSources).toHaveLength(1);
  const linkId = linked.sheetTemplateSources![0].id;
  for (const sheet of linked.sheets)
    expect(sheet.paperTemplate?.sourceLink?.id).toBe(linkId);
  expect(linked.sheets[2].properties).toEqual({
    revision: 'R3',
    notes: 'Nota local',
  });
  await expect(
    page.getByText(/Modelo vinculado: Selo fictício do escritório/),
  ).toContainText('Atualizado');

  // A new revision with the same name: detected only by content.
  dialog = await openTemplates(page);
  await choose(
    page,
    dialog.getByRole('button', { name: 'Localizar novamente' }),
    fileOf(officeModel(2, true)),
  );
  preview = dialog.getByRole('region', { name: 'Prévia da atualização' });
  await expect(
    preview.getByRole('list', { name: 'Mudanças propostas' }),
  ).toContainText('Geometria, estilos e textos do desenho · mudou no modelo');
  await preview
    .getByRole('checkbox', { name: 'Detalhes', exact: true })
    .uncheck();
  await preview
    .getByRole('button', { name: 'Atualizar folhas selecionadas' })
    .click();
  await expect(
    dialog.getByRole('list', { name: 'Folhas vinculadas' }),
  ).toContainText('Detalhes · rev. 1 · Atualização disponível');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const updated = await saveProject(page);
  expect(updated.sheets[0].paperTemplate?.geometry).toHaveLength(2);
  expect(updated.sheets[1].paperTemplate?.geometry).toHaveLength(2);
  expect(updated.sheets[2].paperTemplate).toEqual(
    linked.sheets[2].paperTemplate,
  );
  expect(updated.sheets.map((s) => s.name)).toEqual(
    linked.sheets.map((s) => s.name),
  );

  // One undo restores everything; redo reapplies from embedded data.
  await page
    .locator('.quick-tools')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .click();
  expect(await saveProject(page)).toEqual(linked);
  await page
    .locator('.quick-tools')
    .getByRole('button', { name: 'Refazer', exact: true })
    .click();
  expect(await saveProject(page)).toEqual(updated);

  // Unlink everything: same appearance, no external dependency.
  dialog = await openTemplates(page);
  await dialog
    .getByRole('button', { name: 'Desvincular', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Confirmar desvinculação' }).click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const unlinked = await saveProject(page);
  expect(unlinked.sheetTemplateSources).toBeUndefined();
  for (const [index, sheet] of unlinked.sheets.entries()) {
    expect(sheet.paperTemplate?.sourceLink).toBeUndefined();
    const { sourceLink: _link, ...rest } = updated.sheets[index].paperTemplate!;
    expect(sheet.paperTemplate).toEqual(rest);
  }
});

test('ao reabrir, mostra “Ainda não verificado” sem usar o caminho salvo e recusa arquivo inválido', async ({
  page,
}) => {
  await open(page, threeSheets());
  let dialog = await openTemplates(page);
  await choose(
    page,
    dialog.getByRole('button', {
      name: 'Vincular modelo do escritório (.json)',
    }),
    fileOf(officeModel()),
  );
  await dialog
    .getByRole('region', { name: 'Prévia do vínculo' })
    .getByRole('button', { name: 'Confirmar vínculo' })
    .click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const linked = await saveProject(page);

  // Another session: the embedded copy renders; access is not assumed.
  await page.reload();
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await page.getByTestId('project-input').setInputFiles({
    name: 'origens.armstruct.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(linked)),
  });
  await page.getByRole('tab', { name: 'Pranchas', exact: true }).click();
  await page
    .getByRole('button', { name: 'Abrir Folha 1', exact: true })
    .click();
  await expect(
    page.getByText(/Modelo vinculado: Selo fictício do escritório/),
  ).toContainText('Ainda não verificado');
  dialog = await openTemplates(page);
  await expect(
    dialog.getByRole('button', { name: 'Verificar', exact: true }),
  ).toBeDisabled();
  await choose(
    page,
    dialog.getByRole('button', { name: 'Localizar novamente' }),
    {
      name: 'selo-escritorio.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{corrompido'),
    },
  );
  await expect(dialog.getByRole('alert').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(await saveProject(page)).toEqual(linked);
});
