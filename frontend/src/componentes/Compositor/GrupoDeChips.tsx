import { type Ref, useId } from "react";

import { Icone } from "../Icone/Icone";
import estilos from "./GrupoDeChips.module.css";

export type OpcaoDeChip = {
  valor: string;
  nome: string;
  /** Cor do ponto; sem ela, o chip não tem ponto. A cor nunca substitui o nome. */
  cor?: string;
};

type Propriedades = {
  rotulo: string;
  opcoes: readonly OpcaoDeChip[] | undefined;
  /** Valor escolhido; `null` enquanto nenhum foi escolhido (não há padrão). */
  valor: string | null;
  aoMudar: (valor: string) => void;
  erro?: string;
  carregando?: string;
  /** Recebe a primeira opção (para levar o foco ao grupo). */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Grupo de opções (radio) em chips: ponto colorido opcional, nome em texto e, na escolhida,
 * um marcador de check. Sem opção marcada por padrão; as setas trocam de opção.
 */
export function GrupoDeChips({ rotulo, opcoes, valor, aoMudar, erro, carregando, ref }: Propriedades) {
  const id = useId();
  const idRotulo = `${id}-rotulo`;
  const idErro = `${id}-erro`;

  return (
    <div className={estilos.campo}>
      <span id={idRotulo} className={estilos.rotulo}>
        {rotulo}
      </span>
      <div
        role="radiogroup"
        className={estilos.opcoes}
        aria-labelledby={idRotulo}
        aria-required="true"
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? idErro : undefined}
      >
        {opcoes === undefined ? (
          <p className={estilos.carregando}>{carregando ?? "Carregando…"}</p>
        ) : (
          opcoes.map((opcao, indice) => (
            <label key={opcao.valor} className={estilos.opcao}>
              <input
                ref={indice === 0 ? ref : undefined}
                type="radio"
                name={id}
                value={opcao.valor}
                checked={valor === opcao.valor}
                onChange={() => aoMudar(opcao.valor)}
                className={estilos.radio}
              />
              {opcao.cor !== undefined && (
                <span
                  className={estilos.ponto}
                  style={{ backgroundColor: opcao.cor }}
                  data-cor={opcao.cor}
                  aria-hidden="true"
                />
              )}
              <span>{opcao.nome}</span>
              <span className={estilos.check} aria-hidden="true">
                <Icone nome="ok" tamanho={14} />
              </span>
            </label>
          ))
        )}
      </div>
      {erro && (
        <p id={idErro} className={estilos.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
