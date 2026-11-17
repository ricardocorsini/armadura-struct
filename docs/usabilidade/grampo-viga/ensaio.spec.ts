import { expect, test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reprodução automatizada do ensaio manual da issue #180 (grampo de viga).
// Gera as capturas desta pasta e registra tempos de máquina. Esses tempos
// medem o aplicativo + roteiro, não o tempo de um detalhista.
const here = dirname(fileURLToPath(import.meta.url));
const shot = (name: string) => join(here, name);
const times: Record<string, number> = {};

async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
}
async function screen(page: Page, x: number, y: number) {
  await settled(page);
  return page.getByTestId('cad-canvas').evaluate(
    (svg, p) => {
      const g = svg.querySelector('g[transform]') as SVGGElement;
      const v = new DOMPoint(p.x, p.y).matrixTransform(g.getScreenCTM()!);
      return { x: v.x, y: v.y };
    },
    { x, y },
  );
}
async function command(page: Page, value: string) {
  const input = page.getByRole('textbox', { name: 'Comando CAD' });
  await input.fill(value);
  await input.press('Enter');
}
async function fit(page: Page) {
  await page
    .getByRole('button', { name: 'Ajustar à tela', exact: true })
    .click();
  await settled(page);
}
async function zoomAt(page: Page, x: number, y: number, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    const p = await screen(page, x, y);
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, -120);
  }
  await settled(page);
}
const panel = (page: Page) =>
  page.getByRole('region', { name: 'Lançamento de grampo de viga' });
const criteria = (page: Page) =>
  page.getByRole('dialog', {
    name: 'Critérios do grampo de viga',
    exact: true,
  });
async function timed<T>(label: string, fn: () => Promise<T>) {
  const t0 = Date.now();
  const r = await fn();
  times[label] = Date.now() - t0;
  return r;
}

test('ensaio #180: grampo de viga na elevação da V1', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.busy-overlay')).toHaveCount(0);

  // Fôrma reproduzível: elevação V1 20x50 entre P1 e P2 + seção.
  await page.getByTestId('mask-input').setInputFiles({
    name: 'forma-viga-v1.dxf',
    mimeType: 'application/dxf',
    buffer: readFileSync(join(here, 'forma-viga-v1.dxf')),
  });
  const batch = page.getByRole('dialog', {
    name: 'Importar máscaras em lote',
    exact: true,
  });
  await batch
    .getByRole('button', { name: 'Ler arquivos', exact: true })
    .click();
  await expect(batch.getByRole('status')).toContainText('1 prontos');
  await batch
    .getByRole('button', { name: 'Aplicar lote', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Resultado das máscaras', exact: true })
    .getByRole('button', { name: 'Fechar', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Armaduras', exact: true }).click();
  await fit(page);

  // Cenário 1 · primeiro uso: faixa de comandos → critérios → ponto → Enter.
  await timed('cenario1_primeiro_uso_ms', async () => {
    await page
      .locator('.ribbon-content')
      .getByRole('button', { name: 'Grampo de viga', exact: true })
      .click();
    const dialog = criteria(page);
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel('Comprimento longitudinal L (mm)', { exact: true })
      .fill('500');
    await dialog
      .getByLabel('Dimensão transversal T (mm)', { exact: true })
      .fill('130');
    await dialog.screenshot({ path: shot('01-criterios-primeiro-uso.png') });
    await dialog
      .getByRole('button', { name: 'Posicionar grampo', exact: true })
      .click();
    await zoomAt(page, 300, 250, 4);
    const p = await screen(page, 50, 40);
    await page.mouse.move(p.x, p.y);
    await page.mouse.move(p.x + 1, p.y + 1);
    await page.screenshot({ path: shot('02-painel-sobre-apoio-p1.png') });
    await command(page, '50,40');
    await expect(panel(page)).toContainText('Confira a prévia');
    await page.screenshot({ path: shot('03-previa-n1.png') });
    await command(page, '');
    await command(page, ''); // Enter repetido não pode duplicar.
  });
  await expect(page.locator('.document-tabs')).toContainText(
    /Quadro de aço\s*1Exportar/,
  );

  // Cenário 2 · repetição: GV reaproveita critérios; P2 exige alternar dobra.
  await timed('cenario2_repeticao_ms', async () => {
    await command(page, 'GV');
    await expect(panel(page)).toContainText('N2');
    await command(page, '4550,40');
    await panel(page)
      .getByRole('button', { name: 'Alternar dobra esquerda/direita' })
      .click();
    await expect(panel(page)).toContainText('dobra à direita');
    await panel(page)
      .getByRole('button', { name: 'Confirmar lançamento' })
      .click();
  });

  // Cenário 3 · vários grampos acima: faixa vertical no P1.
  await timed('cenario3_faixa_vertical_ms', async () => {
    await command(page, 'GV');
    await panel(page)
      .getByRole('button', { name: 'Critérios do grampo de viga' })
      .click();
    const dialog = criteria(page);
    // A dobra alternada no N2 foi herdada como critério do próximo lançamento.
    const side = dialog
      .locator('label', { hasText: 'Lado fechado do U' })
      .locator('select');
    await expect(side).toHaveValue('right');
    await side.selectOption('left');
    await dialog
      .getByRole('button', { name: 'Quantidade', exact: true })
      .click();
    await dialog.getByText('Distribuir grampos em uma faixa').click();
    await dialog
      .getByRole('button', { name: 'Posicionar grampo', exact: true })
      .click();
    await command(page, '50,40'); // inserção
    await command(page, '50,40'); // início da faixa: mesmo ponto, de novo
    await command(page, '50,460'); // fim da faixa
    await expect(panel(page)).toContainText('4 grampos completos');
    await expect(panel(page)).toContainText('passo efetivo 140,00 mm');
    await page.screenshot({ path: shot('04-faixa-vertical-n3.png') });
    await command(page, '');
  });

  // Rebatimento separado (R) da posição selecionada (N3).
  await command(page, 'R');
  await command(page, '800,-1600');
  await expect(page.getByText('Rebatimento criado.').first()).toBeVisible();
  await fit(page);
  await page.screenshot({ path: shot('05-elevacao-resultado.png') });

  // Mesmo grampo nos dois apoios: tentar marcar N2 como N1.
  const n2 = await screen(page, 4550 - 250, 40);
  await page.keyboard.press('Escape');
  await page.mouse.click(n2.x, n2.y);
  const mark = page.getByRole('textbox', { name: 'Posição', exact: true });
  await expect(mark).toHaveValue('N2');
  await mark.fill('N1');
  await mark.press('Tab');
  await expect(page.locator('body')).toContainText('fabricationPositions');
  await page.screenshot({ path: shot('06-erro-marca-repetida.png') });

  await page
    .locator('.document-tabs')
    .getByRole('button', { name: /Quadro de aço/ })
    .click();
  const table = page.locator('.schedule-table');
  await expect(table).toContainText('4,417');
  await page.screenshot({ path: shot('07-quadro-aco.png') });

  writeFileSync(
    join(here, 'tempos-maquina.json'),
    JSON.stringify(
      { ...times, navegador: page.context().browser()?.version() },
      null,
      2,
    ) + '\n',
  );
  expect(errors).toEqual([]);
});
