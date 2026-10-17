import { useId, useRef } from "react";

import estilos from "./BuscaDeTransacoes.module.css";

type Propriedades = {
  valor: string;
  aoMudar: (texto: string) => void;
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
export function BuscaDeTransacoes({ valor, aoMudar }: Propriedades) {
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);

  return (
    <div className={estilos.busca}>
      <label htmlFor={id} className="visualmente-oculto">
        Buscar transações
      </label>
      <IconeDeBusca />
      <input
        ref={campo}
        id={id}
        type="search"
        className={estilos.campo}
        placeholder="Buscar por descrição ou tag"
        autoComplete="off"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
      />
      {valor !== "" && (
        <button
          type="button"
          className={estilos.limpar}
          aria-label="Limpar busca"
          onClick={() => {
            aoMudar("");
            campo.current?.focus();
          }}
        >
          Limpar
        </button>
      )}
    </div>
  );
}
