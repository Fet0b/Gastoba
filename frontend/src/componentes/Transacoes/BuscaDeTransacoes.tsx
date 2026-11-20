import { type RefObject, useRef } from "react";

import { Botao } from "../Botao/Botao";
import { CampoDeTexto } from "../Campo/CampoDeTexto";
import estilos from "./BuscaDeTransacoes.module.css";

type Propriedades = {
  valor: string;
  aoMudar: (texto: string) => void;
  /** Para a página focar o campo com a tecla "/". */
  campoRef?: RefObject<HTMLInputElement | null>;
};

/** A lupa, local a este campo (não faz parte do mapa de ícones compartilhado). */
function IconeDeBusca() {
  return (
    <svg
      className={estilos.lupa}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

/** Campo de busca por descrição e tag, com o botão de limpar (que devolve o foco ao campo). */
export function BuscaDeTransacoes({ valor, aoMudar, campoRef }: Propriedades) {
  const interno = useRef<HTMLInputElement>(null);
  const campo = campoRef ?? interno;

  return (
    <div className={estilos.busca}>
      <IconeDeBusca />
      <CampoDeTexto
        ref={campo}
        className={estilos.campo}
        tipo="search"
        rotulo="Buscar transações"
        placeholder="Buscar por descrição ou tag (tecla /)"
        aria-keyshortcuts="/"
        autoComplete="off"
        valor={valor}
        aoMudar={aoMudar}
      />
      {valor !== "" && (
        <Botao
          variante="terciario"
          className={estilos.limpar}
          aria-label="Limpar busca"
          onClick={() => {
            aoMudar("");
            campo.current?.focus();
          }}
        >
          Limpar
        </Botao>
      )}
    </div>
  );
}
