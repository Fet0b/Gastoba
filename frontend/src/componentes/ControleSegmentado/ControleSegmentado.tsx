import { useId } from "react";

import estilos from "./ControleSegmentado.module.css";

export type OpcaoSegmentada<T extends string> = {
  valor: T;
  rotulo: string;
  /** Nome acessível da opção quando o texto visível é curto demais ("R$"). */
  nomeAcessivel?: string;
};

type Propriedades<T extends string> = {
  /** Nome do grupo para leitores de tela: "Tipo da parte 1". */
  nome: string;
  opcoes: readonly OpcaoSegmentada<T>[];
  valor: T;
  aoMudar: (valor: T) => void;
  /** Menor, para dentro de campos. */
  compacto?: boolean;
};

/**
 * Poucas opções lado a lado, uma sempre escolhida (um grupo de radio com cara de botões): setas
 * trocam a opção e Tab leva ao próximo campo. A escolhida fica em Lavanda e traz um marcador em
 * texto no leitor de tela; a cor nunca é a única pista.
 */
export function ControleSegmentado<T extends string>({
  nome,
  opcoes,
  valor,
  aoMudar,
  compacto = false,
}: Propriedades<T>) {
  const grupo = useId();
  return (
    <div className={estilos.grupo} role="radiogroup" aria-label={nome} data-compacto={compacto ? "" : undefined}>
      {opcoes.map((opcao) => (
        <label key={opcao.valor} className={estilos.opcao}>
          <input
            type="radio"
            className={estilos.radio}
            name={grupo}
            value={opcao.valor}
            checked={opcao.valor === valor}
            aria-label={opcao.nomeAcessivel}
            onChange={() => aoMudar(opcao.valor)}
          />
          <span className={estilos.texto}>{opcao.rotulo}</span>
        </label>
      ))}
    </div>
  );
}
