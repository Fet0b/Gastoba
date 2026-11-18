import type { FocusEventHandler, Ref } from "react";

import estilos from "./SeletorDoTema.module.css";

export type OpcaoDoSeletor = {
  valor: string;
  rotulo: string;
  /** Cor da bolinha mostrada ao lado quando esta opção está escolhida. */
  cor?: string;
};

type Propriedades = {
  /** Nome acessível (o rótulo visual, quando há, fica fora do seletor). */
  rotulo: string;
  valor: string;
  opcoes: readonly OpcaoDoSeletor[];
  /** Texto da opção vazia ("Categoria…"); sem ele, não há opção vazia. */
  vazio?: string;
  aoMudar: (valor: string) => void;
  aoSair?: FocusEventHandler<HTMLSelectElement>;
  /** Frase curta do erro, mostrada embaixo; liga a borda vermelha. */
  erro?: string;
  idDoErro?: string;
  ref?: Ref<HTMLSelectElement>;
};

/**
 * Um `<select>` nativo com a aparência do tema: o menu de opções é o do navegador (teclado e leitor
 * de tela de graça), a caixa é nossa, e a bolinha da cor da opção escolhida fica ao lado do nome.
 */
export function SeletorDoTema({
  rotulo,
  valor,
  opcoes,
  vazio,
  aoMudar,
  aoSair,
  erro,
  idDoErro,
  ref,
}: Propriedades) {
  const escolhida = opcoes.find((opcao) => opcao.valor === valor);
  return (
    <div className={estilos.campo}>
      <div className={estilos.caixa} data-invalido={erro ? "" : undefined}>
        <span
          className={estilos.ponto}
          data-ponto=""
          aria-hidden="true"
          style={escolhida?.cor === undefined ? undefined : { backgroundColor: escolhida.cor }}
          data-vazio={escolhida?.cor === undefined ? "" : undefined}
        />
        <select
          ref={ref}
          className={estilos.seletor}
          aria-label={rotulo}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idDoErro : undefined}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          onBlur={aoSair}
        >
          {vazio !== undefined && <option value="">{vazio}</option>}
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </div>
      {erro && (
        <p id={idDoErro} className={estilos.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
