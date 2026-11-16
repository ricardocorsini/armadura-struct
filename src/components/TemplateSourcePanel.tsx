import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react';
import { composeSheet } from '../domain/paper';
import {
  applyTemplateLink,
  applyTemplateUpdate,
  pendingTemplateUpdateDecisions,
  planTemplateLink,
  relocateTemplateSource,
  sourceState,
  sourceStateLabels,
  templateSource,
  templateSourceUsage,
  unlinkTemplateSource,
  planTemplateUpdate,
  type SourceCheck,
  type TemplateLinkPlan,
  type TemplateSourceFile,
  type TemplateUpdatePlan,
} from '../domain/sheetTemplateSources';
import type { SealPropertyImportDecision } from '../domain/sealProperties';
import type { SheetTemplate } from '../domain/sheetTemplates';
import { uid, type Project } from '../domain/types';
import { pickNativeFile } from '../lib/files';
import {
  checkSource,
  grantSourceAccess,
  hasSourceAccess,
  readTemplateSourceFile,
  recordSourceRead,
  sourceCheck,
  sourceChecksVersion,
  subscribeSourceChecks,
} from '../lib/templateSourceAccess';
import SealPropertyImportPanel from './SealPropertyImportPanel';

type Props = {
  project: Project;
  /** Saved library template being edited, if any. */
  saved?: SheetTemplate;
  selected: ReadonlySet<string>;
  disabled: boolean;
  commit: (next: Project, message: string) => boolean;
  report: (cause: unknown) => void;
  onLinked: (template: SheetTemplate) => void;
};

type Picked = { file: File; read: TemplateSourceFile };
type Mode =
  | { kind: 'idle' }
  | {
      kind: 'link';
      picked: Picked;
      plan: TemplateLinkPlan;
      decisions?: Map<string, SealPropertyImportDecision>;
      sheetIds: Set<string>;
    }
  | {
      kind: 'update';
      picked?: Picked;
      plan: TemplateUpdatePlan;
      decisions?: Map<string, SealPropertyImportDecision>;
      sheetIds: Set<string>;
      conflicts: Map<string, 'local' | 'model'>;
      removed: Map<string, 'keep' | 'remove'>;
    }
  | { kind: 'unlink'; sheetIds: Set<string>; library: boolean };

const when = (check: SourceCheck) =>
  'checkedAt' in check
    ? ' · verificado às ' +
      new Date(check.checkedAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const originLabels = {
  model: 'mudou no modelo',
  local: 'ajuste local mantido',
  'both-same': 'mesma mudança local e no modelo',
  conflict: 'conflito',
} as const;

export default function TemplateSourcePanel({
  project,
  saved,
  selected,
  disabled,
  commit,
  report,
  onLinked,
}: Props) {
  const heading = useId();
  const input = useRef<HTMLInputElement>(null);
  const purpose = useRef<'link' | 'relocate'>('link');
  const busy = useRef(false);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [notice, setNotice] = useState('');
  useSyncExternalStore(subscribeSourceChecks, sourceChecksVersion);

  const linkId = saved?.sourceLink?.id;
  const source = linkId ? templateSource(project, linkId) : undefined;
  const usage = linkId ? templateSourceUsage(project, linkId) : undefined;
  const check = linkId ? sourceCheck(linkId) : undefined;
  const libraryState =
    source && saved?.sourceLink
      ? sourceState(source, saved.sourceLink, check)
      : undefined;
  // A plan made for another project state is stale.
  const stale =
    (mode.kind === 'link' || mode.kind === 'update') &&
    mode.plan.base !== project;

  const fail = (cause: unknown) => {
    setNotice('');
    report(cause);
  };

  const received = async (file: File) => {
    try {
      const read = await readTemplateSourceFile(file);
      const picked = { file, read };
      if (purpose.current === 'link') {
        setMode({
          kind: 'link',
          picked,
          plan: planTemplateLink(project, read, file.name),
          sheetIds: new Set(selected),
        });
        return;
      }
      if (!linkId) return;
      const result = relocateTemplateSource(project, linkId, read, file.name);
      if (result.kind === 'same') {
        if (result.project !== project && !commit(result.project, '')) return;
        grantSourceAccess(linkId, file);
        recordSourceRead(linkId, read);
        setNotice(
          'Mesma revisão localizada. O acesso ao arquivo foi restaurado; as folhas não mudaram.',
        );
        return;
      }
      grantSourceAccess(linkId, file);
      recordSourceRead(linkId, read);
      openUpdate(result.plan, picked);
    } catch (cause) {
      fail(cause);
    }
  };

  const pick = async (kind: 'link' | 'relocate') => {
    purpose.current = kind;
    setNotice('');
    try {
      const file = await pickNativeFile(['json']);
      if (file === undefined) input.current?.click();
      else if (file) await received(file);
    } catch (cause) {
      fail(cause);
    }
  };
  const fromInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void received(file);
  };

  const openUpdate = (plan: TemplateUpdatePlan, picked?: Picked) =>
    setMode({
      kind: 'update',
      picked,
      plan,
      sheetIds: new Set(plan.dependents.map((d) => d.id)),
      conflicts: new Map(),
      removed: new Map(),
    });

  const verify = async () => {
    if (!linkId) return;
    setNotice('');
    const result = await checkSource(linkId);
    if (result.check.state === 'read' && result.file)
      setNotice(
        result.check.contentHash === source?.contentHash
          ? 'O arquivo autorizado é igual à revisão incorporada.'
          : 'Há uma revisão diferente no arquivo. Use Atualizar para conferir antes/depois.',
      );
  };

  const prepareUpdate = async () => {
    if (!linkId) return;
    const result = await checkSource(linkId);
    if (!result.file) {
      fail(
        'Não foi possível ler a origem. Use Localizar novamente para escolher o arquivo.',
      );
      return;
    }
    try {
      openUpdate(
        planTemplateUpdate(project, linkId, result.file, source?.hint),
        undefined,
      );
    } catch (cause) {
      fail(cause);
    }
  };

  const decisionsOf = (
    plan: TemplateLinkPlan | TemplateUpdatePlan,
    decisions?: Map<string, SealPropertyImportDecision>,
  ) =>
    decisions ??
    new Map(plan.properties.map((item) => [item.external.id, item.proposal]));
  const needsMapping = (plan: TemplateLinkPlan | TemplateUpdatePlan) =>
    plan.properties.some(
      (item) => item.status !== 'identical' && item.status !== 'confirmed',
    );

  const draft = (): { next?: Project; error?: string } => {
    try {
      if (mode.kind === 'link')
        return {
          next: applyTemplateLink(project, mode.plan, {
            sheetIds: [...mode.sheetIds],
            decisions: decisionsOf(mode.plan, mode.decisions),
            newId: uid,
          }),
        };
      if (mode.kind === 'update')
        return {
          next: applyTemplateUpdate(project, mode.plan, {
            sheetIds: [...mode.sheetIds],
            conflicts: mode.conflicts,
            removed: mode.removed,
            decisions: decisionsOf(mode.plan, mode.decisions),
            newId: uid,
          }),
        };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : String(cause) };
    }
    return {};
  };

  const confirm = async () => {
    if (busy.current || stale) return;
    busy.current = true;
    try {
      if (mode.kind === 'update' && hasSourceAccess(mode.plan.linkId)) {
        // The source may have changed during the preview.
        const recheck = await checkSource(mode.plan.linkId);
        if (
          recheck.check.state !== 'read' ||
          recheck.check.contentHash !== mode.plan.file.contentHash
        )
          throw Error(
            'A origem mudou ou ficou indisponível durante a prévia. Gere a prévia novamente.',
          );
      }
      const { next, error } = draft();
      if (!next) throw Error(error);
      if (mode.kind === 'link') {
        const added = next.sheetTemplateSources!.find(
          (item) =>
            !project.sheetTemplateSources?.some((old) => old.id === item.id),
        )!;
        if (
          !commit(
            next,
            `Modelo vinculado à origem e aplicado a ${mode.sheetIds.size} folha(s).`,
          )
        )
          return;
        grantSourceAccess(added.id, mode.picked.file);
        recordSourceRead(added.id, mode.picked.read);
        const template = next.sheetTemplates!.find(
          (t) => t.sourceLink?.id === added.id,
        )!;
        onLinked(template);
      } else if (mode.kind === 'update') {
        if (
          !commit(
            next,
            `Modelo atualizado em ${mode.sheetIds.size} folha(s). As demais mantêm a revisão anterior.`,
          )
        )
          return;
      }
      setMode({ kind: 'idle' });
    } catch (cause) {
      fail(cause);
    } finally {
      busy.current = false;
    }
  };

  const unlink = () => {
    if (mode.kind !== 'unlink' || !linkId) return;
    const next = unlinkTemplateSource(project, linkId, {
      sheetIds: [...mode.sheetIds],
      library: mode.library,
    });
    if (
      commit(
        next,
        'Vínculo removido. As folhas mantêm a aparência e os dados da revisão incorporada.',
      )
    )
      setMode({ kind: 'idle' });
  };

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const preview =
    (mode.kind === 'link' && !(needsMapping(mode.plan) && !mode.decisions)) ||
    (mode.kind === 'update' && !(needsMapping(mode.plan) && !mode.decisions))
      ? draft()
      : undefined;
  const previewSheets =
    preview?.next && (mode.kind === 'link' || mode.kind === 'update')
      ? [...mode.sheetIds].flatMap((id) => {
          const sheet = preview.next!.sheets.find((s) => s.id === id);
          return sheet
            ? [{ sheet, page: composeSheet(preview.next!, id) }]
            : [];
        })
      : [];

  return (
    <fieldset aria-labelledby={heading} disabled={disabled}>
      <legend id={heading}>Origem externa do modelo</legend>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Arquivo de origem do modelo"
        onChange={fromInput}
      />
      {mode.kind === 'idle' && (
        <>
          {source && saved?.sourceLink ? (
            <>
              <p className="template-hint" role="status">
                <strong>{sourceStateLabels[libraryState!]}</strong>
                {check && 'reason' in check ? ` · ${check.reason}` : ''}
                {check ? when(check) : ''}
              </p>
              <p className="template-hint">
                Origem: {source.hint ?? 'arquivo sem nome'} · modelo do arquivo
                rev. {source.revision}. O nome do arquivo é só uma referência: o
                acesso depende de escolher o arquivo nesta sessão.
              </p>
              {!!usage?.sheets.length && (
                <ul className="template-impact" aria-label="Folhas vinculadas">
                  {usage.sheets.map((sheet) => (
                    <li key={sheet.id}>
                      {sheet.name}
                      {' · rev. ' + sheet.paperTemplate!.revision + ' · '}
                      {
                        sourceStateLabels[
                          sourceState(
                            source,
                            sheet.paperTemplate!.sourceLink!,
                            check,
                          )
                        ]
                      }
                    </li>
                  ))}
                </ul>
              )}
              <div className="template-buttons">
                <button
                  type="button"
                  disabled={!hasSourceAccess(source.id)}
                  onClick={() => void verify()}
                >
                  Verificar
                </button>
                <button
                  type="button"
                  disabled={
                    !hasSourceAccess(source.id) ||
                    (!usage?.sheets.some(
                      (s) =>
                        check?.state === 'read' &&
                        s.paperTemplate!.sourceLink!.contentHash !==
                          check.contentHash,
                    ) &&
                      libraryState !== 'update')
                  }
                  onClick={() => void prepareUpdate()}
                >
                  Atualizar
                </button>
                <button type="button" onClick={() => void pick('relocate')}>
                  Localizar novamente
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMode({
                      kind: 'unlink',
                      sheetIds: new Set(usage?.sheets.map((s) => s.id)),
                      library: true,
                    })
                  }
                >
                  Desvincular
                </button>
              </div>
            </>
          ) : (
            <p className="template-hint">
              Vincule um arquivo de modelo do escritório para acompanhar novas
              revisões. O arquivo externo nunca é alterado.
            </p>
          )}
          <div className="template-buttons">
            <button type="button" onClick={() => void pick('link')}>
              Vincular modelo do escritório (.json)
            </button>
          </div>
          {notice && (
            <p className="template-hint" role="status">
              {notice}
            </p>
          )}
        </>
      )}

      {(mode.kind === 'link' || mode.kind === 'update') &&
        needsMapping(mode.plan) &&
        !mode.decisions && (
          <SealPropertyImportPanel
            plan={mode.plan.properties}
            locals={project.sealPropertyDefinitions ?? []}
            onCancel={() => setMode({ kind: 'idle' })}
            onConfirm={(decisions) => setMode({ ...mode, decisions })}
          />
        )}

      {(mode.kind === 'link' || mode.kind === 'update') &&
        !(needsMapping(mode.plan) && !mode.decisions) && (
          <section
            className="template-application"
            aria-label={
              mode.kind === 'link'
                ? 'Prévia do vínculo'
                : 'Prévia da atualização'
            }
          >
            <h3>
              {mode.kind === 'link'
                ? 'Prévia do vínculo'
                : 'Prévia da atualização'}
            </h3>
            {stale && (
              <p className="template-alert" role="alert">
                O projeto mudou desde a prévia. Cancele e gere a prévia
                novamente.
              </p>
            )}
            {mode.kind === 'link' ? (
              <p>
                Modelo “{mode.plan.file.template.name}” rev.{' '}
                {mode.plan.file.template.revision} · origem{' '}
                {mode.plan.hint ?? 'arquivo escolhido'}. Ele entra na biblioteca
                como modelo vinculado e é aplicado às folhas marcadas.
              </p>
            ) : (
              <>
                <p>
                  Revisão atual: “{mode.plan.current.name}” rev.{' '}
                  {mode.plan.current.revision} (arquivo rev.{' '}
                  {templateSource(project, mode.plan.linkId)?.revision}).
                  Proposta: arquivo rev. {mode.plan.file.template.revision}.
                </p>
                {mode.plan.identityChange && (
                  <p className="template-alert" role="alert">
                    O arquivo escolhido é outro modelo (identidade diferente).
                    Confira a comparação antes de substituir a origem.
                  </p>
                )}
                <ul className="template-impact" aria-label="Mudanças propostas">
                  {!mode.plan.changes.length &&
                    !mode.plan.added.length &&
                    !mode.plan.removed.length && (
                      <li>Sem mudanças gráficas; só a revisão aceita muda.</li>
                    )}
                  {mode.plan.changes.map((change) => (
                    <li key={change.key}>
                      {change.label} · {originLabels[change.origin]}
                      {change.origin === 'conflict' && (
                        <label className="template-field">
                          {'Resolver: ' + change.label}
                          <select
                            value={mode.conflicts.get(change.key) ?? ''}
                            onChange={(event) =>
                              setMode({
                                ...mode,
                                conflicts: new Map(mode.conflicts).set(
                                  change.key,
                                  event.target.value as 'local' | 'model',
                                ),
                              })
                            }
                          >
                            <option value="" disabled>
                              Escolha
                            </option>
                            <option value="local">Manter o ajuste local</option>
                            <option value="model">Aceitar o modelo</option>
                          </select>
                        </label>
                      )}
                    </li>
                  ))}
                  {mode.plan.added.map((field) => (
                    <li key={field.fieldId}>Campo novo “{field.label}”</li>
                  ))}
                  {mode.plan.removed.map((field) => (
                    <li key={field.fieldId}>
                      Campo “{field.label}” removido no modelo
                      {field.sheetData.length
                        ? ` · vínculos locais em: ${field.sheetData.join(', ')}`
                        : ''}
                      <label className="template-field">
                        {'Destino do campo ' + field.label}
                        <select
                          value={mode.removed.get(field.fieldId) ?? ''}
                          onChange={(event) =>
                            setMode({
                              ...mode,
                              removed: new Map(mode.removed).set(
                                field.fieldId,
                                event.target.value as 'keep' | 'remove',
                              ),
                            })
                          }
                        >
                          <option value="" disabled>
                            Escolha
                          </option>
                          <option value="keep">Manter como campo local</option>
                          <option value="remove">
                            Remover (descarta os vínculos locais listados)
                          </option>
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <fieldset>
              <legend>
                {mode.kind === 'link'
                  ? 'Folhas que receberão o modelo'
                  : 'Folhas a atualizar'}
              </legend>
              {(mode.kind === 'link'
                ? project.sheets
                : project.sheets.filter((s) =>
                    mode.plan.dependents.some((d) => d.id === s.id),
                  )
              ).map((sheet) => (
                <label className="template-check" key={sheet.id}>
                  <input
                    type="checkbox"
                    checked={mode.sheetIds.has(sheet.id)}
                    onChange={(event) =>
                      setMode({
                        ...mode,
                        sheetIds: toggle(
                          mode.sheetIds,
                          sheet.id,
                          event.target.checked,
                        ),
                      } as Mode)
                    }
                  />
                  {sheet.name}
                </label>
              ))}
              {mode.kind === 'update' && (
                <p className="template-hint">
                  As folhas desmarcadas continuam na revisão anterior.
                </p>
              )}
            </fieldset>
            {mode.kind === 'update' &&
              pendingTemplateUpdateDecisions(mode.plan, mode).length > 0 && (
                <p className="template-alert" role="status">
                  Resolva os conflitos e os campos removidos para continuar.
                </p>
              )}
            {preview?.error &&
              !(
                mode.kind === 'update' &&
                pendingTemplateUpdateDecisions(mode.plan, mode).length
              ) && (
                <p className="template-alert" role="alert">
                  {preview.error}
                </p>
              )}
            {previewSheets.map(({ sheet, page }) => (
              <div key={sheet.id}>
                <strong>{sheet.name}</strong>
                {page.issues.length ? (
                  <ul className="template-alert">
                    {page.issues.map((issue, index) => (
                      <li key={index}>{issue.message}</li>
                    ))}
                  </ul>
                ) : (
                  <span> · composição sem bloqueios</span>
                )}
              </div>
            ))}
            <p className="template-hint">
              Dados das folhas (nome, revisão, notas, valores, textos manuais),
              vistas, escalas e quadro de aço são preservados. Confirmar grava
              tudo numa única etapa de Desfazer.
            </p>
            <div className="template-buttons">
              <button type="button" onClick={() => setMode({ kind: 'idle' })}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={stale || !preview?.next}
                onClick={() => void confirm()}
              >
                {mode.kind === 'link'
                  ? 'Confirmar vínculo'
                  : 'Atualizar folhas selecionadas'}
              </button>
            </div>
          </section>
        )}

      {mode.kind === 'unlink' && usage && (
        <section aria-label="Desvincular origem">
          <p className="template-hint">
            Desvincular remove só a dependência do arquivo externo. As folhas
            mantêm aparência, campos, definições e valores.
          </p>
          <label className="template-check">
            <input
              type="checkbox"
              checked={mode.library}
              onChange={(event) =>
                setMode({ ...mode, library: event.target.checked })
              }
            />
            Modelo da biblioteca
          </label>
          {usage.sheets.map((sheet) => (
            <label className="template-check" key={sheet.id}>
              <input
                type="checkbox"
                checked={mode.sheetIds.has(sheet.id)}
                onChange={(event) =>
                  setMode({
                    ...mode,
                    sheetIds: toggle(
                      mode.sheetIds,
                      sheet.id,
                      event.target.checked,
                    ),
                  })
                }
              />
              {sheet.name}
            </label>
          ))}
          <div className="template-buttons">
            <button type="button" onClick={() => setMode({ kind: 'idle' })}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              disabled={!mode.library && !mode.sheetIds.size}
              onClick={unlink}
            >
              Confirmar desvinculação
            </button>
          </div>
        </section>
      )}
    </fieldset>
  );
}
