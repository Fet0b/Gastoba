import { useEffect, useRef } from "react";

import estilos from "./Aviso.module.css";

/** Quanto tempo uma confirmação fica na tela, em ms. */
export const DURACAO_DA_CONFIRMACAO = 4000;

export type MensagemDoAviso = {
  tipo: "confirmacao" | "erro";
  texto: string;
};

// Número de cada mensagem recebida (pela identidade do objeto), usado como
// `key` do texto anunciado.
const numeros = new WeakMap<MensagemDoAviso, number>();
let ultimoNumero = 0;

function numeroDa(mensagem: MensagemDoAviso): number {
  let numero = numeros.get(mensagem);
  if (numero === undefined) {
    numero = ++ultimoNumero;
    numeros.set(mensagem, numero);
  }
  return numero;
}

type Propriedades = {
  /** `null` esvazia o aviso; a região aria-live continua montada. */
  mensagem: MensagemDoAviso | null;
  /** Chamada quando a confirmação expira ou a pessoa dispensa o erro. */
  aoDispensar: () => void;
};

/**
 * Avisos de confirmação e de erro, anunciados por uma região `aria-live`
 * educada, sempre montada (uma região criada junto com o texto pode não ser
 * anunciada). A confirmação some sozinha; o erro fica até ser dispensado.
 * Quem mostra a mensagem cria um objeto novo a cada aviso: o mesmo objeto
 * num novo render não é reanunciado, um objeto novo com o mesmo texto é.
 */
export function Aviso({ mensagem, aoDispensar }: Propriedades) {
  // O prazo recomeça a cada mensagem nova, não a cada render do pai: a
  // função mais recente fica numa ref, fora das dependências do efeito.
  const dispensar = useRef(aoDispensar);
  useEffect(() => {
    dispensar.current = aoDispensar;
  });

  useEffect(() => {
    if (mensagem?.tipo !== "confirmacao") return;
    const prazo = setTimeout(() => dispensar.current(), DURACAO_DA_CONFIRMACAO);
    return () => clearTimeout(prazo);
  }, [mensagem]);

  return (
    <div className={estilos.aviso} data-tipo={mensagem?.tipo}>
      <div className={estilos.texto} aria-live="polite" aria-atomic="true">
        {/* Cada mensagem nova é um nó novo: o leitor de tela anuncia de novo
            mesmo quando o texto se repete (dois "Gasto registrado." seguidos). */}
        {mensagem && <span key={numeroDa(mensagem)}>{mensagem.texto}</span>}
      </div>
      {mensagem?.tipo === "erro" && (
        <button type="button" className={estilos.dispensar} onClick={aoDispensar}>
          Dispensar
        </button>
      )}
    </div>
  );
}
