import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { emptyProject } from '../../src/domain/model';
import { applySealBatch } from '../../src/domain/sealProject';
import { createSheet } from '../../src/domain/sheets';
import {
  applySheetTemplate,
  encodeSheetTemplate,
  saveSheetTemplate,
  templateFromSheet,
  type SheetTemplate,
} from '../../src/domain/sheetTemplates';
import type { Project } from '../../src/domain/types';

/** Two sheets with a template whose literal text box can hold a value. */
function sample() {
  const base = { ...emptyProject(), name: 'Projeto fictício de reservatório' };
  const second = createSheet(base, 'Cortes');
  const template: SheetTemplate = {
    ...templateFromSheet(base.sheets[0]),
    name: 'Selo fictício',
    fields: [
      {
        id: 'unidade',
        label: 'Unidade do selo',
        box: { x: 20, y: 20, width: 130, height: 15 },
        origin: { x: 25, y: 27 },
        text: '@UNIDADE',
        font: 'helvetica',
        height: 3,
        align: 'left',
        rotation: 0,
      },
    ],
  };
  return applySheetTemplate(
    saveSheetTemplate(second.project, template),
    template.id,
    second.project.sheets.map(({ id }) => id),
  );
}

async function loadProject(page: Page, project: Project) {
  await page.getByTestId('project-input').setInputFiles({
    name: 'propriedades.armstruct.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await page.getByRole('tab', { name: 'Pranchas', exact: true }).click();
  await page
    .getByRole('button', { name: 'Abrir Folha 1', exact: true })
    .click();
}

async function open(page: Page, project: Project) {
  await page.goto('/');
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
  await loadProject(page, project);
}

async function openDraft(page: Page) {
  await page
    .getByRole('button', { name: 'Dados do selo', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Dados do selo', exact: true });
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

test('cria “Unidade”, converte o texto em campo com prefixo, aplica com desfazer único e volta a texto', async ({
  page,
}) => {
  await open(page, sample());
  const before = await saveProject(page);

  // Cancel does not change anything.
  let dialog = await openDraft(page);
  await dialog
    .getByRole('button', { name: 'Nova propriedade', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await saveProject(page)).toEqual(before);

  dialog = await openDraft(page);
  await dialog.getByRole('checkbox', { name: 'Cortes', exact: true }).check();
  await dialog
    .getByRole('button', { name: 'Nova propriedade', exact: true })
    .click();
  await dialog
    .getByLabel('Nome da propriedade', { exact: true })
    .fill('Unidade');
  await dialog
    .getByRole('checkbox', { name: 'Valor padrão de Unidade', exact: true })
    .check();
  await dialog.getByLabel('Padrão de Unidade', { exact: true }).fill('cm');
  const binding = dialog.getByRole('combobox', {
    name: 'Vínculo de Unidade do selo',
    exact: true,
  });
  // Natives and custom properties are distinguished in the selector.
  await expect(
    binding.locator('optgroup[label="Propriedades personalizadas"] option'),
  ).toHaveText(['Unidade · Texto']);
  await binding.selectOption({ label: 'Unidade · Texto' });
  await dialog
    .getByLabel('Prefixo de Unidade do selo', { exact: true })
    .fill('Unid.: ');
  await dialog
    .getByRole('button', { name: 'Conferir prévia', exact: true })
    .click();
  const preview = (name: string) =>
    dialog.getByRole('img', { name: 'Prévia do selo em ' + name, exact: true });
  for (const name of ['Folha 1', 'Cortes'])
    await expect(
      preview(name).getByText('Unid.: cm', { exact: true }),
    ).toBeVisible();
  await expect(
    dialog.getByRole('list', { name: 'Origem dos campos' }).first(),
  ).toContainText('padrão da definição');

  // Repeated clicks record a single history step.
  const apply = dialog.getByRole('button', {
    name: 'Aplicar dados do selo',
    exact: true,
  });
  await apply.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(dialog).toBeHidden();
  const applied = await saveProject(page);
  expect(applied.schema).toBe('armadurastruct/41');
  expect(applied.sealPropertyDefinitions).toEqual([
    expect.objectContaining({ name: 'Unidade', type: 'text', default: 'cm' }),
  ]);
  const propertyId = applied.sealPropertyDefinitions![0].id;
  for (const sheet of applied.sheets)
    expect(sheet.paperTemplate?.fields[0]).toMatchObject({
      origin: { x: 25, y: 27 },
      height: 3,
      sealBinding: { property: propertyId, prefix: 'Unid.: ' },
    });
  await page
    .locator('.quick-tools')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .click();
  expect(await saveProject(page)).toEqual(before);
  await page
    .locator('.quick-tools')
    .getByRole('button', { name: 'Refazer', exact: true })
    .click();
  expect(await saveProject(page)).toEqual(applied);

  // A local value on Folha 1 only; Cortes keeps the default.
  dialog = await openDraft(page);
  await dialog
    .getByRole('combobox', {
      name: 'Valor nas folhas selecionadas para Unidade',
      exact: true,
    })
    .selectOption('value');
  await dialog.getByLabel('Valor local de Unidade', { exact: true }).fill('m');
  await dialog.getByRole('checkbox', { name: 'Cortes', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Cortes', exact: true }).uncheck();
  await dialog
    .getByRole('button', { name: 'Aplicar dados do selo', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const local = await saveProject(page);
  expect(local.sheets[0].sealPropertyValues).toEqual([
    { property: propertyId, value: 'm' },
  ]);
  expect(local.sheets[1].sealPropertyValues).toBeUndefined();

  // "Voltar a texto" shows the content that will be fixed.
  dialog = await openDraft(page);
  await dialog
    .getByRole('button', { name: 'Voltar a texto: Unidade do selo' })
    .click();
  await expect(
    dialog.getByText('Será fixado como texto: “Unid.: m”', { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole('button', {
      name: 'Confirmar volta a texto de Unidade do selo',
    })
    .click();
  await dialog
    .getByRole('button', { name: 'Aplicar dados do selo', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const frozen = await saveProject(page);
  const field = frozen.sheets[0].paperTemplate!.fields[0];
  expect(field.sealBinding).toBeUndefined();
  expect(field.text).toBe('Unid.: m');
  expect(field).toMatchObject({ origin: { x: 25, y: 27 }, height: 3 });
  // The other sheet keeps its incorporated revision and binding.
  expect(frozen.sheets[1].paperTemplate?.fields[0].sealBinding?.property).toBe(
    propertyId,
  );
});

test('importa modelo com propriedade homônima, mostra o mapeamento e não sobrescreve valores locais', async ({
  page,
}) => {
  // Model file from another project: property "Unidade" with another identity.
  const origin = sample();
  const external = applySealBatch(origin, {
    sheetIds: [origin.sheets[0].id],
    template: origin.sheets[0].paperTemplate,
    properties: {
      definitions: [
        {
          id: 'unidade-externa',
          name: 'Unidade',
          type: 'text',
          scope: 'project-sheet',
          default: 'mm',
        },
      ],
    },
    projectPropertyValues: [{ property: 'unidade-externa', value: 'segredo' }],
    fields: [
      {
        fieldId: 'unidade',
        definition: { property: 'unidade-externa' },
      },
    ],
  });
  const file = encodeSheetTemplate(
    { ...external.sheets[0].paperTemplate!, name: 'Selo externo' },
    external,
  );
  expect(file).not.toContain('segredo');

  const local = sample();
  const target = applySealBatch(local, {
    sheetIds: [local.sheets[0].id],
    properties: {
      definitions: [
        {
          id: 'unidade-local',
          name: 'Unidade',
          type: 'text',
          scope: 'project-sheet',
          default: 'cm',
        },
      ],
    },
    projectPropertyValues: [{ property: 'unidade-local', value: 'dm' }],
  });
  await open(page, target);
  const before = await saveProject(page);
  await page
    .getByRole('button', { name: 'Modelos de margem e selo', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Modelos de margem e selo' });
  const choose = () =>
    dialog
      .getByLabel('Arquivo de modelo de margem e selo', { exact: true })
      .setInputFiles({
        name: 'selo-externo.json',
        mimeType: 'application/json',
        buffer: Buffer.from(file),
      });
  await choose();
  const mapping = dialog.getByRole('list', { name: 'Mapeamento proposto' });
  await expect(mapping).toContainText('Nome coincidente');
  const destination = dialog.getByRole('combobox', {
    name: 'Destino de Unidade',
    exact: true,
  });
  await expect(destination).toHaveValue('create');
  await expect(
    dialog.getByLabel('Nome da nova propriedade Unidade', { exact: true }),
  ).toHaveValue('Unidade (2)');

  // Cancel the mapping: nothing changes.
  await dialog
    .getByRole('button', { name: 'Cancelar importação', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(await saveProject(page)).toEqual(before);

  await page
    .getByRole('button', { name: 'Modelos de margem e selo', exact: true })
    .click();
  await choose();
  await destination.selectOption({ label: 'Associar a Unidade' });
  await dialog
    .getByRole('button', { name: 'Confirmar mapeamento', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Salvar modelo', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  const saved = await saveProject(page);
  expect(saved.sealPropertyValues).toEqual(before.sealPropertyValues);
  expect(saved.sealPropertyDefinitions).toEqual([
    {
      ...before.sealPropertyDefinitions![0],
      aliases: ['unidade-externa'],
    },
  ]);
  const imported = saved.sheetTemplates!.find(
    (t) => t.name === 'Selo externo',
  )!;
  expect(imported.fields[0].sealBinding?.property).toBe('unidade-local');

  // Reimporting recognizes the confirmed mapping.
  await page
    .getByRole('button', { name: 'Modelos de margem e selo', exact: true })
    .click();
  await choose();
  await expect(mapping).toContainText('Associação confirmada');
  await expect(destination).toHaveValue('map:unidade-local');
});
