import {
  newSealPropertyName,
  sealPropertyChangeImpact,
  sealPropertyScopes,
  sealPropertyTypes,
  sealPropertyUsage,
  describeSealPropertyUsage,
  sealPropertyValue,
  sealPropertyValueError,
  type SealPropertyDefinition,
  type SealPropertyScope,
  type SealPropertyType,
  type SealPropertyValue,
  type SealPropertyValuePatch,
} from '../domain/sealProperties';
import { uid, type Project, type Sheet } from '../domain/types';

export type PropertyValueMode = 'keep' | 'inherit' | 'value' | 'empty';
export type PropertyValueEdit = { mode: PropertyValueMode; text?: string };
export type SealPropertyDraft = {
  definitions: SealPropertyDefinition[];
  /** Removed property ID → substitute ID. */
  remaps: Map<string, string>;
  projectValues: Map<string, PropertyValueEdit>;
  sheetValues: Map<string, PropertyValueEdit>;
};

export function initialPropertyDraft(project: Project): SealPropertyDraft {
  return {
    definitions: structuredClone(project.sealPropertyDefinitions ?? []),
    remaps: new Map(),
    projectValues: new Map(),
    sheetValues: new Map(),
  };
}

/** Text shown in an input for a stored value. */
export function valueText(value: SealPropertyValue | undefined): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return String(value).replace('.', ',');
  return String(value);
}

export function parsePropertyValue(
  definition: SealPropertyDefinition,
  text: string,
): SealPropertyValue {
  let value: SealPropertyValue;
  switch (definition.type) {
    case 'number': {
      const normalized = text.trim().replace(',', '.');
      value =
        normalized && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(normalized)
          ? Number(normalized)
          : Number.NaN;
      break;
    }
    case 'boolean':
      value = text === 'true' ? true : text === 'false' ? false : '';
      break;
    default:
      value = text;
  }
  const error = sealPropertyValueError(definition, value);
  if (error) throw Error(`“${definition.name}”. ${error}`);
  return value;
}

const allowsProject = (scope: SealPropertyScope) => scope !== 'sheet';
const allowsSheet = (scope: SealPropertyScope) => scope !== 'project';

/** Patches for the batch; unchanged entries are not written. */
export function propertyValuePatches(draft: SealPropertyDraft) {
  const build = (
    edits: Map<string, PropertyValueEdit>,
    allowed: (scope: SealPropertyScope) => boolean,
  ) => {
    const patches: SealPropertyValuePatch[] = [];
    for (const [property, edit] of edits) {
      const definition = draft.definitions.find((item) => item.id === property);
      if (!definition || !allowed(definition.scope) || edit.mode === 'keep')
        continue;
      if (edit.mode === 'inherit') patches.push({ property, inherit: true });
      else if (edit.mode === 'empty') patches.push({ property, value: null });
      else
        patches.push({
          property,
          value: parsePropertyValue(definition, edit.text ?? ''),
        });
    }
    return patches;
  };
  return {
    project: build(draft.projectValues, allowsProject),
    sheet: build(draft.sheetValues, allowsSheet),
  };
}

function ValueInput({
  definition,
  label,
  text,
  onChange,
}: {
  definition: SealPropertyDefinition;
  label: string;
  text: string;
  onChange: (text: string) => void;
}) {
  if (definition.type === 'boolean')
    return (
      <select
        aria-label={label}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Escolha</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  return (
    <input
      aria-label={label}
      type={definition.type === 'date' ? 'date' : 'text'}
      inputMode={definition.type === 'number' ? 'decimal' : undefined}
      maxLength={definition.type === 'text' ? 300 : undefined}
      value={text}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function DefinitionEditor({
  base,
  definition,
  draft,
  onChange,
}: {
  base: Project;
  definition: SealPropertyDefinition;
  draft: SealPropertyDraft;
  onChange: (definition: SealPropertyDefinition) => void;
}) {
  const label = definition.name || 'Propriedade';
  const original = base.sealPropertyDefinitions?.find(
    (item) => item.id === definition.id,
  );
  const changed =
    !!original && JSON.stringify(original) !== JSON.stringify(definition);
  const impact = changed
    ? sealPropertyChangeImpact(base, definition)
    : undefined;
  const rules = definition.rules ?? {};
  const setRules = (
    patch: Partial<NonNullable<SealPropertyDefinition['rules']>>,
  ) => {
    const next = { ...rules, ...patch };
    for (const key of Object.keys(next) as (keyof typeof next)[])
      if (next[key] === undefined) delete next[key];
    onChange({
      ...definition,
      rules: Object.keys(next).length ? next : undefined,
    });
  };
  const optionalNumber = (text: string) => {
    const n = Number(text.replace(',', '.'));
    return text.trim() && Number.isFinite(n) ? n : undefined;
  };
  let defaultError = '';
  if (definition.default !== undefined)
    defaultError = sealPropertyValueError(definition, definition.default) ?? '';
  return (
    <div className="template-fields">
      <label className="template-field">
        <span>Nome da propriedade</span>
        <input
          value={definition.name}
          maxLength={80}
          onChange={(event) =>
            onChange({ ...definition, name: event.target.value })
          }
        />
      </label>
      <label className="template-field">
        <span>{'Tipo de ' + label}</span>
        <select
          value={definition.type}
          onChange={(event) =>
            onChange({
              ...definition,
              type: event.target.value as SealPropertyType,
              // Rules and default belong to the previous type; nothing else is converted.
              rules: undefined,
              default: undefined,
            })
          }
        >
          {Object.entries(sealPropertyTypes).map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label className="template-field">
        <span>{'Escopo de ' + label}</span>
        <select
          value={definition.scope}
          onChange={(event) =>
            onChange({
              ...definition,
              scope: event.target.value as SealPropertyScope,
            })
          }
        >
          {Object.entries(sealPropertyScopes).map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <label className="template-check">
        <input
          type="checkbox"
          checked={definition.default !== undefined}
          onChange={(event) =>
            onChange({
              ...definition,
              default: event.target.checked
                ? definition.type === 'boolean'
                  ? false
                  : definition.type === 'number'
                    ? (rules.min ?? 0)
                    : definition.type === 'date'
                      ? ''
                      : ''
                : undefined,
            })
          }
        />
        {'Valor padrão de ' + label}
      </label>
      {definition.default !== undefined && (
        <label className="template-field">
          <span>{'Padrão de ' + label}</span>
          <ValueInput
            definition={definition}
            label={'Padrão de ' + label}
            text={valueText(definition.default)}
            onChange={(text) => {
              let value: SealPropertyValue = text;
              if (definition.type === 'number')
                value = optionalNumber(text) ?? Number.NaN;
              if (definition.type === 'boolean') value = text === 'true';
              onChange({ ...definition, default: value });
            }}
          />
        </label>
      )}
      {definition.type === 'text' && (
        <label className="template-field">
          <span>{'Limite de caracteres de ' + label}</span>
          <input
            inputMode="numeric"
            value={rules.maxLength ?? ''}
            onChange={(event) =>
              setRules({ maxLength: optionalNumber(event.target.value) })
            }
          />
        </label>
      )}
      {definition.type === 'number' && (
        <>
          <label className="template-field">
            <span>{'Mínimo de ' + label}</span>
            <input
              inputMode="decimal"
              value={valueText(rules.min)}
              onChange={(event) =>
                setRules({ min: optionalNumber(event.target.value) })
              }
            />
          </label>
          <label className="template-field">
            <span>{'Máximo de ' + label}</span>
            <input
              inputMode="decimal"
              value={valueText(rules.max)}
              onChange={(event) =>
                setRules({ max: optionalNumber(event.target.value) })
              }
            />
          </label>
          <label className="template-field">
            <span>{'Casas decimais de ' + label}</span>
            <input
              inputMode="numeric"
              value={rules.decimals ?? ''}
              onChange={(event) =>
                setRules({ decimals: optionalNumber(event.target.value) })
              }
            />
          </label>
        </>
      )}
      {defaultError && <small className="template-alert">{defaultError}</small>}
      {impact &&
        (impact.usage.fields.length > 0 || impact.invalid.length > 0) && (
          <small
            className={impact.invalid.length ? 'template-alert' : undefined}
          >
            {impact.usage.fields.length
              ? `A alteração afeta ${impact.usage.fields.length} campo(s) vinculados. `
              : ''}
            {impact.invalid.length
              ? 'Valores incompatíveis (nada é convertido; corrija-os antes): ' +
                impact.invalid.join('; ') +
                '.'
              : 'Os valores existentes continuam válidos.'}
          </small>
        )}
      {!original && draft.definitions.length > 0 && (
        <small>Nova propriedade. ID estável gerado ao criar.</small>
      )}
    </div>
  );
}

export default function SealPropertyFields({
  base,
  sheets,
  draft,
  onChange,
}: {
  base: Project;
  sheets: Sheet[];
  draft: SealPropertyDraft;
  onChange: (draft: SealPropertyDraft) => void;
}) {
  const removed = (base.sealPropertyDefinitions ?? []).filter(
    (item) => !draft.definitions.some((next) => next.id === item.id),
  );
  const update = (patch: Partial<SealPropertyDraft>) =>
    onChange({ ...draft, ...patch });
  const setDefinition = (definition: SealPropertyDefinition) =>
    update({
      definitions: draft.definitions.map((item) =>
        item.id === definition.id ? definition : item,
      ),
    });
  const setValue = (
    key: 'projectValues' | 'sheetValues',
    id: string,
    edit: PropertyValueEdit,
  ) => update({ [key]: new Map(draft[key]).set(id, edit) });
  return (
    <fieldset>
      <legend>Propriedades personalizadas</legend>
      <p className="template-hint">
        Cada propriedade tem um ID estável: renomear conserva valores e
        vínculos. Os campos nativos (obra, autor, data…) continuam no cadastro
        acima.
      </p>
      {draft.definitions.map((definition) => {
        const label = definition.name || 'Propriedade';
        const projectStored = sealPropertyValue(
          base.sealPropertyValues,
          definition.id,
        );
        const projectEdit =
          draft.projectValues.get(definition.id) ??
          (projectStored
            ? projectStored.value === null
              ? { mode: 'empty' as const }
              : { mode: 'value' as const, text: valueText(projectStored.value) }
            : { mode: 'inherit' as const });
        const sheetEdit = draft.sheetValues.get(definition.id) ?? {
          mode: 'keep' as const,
        };
        const sheetStates = new Set(
          sheets.map((sheet) =>
            JSON.stringify(
              sealPropertyValue(sheet.sealPropertyValues, definition.id) ??
                null,
            ),
          ),
        );
        return (
          <details key={definition.id} className="template-field" open>
            <summary>
              {label + ' · ' + sealPropertyTypes[definition.type]}
            </summary>
            <DefinitionEditor
              base={base}
              definition={definition}
              draft={draft}
              onChange={setDefinition}
            />
            {allowsProject(definition.scope) && (
              <div className="template-fields">
                <label className="template-field">
                  <span>{'Valor do projeto para ' + label}</span>
                  <select
                    value={projectEdit.mode}
                    onChange={(event) =>
                      setValue('projectValues', definition.id, {
                        ...projectEdit,
                        mode: event.target.value as PropertyValueMode,
                      })
                    }
                  >
                    <option value="inherit">Usar o padrão da definição</option>
                    <option value="value">Valor do projeto</option>
                    <option value="empty">Vazio explícito</option>
                  </select>
                </label>
                {projectEdit.mode === 'value' && (
                  <ValueInput
                    definition={definition}
                    label={'Valor de ' + label + ' no projeto'}
                    text={projectEdit.text ?? ''}
                    onChange={(text) =>
                      setValue('projectValues', definition.id, {
                        mode: 'value',
                        text,
                      })
                    }
                  />
                )}
              </div>
            )}
            {allowsSheet(definition.scope) && (
              <div className="template-fields">
                <label className="template-field">
                  <span>{'Valor nas folhas selecionadas para ' + label}</span>
                  <select
                    disabled={!sheets.length}
                    value={sheetEdit.mode}
                    onChange={(event) =>
                      setValue('sheetValues', definition.id, {
                        ...sheetEdit,
                        mode: event.target.value as PropertyValueMode,
                      })
                    }
                  >
                    <option value="keep">Manter como está</option>
                    <option value="inherit">
                      {allowsProject(definition.scope)
                        ? 'Herdar do projeto'
                        : 'Usar o padrão da definição'}
                    </option>
                    <option value="value">Valor local</option>
                    <option value="empty">Vazio explícito</option>
                  </select>
                </label>
                {sheetEdit.mode === 'keep' && sheetStates.size > 1 && (
                  <small>Valores mistos</small>
                )}
                {sheetEdit.mode === 'value' && (
                  <ValueInput
                    definition={definition}
                    label={'Valor local de ' + label}
                    text={sheetEdit.text ?? ''}
                    onChange={(text) =>
                      setValue('sheetValues', definition.id, {
                        mode: 'value',
                        text,
                      })
                    }
                  />
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                update({
                  definitions: draft.definitions.filter(
                    (item) => item.id !== definition.id,
                  ),
                })
              }
            >
              {'Excluir ' + label}
            </button>
          </details>
        );
      })}
      {removed.map((item) => {
        const usage = sealPropertyUsage(base, item.id);
        const candidates = draft.definitions.filter(
          (next) => next.type === item.type,
        );
        return (
          <div key={item.id} className="template-fields">
            <p className="template-alert" role="status">
              {`“${item.name}” será excluída.`}
              {usage.fields.length ||
              usage.projectValue ||
              usage.sheetValues.length
                ? ` Em uso: ${describeSealPropertyUsage(usage)}. Os valores serão descartados.`
                : ' Não há campos nem valores dependentes.'}
            </p>
            {usage.fields.length > 0 && (
              <label className="template-field">
                <span>{'Substituta de ' + item.name}</span>
                <select
                  value={draft.remaps.get(item.id) ?? ''}
                  onChange={(event) => {
                    const remaps = new Map(draft.remaps);
                    if (event.target.value)
                      remaps.set(item.id, event.target.value);
                    else remaps.delete(item.id);
                    update({ remaps });
                  }}
                >
                  <option value="">Escolha (obrigatório para excluir)</option>
                  {candidates.map((next) => (
                    <option key={next.id} value={next.id}>
                      {next.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                const remaps = new Map(draft.remaps);
                remaps.delete(item.id);
                update({
                  definitions: [...draft.definitions, structuredClone(item)],
                  remaps,
                });
              }}
            >
              {'Manter ' + item.name}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          update({
            definitions: [
              ...draft.definitions,
              {
                id: uid(),
                name: newSealPropertyName(
                  draft.definitions,
                  'Nova propriedade',
                ),
                type: 'text',
                scope: 'project-sheet',
              },
            ],
          })
        }
      >
        Nova propriedade
      </button>
    </fieldset>
  );
}
