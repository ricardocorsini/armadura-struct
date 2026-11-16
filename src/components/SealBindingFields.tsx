import type { TemplateSealBinding } from '../domain/sealFieldSchema';
import { sealFieldCatalog } from '../domain/sealFields';
import {
  sealPropertyTypes,
  type SealPropertyDefinition,
} from '../domain/sealProperties';

const PROPERTY = 'prop:';

/** Select value for a binding: a native token or `prop:<id>`. */
export function sealBindingToken(binding?: TemplateSealBinding | null) {
  if (!binding) return '';
  return binding.property !== undefined
    ? PROPERTY + binding.property
    : (binding.field ?? '');
}

/** Replaces the data source keeping prefix and suffix. */
export function sealBindingFromToken(
  token: string,
  current?: TemplateSealBinding | null,
): TemplateSealBinding | undefined {
  if (!token) return undefined;
  const affixes = {
    ...(current?.prefix ? { prefix: current.prefix } : {}),
    ...(current?.suffix ? { suffix: current.suffix } : {}),
  };
  return token.startsWith(PROPERTY)
    ? { property: token.slice(PROPERTY.length), ...affixes }
    : { field: token, ...affixes };
}

export function SealBindingOptions({
  token,
  properties,
}: {
  token: string;
  properties: readonly SealPropertyDefinition[];
}) {
  const unknownNative =
    !!token &&
    !token.startsWith(PROPERTY) &&
    !Object.hasOwn(sealFieldCatalog, token);
  const unknownProperty =
    token.startsWith(PROPERTY) &&
    !properties.some((item) => PROPERTY + item.id === token);
  return (
    <>
      <option value="">Texto estático</option>
      {(unknownNative || unknownProperty) && (
        <option value={token}>
          {unknownProperty
            ? 'Propriedade inexistente (escolha outra)'
            : token + ' (desconhecido)'}
        </option>
      )}
      <optgroup label="Campos nativos">
        {Object.entries(sealFieldCatalog).map(([key, item]) => (
          <option key={key} value={key}>
            {item.label + ' (' + key + ')'}
          </option>
        ))}
      </optgroup>
      <optgroup label="Propriedades personalizadas">
        {properties.map((item) => (
          <option key={item.id} value={PROPERTY + item.id}>
            {item.name + ' · ' + sealPropertyTypes[item.type]}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export function SealAffixFields({
  label,
  binding,
  onChange,
}: {
  label: string;
  binding: TemplateSealBinding;
  onChange: (binding: TemplateSealBinding) => void;
}) {
  const set = (key: 'prefix' | 'suffix', text: string) => {
    const next = { ...binding };
    if (text) next[key] = text;
    else delete next[key];
    onChange(next);
  };
  return (
    <div className="template-fields">
      <label className="template-field">
        <span>{'Prefixo de ' + label}</span>
        <input
          value={binding.prefix ?? ''}
          maxLength={100}
          onChange={(event) => set('prefix', event.target.value)}
        />
      </label>
      <label className="template-field">
        <span>{'Sufixo de ' + label}</span>
        <input
          value={binding.suffix ?? ''}
          maxLength={100}
          onChange={(event) => set('suffix', event.target.value)}
        />
      </label>
    </div>
  );
}
