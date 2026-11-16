import { useId, useState } from 'react';
import {
  sealPropertyScopes,
  sealPropertyTypes,
  type SealPropertyDefinition,
  type SealPropertyImportDecision,
  type SealPropertyImportItem,
} from '../domain/sealProperties';

const statusLabels = {
  identical: 'Mesma propriedade',
  confirmed: 'Associação confirmada',
  conflict: 'Conflito',
  homonym: 'Nome coincidente',
  new: 'Nova',
} as const;

const describe = (item: SealPropertyDefinition) =>
  `${sealPropertyTypes[item.type]} · ${sealPropertyScopes[item.scope]}`;

/**
 * Shows the proposed mapping of template properties before anything is
 * recorded. Names never decide on their own: the person chooses to create an
 * independent definition or to associate a compatible existing one.
 */
export default function SealPropertyImportPanel({
  plan,
  locals,
  onConfirm,
  onCancel,
}: {
  plan: SealPropertyImportItem[];
  locals: readonly SealPropertyDefinition[];
  onConfirm: (decisions: Map<string, SealPropertyImportDecision>) => void;
  onCancel: () => void;
}) {
  const heading = useId();
  const [decisions, setDecisions] = useState(
    () =>
      new Map(plan.map((item) => [item.external.id, item.proposal] as const)),
  );
  const set = (id: string, decision: SealPropertyImportDecision) =>
    setDecisions((current) => new Map(current).set(id, decision));
  return (
    <section className="template-calibration" aria-labelledby={heading}>
      <h3 id={heading}>Propriedades do modelo importado</h3>
      <p className="template-hint">
        Confira o mapeamento antes de continuar. Nomes iguais não são associados
        automaticamente, e nenhum valor local é substituído.
      </p>
      <ul className="template-impact" aria-label="Mapeamento proposto">
        {plan.map((item) => {
          const decision = decisions.get(item.external.id)!;
          const value =
            decision.kind === 'map' ? 'map:' + decision.to : 'create';
          return (
            <li key={item.external.id}>
              <strong>{item.external.name}</strong>
              {' · ' + describe(item.external)}
              {' · ' + statusLabels[item.status]}
              <br />
              <small>{item.message}</small>
              <div className="template-fields">
                <label className="template-field">
                  <span>{'Destino de ' + item.external.name}</span>
                  <select
                    value={value}
                    onChange={(event) => {
                      const next = event.target.value;
                      set(
                        item.external.id,
                        next === 'create'
                          ? {
                              kind: 'create',
                              name:
                                item.proposal.kind === 'create'
                                  ? item.proposal.name
                                  : item.external.name,
                            }
                          : { kind: 'map', to: next.slice(4) },
                      );
                    }}
                  >
                    <option value="create">
                      Criar propriedade independente
                    </option>
                    {item.candidates.map((local) => (
                      <option key={local.id} value={'map:' + local.id}>
                        {'Associar a ' + local.name}
                      </option>
                    ))}
                    {decision.kind === 'map' &&
                      !item.candidates.some((c) => c.id === decision.to) && (
                        <option value={value}>
                          {'Associar a ' +
                            (locals.find((l) => l.id === decision.to)?.name ??
                              'propriedade removida')}
                        </option>
                      )}
                  </select>
                </label>
                {decision.kind === 'create' && (
                  <label className="template-field">
                    <span>
                      {'Nome da nova propriedade ' + item.external.name}
                    </span>
                    <input
                      value={decision.name}
                      maxLength={80}
                      onChange={(event) =>
                        set(item.external.id, {
                          kind: 'create',
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="template-buttons">
        <button type="button" onClick={onCancel}>
          Cancelar importação
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => onConfirm(decisions)}
        >
          Confirmar mapeamento
        </button>
      </div>
    </section>
  );
}
