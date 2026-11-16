import { useEffect, useId, useRef, useState } from 'react';
import { drawingLabel } from '../domain/hierarchyPresentation';
import { composeSheet } from '../domain/paper';
import {
  applySealBatch,
  sameSealTemplate,
  sealFieldStaticText,
  type SealBatchEdit,
} from '../domain/sealProject';
import type { SealPatch } from '../domain/sealFieldEdits';
import {
  type ProjectSealProperties,
  type SealFieldSource,
  type SheetSealProperties,
  type TemplateSealBinding,
} from '../domain/sealFieldSchema';
import type { ComposedSealField } from '../domain/sheetSealComposition';
import SealPropertyFields, {
  initialPropertyDraft,
  propertyValuePatches,
} from './SealPropertyFields';
import {
  SealAffixFields,
  SealBindingOptions,
  sealBindingFromToken,
  sealBindingToken,
} from './SealBindingFields';
import { sealFieldCatalog, type SealFieldId } from '../domain/sealFields';
import type { Project } from '../domain/types';
import SheetTemplatePreview from './SheetTemplatePreview';
import './SheetTemplateDialog.css';

type Props = {
  project: Project;
  initialSheetId: string;
  onClose: () => void;
  onCommit: (next: Project, expected: Project) => boolean;
};

const projectFields = {
  work: 'Obra',
  code: 'Código',
  address: 'Endereço',
  client: 'Cliente',
  responsible: 'Responsável',
  date: 'Data documental',
} as const satisfies Record<keyof ProjectSealProperties, string>;

const sheetFields = {
  ...projectFields,
  author: 'Autor da folha',
  revision: 'Revisão da folha',
} as const satisfies Record<keyof SheetSealProperties, string>;

type SheetProperty = keyof typeof sheetFields;
type SheetMode = 'keep' | 'inherit' | 'local' | 'empty';
type SheetEdit = { mode: SheetMode; value?: string };
type FieldEdit = {
  token: string;
  /** Definition kept by the template: data source plus literal affixes. */
  binding?: TemplateSealBinding;
  /** "Voltar a texto": literal fixed as static text. */
  staticText?: string;
  definitionEdited?: boolean;
  sourceEdited?: boolean;
  manualEdited?: boolean;
  source?: SealFieldSource;
  manualText?: string;
};

const sourceLabels = {
  project: 'Projeto',
  sheet: 'Folha',
  drawing: 'Desenho escolhido',
  aggregate: 'Agregado da folha',
  manual: 'Texto manual',
} as const;

/** Visible state of a composed field. */
function fieldState(field: ComposedSealField) {
  if (field.invalid) return 'inválido';
  if (field.source?.kind === 'manual') return 'manual';
  if (field.explicitEmpty) return 'vazio explícito';
  if (field.origin === 'sheet') return 'local da folha';
  if (field.inherited) return 'herdado';
  if (field.origin === 'default') return 'padrão da definição';
  if (field.origin === 'project') return 'do projeto';
  return 'automático';
}

function sheetProperties(edits: Partial<Record<SheetProperty, SheetEdit>>) {
  const patch: SealPatch<SheetSealProperties> = {};
  for (const key of Object.keys(sheetFields) as SheetProperty[]) {
    const edit = edits[key];
    if (!edit || edit.mode === 'keep') continue;
    if (key === 'revision') {
      patch.revision = edit.mode === 'inherit' ? 'inherit' : null;
    } else {
      patch[key] =
        edit.mode === 'inherit'
          ? { mode: 'inherit' }
          : {
              mode: 'local',
              value: edit.mode === 'empty' ? '' : (edit.value ?? ''),
            };
    }
  }
  return patch;
}

export default function SheetSealDraftDialog({
  project,
  initialSheetId,
  onClose,
  onCommit,
}: Props) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [base] = useState(project);
  const [selected, setSelected] = useState(() => new Set([initialSheetId]));
  const [documentName, setDocumentName] = useState(project.name);
  const [author, setAuthor] = useState(project.author);
  const [projectEdits, setProjectEdits] = useState<ProjectSealProperties>({
    ...project.sealProperties,
  });
  const [sheetEdits, setSheetEdits] = useState<
    Partial<Record<SheetProperty, SheetEdit>>
  >({});
  const [fieldEdits, setFieldEdits] = useState(
    () => new Map<string, FieldEdit>(),
  );
  const [previews, setPreviews] = useState<ReturnType<typeof composeSheet>[]>(
    [],
  );
  const [error, setError] = useState('');
  const [propertyDraft, setPropertyDraft] = useState(() =>
    initialPropertyDraft(project),
  );
  /** Pending "Voltar a texto" confirmation for one field. */
  const [freezing, setFreezing] = useState<{
    fieldId: string;
    text: string;
    blocked?: string;
  }>();
  const template = base.sheets.find(
    (sheet) => sheet.id === initialSheetId,
  )?.paperTemplate;
  const sheets = base.sheets.filter((sheet) => selected.has(sheet.id));
  const stale = base !== project;
  const committed = useRef(false);
  const activeSheet = base.sheets.find((sheet) => sheet.id === initialSheetId);
  const bindingValues = (fieldId: string) =>
    sheets
      .filter((sheet) => sameSealTemplate(sheet.paperTemplate, template))
      .map((sheet) =>
        sheet.sealBindings?.find(
          (binding) =>
            binding.templateId === template?.id && binding.fieldId === fieldId,
        ),
      );
  const fieldEdit = (
    field: NonNullable<
      Project['sheets'][number]['paperTemplate']
    >['fields'][number],
  ): FieldEdit => {
    const local =
      bindingValues(field.id)[0] ??
      activeSheet?.sealBindings?.find(
        (binding) =>
          binding.templateId === template?.id && binding.fieldId === field.id,
      );
    return (
      fieldEdits.get(field.id) ?? {
        token: sealBindingToken(field.sealBinding),
        binding: field.sealBinding,
        source: local?.source,
        manualText: local?.manualText,
      }
    );
  };

  useEffect(() => {
    const modal = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    modal?.showModal();
    return () => {
      modal?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const invalidate = () => {
    setPreviews([]);
    setError('');
  };
  const updateSheetEdit = (key: SheetProperty, edit: SheetEdit) => {
    setSheetEdits((current) => ({ ...current, [key]: edit }));
    invalidate();
  };
  const updateField = (fieldId: string, edit?: FieldEdit) => {
    setFieldEdits((current) => {
      const next = new Map(current);
      if (edit) next.set(fieldId, edit);
      else next.delete(fieldId);
      return next;
    });
    invalidate();
  };

  const buildDraft = () => {
    const values = propertyValuePatches(propertyDraft);
    const propertiesChanged =
      JSON.stringify(propertyDraft.definitions) !==
        JSON.stringify(base.sealPropertyDefinitions ?? []) ||
      propertyDraft.remaps.size > 0;
    const edits: SealBatchEdit = {
      ...(propertiesChanged
        ? {
            properties: {
              definitions: propertyDraft.definitions,
              remaps: [...propertyDraft.remaps].map(([from, to]) => ({
                from,
                to,
              })),
            },
          }
        : {}),
      projectPropertyValues: values.project,
      sheetPropertyValues: values.sheet,
      sheetIds: sheets.map((sheet) => sheet.id),
      name: documentName,
      author,
      projectProperties: projectEdits,
      sheetProperties: sheetProperties(sheetEdits),
      revision:
        sheetEdits.revision?.mode === 'local'
          ? (sheetEdits.revision.value ?? '')
          : sheetEdits.revision?.mode === 'empty'
            ? ''
            : undefined,
      template,
      fields: [...fieldEdits].map(([fieldId, edit]) => ({
        fieldId,
        ...(edit.definitionEdited ? { definition: edit.binding ?? null } : {}),
        ...(edit.staticText !== undefined
          ? { staticText: edit.staticText }
          : {}),
        ...(edit.sourceEdited ? { source: edit.source ?? null } : {}),
        ...(edit.manualEdited ? { manualText: edit.manualText ?? null } : {}),
      })),
    };
    return applySealBatch(base, edits);
  };
  const report = (failure: unknown) => {
    setPreviews([]);
    setError(
      failure instanceof Error
        ? failure.message
        : 'Confira os dados informados.',
    );
  };
  const preview = () => {
    if (stale || !sheets.length) return;
    try {
      const draft = buildDraft();
      setPreviews(sheets.map((sheet) => composeSheet(draft, sheet.id)));
      setError('');
    } catch (failure) {
      report(failure);
    }
  };
  const apply = () => {
    if (stale || committed.current || !sheets.length) return;
    try {
      const draft = buildDraft();
      committed.current = true;
      if (!onCommit(draft, base)) {
        committed.current = false;
        throw Error(
          'O projeto mudou ou está protegido. Reabra o preenchimento do selo.',
        );
      }
      onClose();
    } catch (failure) {
      report(failure);
    }
  };

  const propertySources = (id: string): SealFieldSource['kind'][] => {
    const scope = propertyDraft.definitions.find(
      (item) => item.id === id,
    )?.scope;
    return scope === 'project'
      ? ['project']
      : scope === 'sheet'
        ? ['sheet']
        : scope
          ? ['sheet', 'project']
          : [];
  };
  const startFreeze = (fieldId: string) => {
    setError('');
    try {
      const draft = buildDraft();
      setFreezing({
        fieldId,
        text: sealFieldStaticText(draft, initialSheetId, fieldId),
      });
    } catch (failure) {
      setFreezing({
        fieldId,
        text: '',
        blocked:
          (failure instanceof Error ? failure.message : String(failure)) +
          ' Para fixar mesmo assim, informe explicitamente o texto manual.',
      });
    }
  };
  const revisionValues = new Set(
    sheets.map((sheet) => sheet.properties.revision),
  );
  return (
    <dialog
      ref={dialog}
      className="modal sheet-template-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={id}>Dados do selo</h2>
      </header>
      <div className="template-dialog-scroll">
        {stale ? (
          <p className="template-alert" role="alert">
            O projeto mudou. Feche e reabra a prévia para usar os dados atuais.
          </p>
        ) : (
          <div className="template-editor-grid">
            <div className="template-editor-controls">
              <fieldset>
                <legend>Folhas para conferir</legend>
                {base.sheets.map((sheet) => (
                  <label className="template-check" key={sheet.id}>
                    <input
                      type="checkbox"
                      checked={selected.has(sheet.id)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setSelected((current) => {
                          const next = new Set(current);
                          if (checked) next.add(sheet.id);
                          else next.delete(sheet.id);
                          return next;
                        });
                        invalidate();
                      }}
                    />
                    {sheet.name}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Dados do projeto</legend>
                <div className="template-fields">
                  <label className="template-field">
                    Nome do projeto
                    <input
                      value={documentName}
                      maxLength={150}
                      onChange={(event) => {
                        setDocumentName(event.target.value);
                        invalidate();
                      }}
                    />
                  </label>
                  <label className="template-field">
                    Autor do projeto
                    <input
                      value={author}
                      maxLength={150}
                      onChange={(event) => {
                        setAuthor(event.target.value);
                        invalidate();
                      }}
                    />
                  </label>
                  {(
                    Object.keys(projectFields) as (keyof typeof projectFields)[]
                  ).map((key) => (
                    <label key={key} className="template-field">
                      {projectFields[key]}
                      <input
                        type={key === 'date' ? 'date' : 'text'}
                        value={projectEdits[key] ?? ''}
                        onChange={(event) => {
                          setProjectEdits({
                            ...projectEdits,
                            [key]: event.target.value,
                          });
                          invalidate();
                        }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={!sheets.length}>
                <legend>Dados das folhas selecionadas</legend>
                <div className="template-fields">
                  {(Object.keys(sheetFields) as SheetProperty[]).map((key) => {
                    const edit = sheetEdits[key] ?? { mode: 'keep' };
                    const label = sheetFields[key];
                    return (
                      <div className="template-field" key={key}>
                        <label className="template-field">
                          {label}
                          <select
                            value={edit.mode}
                            onChange={(event) =>
                              updateSheetEdit(key, {
                                ...edit,
                                mode: event.target.value as SheetMode,
                              })
                            }
                          >
                            <option value="keep">Manter como está</option>
                            <option value="inherit">Herdar do projeto</option>
                            <option value="local">Valor local</option>
                            <option value="empty">Vazio explícito</option>
                          </select>
                        </label>
                        {(key === 'revision'
                          ? revisionValues.size > 1
                          : new Set(
                              sheets.map((sheet) =>
                                JSON.stringify(sheet.sealProperties?.[key]),
                              ),
                            ).size > 1) &&
                          edit.mode === 'keep' && <small>Valores mistos</small>}
                        {edit.mode === 'local' && (
                          <input
                            aria-label={'Valor de ' + label}
                            type={key === 'date' ? 'date' : 'text'}
                            maxLength={key === 'revision' ? 40 : undefined}
                            value={edit.value ?? ''}
                            onChange={(event) =>
                              updateSheetEdit(key, {
                                ...edit,
                                value: event.target.value,
                              })
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <SealPropertyFields
                base={base}
                sheets={sheets}
                draft={propertyDraft}
                onChange={(next) => {
                  setPropertyDraft(next);
                  invalidate();
                }}
              />
              <fieldset>
                <legend>Vínculos do modelo aplicado</legend>
                {!template?.fields.length && (
                  <p className="template-hint">
                    A folha ativa precisa de um modelo com campos de texto. Abra
                    Modelos de margem e selo para adicionar os campos.
                  </p>
                )}
                {template?.fields.map((field) => {
                  const edit = fieldEdit(field);
                  const locals = bindingValues(field.id);
                  const mixedSource =
                    !edit.sourceEdited &&
                    new Set(
                      locals.map((binding) => JSON.stringify(binding?.source)),
                    ).size > 1;
                  const mixedManual =
                    !edit.manualEdited &&
                    new Set(locals.map((binding) => binding?.manualText)).size >
                      1;
                  return (
                    <div className="template-fields" key={field.id}>
                      <label className="template-field">
                        {'Vínculo de ' + field.label}
                        <select
                          value={edit.token}
                          disabled={edit.staticText !== undefined}
                          onChange={(event) => {
                            const token = event.target.value;
                            updateField(field.id, {
                              ...edit,
                              token,
                              binding: sealBindingFromToken(
                                token,
                                edit.binding,
                              ),
                              definitionEdited: true,
                              source: undefined,
                              sourceEdited: true,
                            });
                          }}
                        >
                          <SealBindingOptions
                            token={edit.token}
                            properties={propertyDraft.definitions}
                          />
                        </select>
                      </label>
                      {edit.staticText !== undefined && (
                        <p className="template-hint" role="status">
                          {'Voltará a texto fixo: “' + edit.staticText + '”. '}
                          <button
                            type="button"
                            onClick={() => updateField(field.id, undefined)}
                          >
                            {'Manter vínculo de ' + field.label}
                          </button>
                        </p>
                      )}
                      {!!edit.token && edit.binding && (
                        <SealAffixFields
                          label={field.label}
                          binding={edit.binding}
                          onChange={(binding) =>
                            updateField(field.id, {
                              ...edit,
                              binding,
                              definitionEdited: true,
                            })
                          }
                        />
                      )}
                      {!!edit.token && (
                        <label className="template-field">
                          {'Origem de ' + field.label}
                          <select
                            value={
                              mixedSource
                                ? '__mixed__'
                                : (edit.source?.kind ?? '')
                            }
                            onChange={(event) => {
                              const kind = event.target.value as
                                | SealFieldSource['kind']
                                | '';
                              const source =
                                kind === 'drawing'
                                  ? ({ kind, drawingId: '' } as const)
                                  : kind
                                    ? { kind }
                                    : undefined;
                              updateField(field.id, {
                                ...edit,
                                source,
                                sourceEdited: true,
                              });
                            }}
                          >
                            <option value="">Configuração da folha</option>
                            {mixedSource && (
                              <option value="__mixed__" disabled>
                                Valores mistos (manter)
                              </option>
                            )}
                            {(edit.binding?.property !== undefined
                              ? propertySources(edit.binding.property)
                              : (sealFieldCatalog[edit.token as SealFieldId]
                                  ?.sources ?? [])
                            ).map((kind) => (
                              <option
                                key={kind}
                                value={kind}
                                disabled={
                                  kind === 'drawing' &&
                                  !base.hierarchy.drawings.length
                                }
                              >
                                {sourceLabels[kind]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!!edit.token && edit.source?.kind === 'drawing' && (
                        <label className="template-field">
                          {'Desenho de ' + field.label}
                          <select
                            value={edit.source.drawingId}
                            onChange={(event) =>
                              updateField(field.id, {
                                ...edit,
                                source: {
                                  kind: 'drawing',
                                  drawingId: event.target.value,
                                },
                                sourceEdited: true,
                              })
                            }
                          >
                            <option value="">Escolha um desenho</option>
                            {base.hierarchy.drawings.map((drawing) => (
                              <option key={drawing.id} value={drawing.id}>
                                {drawingLabel(base, drawing)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!!edit.token && (
                        <label className="template-check">
                          <input
                            type="checkbox"
                            checked={edit.manualText !== undefined}
                            ref={(input) => {
                              if (input) input.indeterminate = mixedManual;
                            }}
                            onChange={(event) =>
                              updateField(field.id, {
                                ...edit,
                                manualEdited: true,
                                manualText: event.target.checked
                                  ? ''
                                  : undefined,
                              })
                            }
                          />
                          {'Texto manual de ' + field.label}
                        </label>
                      )}
                      {!!edit.token && edit.manualText !== undefined && (
                        <label className="template-field">
                          {'Valor manual de ' + field.label}
                          <textarea
                            maxLength={5000}
                            value={edit.manualText}
                            onChange={(event) =>
                              updateField(field.id, {
                                ...edit,
                                manualText: event.target.value,
                                manualEdited: true,
                              })
                            }
                          />
                        </label>
                      )}
                      {(mixedSource || mixedManual) && (
                        <small>
                          Valores mistos. As origens e os textos manuais são
                          preservados até editar cada opção.
                        </small>
                      )}
                      {!!edit.token &&
                        edit.staticText === undefined &&
                        freezing?.fieldId !== field.id && (
                          <button
                            type="button"
                            onClick={() => startFreeze(field.id)}
                          >
                            {'Voltar a texto: ' + field.label}
                          </button>
                        )}
                      {freezing?.fieldId === field.id && (
                        <div className="template-fields" role="group">
                          {freezing.blocked ? (
                            <p className="template-alert" role="alert">
                              {freezing.blocked}
                            </p>
                          ) : (
                            <p className="template-hint" role="status">
                              {'Será fixado como texto: “' +
                                freezing.text +
                                '”. A partir da confirmação o campo deixa de atualizar.'}
                            </p>
                          )}
                          {freezing.blocked && (
                            <label className="template-field">
                              {'Texto manual a fixar em ' + field.label}
                              <input
                                value={freezing.text}
                                maxLength={500}
                                onChange={(event) =>
                                  setFreezing({
                                    ...freezing,
                                    text: event.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                          <div className="template-buttons">
                            <button
                              type="button"
                              onClick={() => setFreezing(undefined)}
                            >
                              Cancelar volta a texto
                            </button>
                            <button
                              type="button"
                              disabled={!!freezing.blocked && !freezing.text}
                              onClick={() => {
                                updateField(field.id, {
                                  token: '',
                                  binding: undefined,
                                  definitionEdited: true,
                                  staticText: freezing.text,
                                });
                                setFreezing(undefined);
                              }}
                            >
                              {'Confirmar volta a texto de ' + field.label}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </fieldset>
            </div>
            <div className="template-preview-column" aria-live="polite">
              {!previews.length && (
                <p className="template-hint">
                  Escolha as folhas e confira os valores no selo.
                </p>
              )}
              {previews.map((page) => (
                <article
                  className="template-preview-column"
                  key={page.sheet.id}
                >
                  <h3>{page.sheet.name}</h3>
                  <SheetTemplatePreview
                    label={'Prévia do selo em ' + page.sheet.name}
                    size={page.size}
                    lines={page.decorations}
                  />
                  {fieldEdits.size > 0 &&
                    !sameSealTemplate(
                      base.sheets.find((s) => s.id === page.sheet.id)
                        ?.paperTemplate,
                      template,
                    ) && (
                      <p className="template-hint">
                        Os vínculos se aplicam às folhas com o mesmo modelo e
                        revisão da folha ativa.
                      </p>
                    )}
                  {page.sealFields?.length ? (
                    <ul
                      className="template-impact"
                      aria-label="Origem dos campos"
                    >
                      {page.sealFields.map((field) => (
                        <li key={field.id}>
                          <strong>{field.label}</strong>
                          {' · ' +
                            (field.source
                              ? sourceLabels[field.source.kind]
                              : 'Origem indisponível')}
                          {' · ' + fieldState(field)}
                          {!field.text && ' · Sem valor'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!!page.issues.length && (
                    <ul className="template-impact template-alert">
                      {page.issues.map((issue, index) => (
                        <li key={index}>{issue.message}</li>
                      ))}
                    </ul>
                  )}
                  {!!page.notices.length && (
                    <ul className="template-impact template-hint">
                      {page.notices.map((notice, index) => (
                        <li key={index}>{notice.message}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer>
        <p className="template-hint">
          Confira os valores e escolha Aplicar dados do selo para gravar em uma
          única etapa de Desfazer. Cancelar ou Esc descarta as alterações.
        </p>
        {error && (
          <p role="alert" className="template-alert">
            {error}
          </p>
        )}
        <div className="template-buttons">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary"
            onClick={preview}
            disabled={stale || !sheets.length}
          >
            Conferir prévia
          </button>
          <button
            type="button"
            className="primary"
            onClick={apply}
            disabled={stale || !sheets.length}
          >
            Aplicar dados do selo
          </button>
        </div>
      </footer>
    </dialog>
  );
}
