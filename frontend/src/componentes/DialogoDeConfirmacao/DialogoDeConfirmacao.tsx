import { type RefObject, useEffect, useId, useRef } from "react";

import { Dialogo } from "../Dialogo/Dialogo";
import { Botao } from "../Botao/Botao";

import estilos from "./DialogoDeConfirmacao.module.css";

type Propriedades = {
  aberto: boolean;
  /** "Excluir o ganho Salário?" */
  titulo: string;
  /** A consequência, em uma frase. */
  descricao?: string;
  /** "Confirmar exclusão" */
  rotuloDaAcao: string;
  pendente?: boolean;
  /** Mensagem da API, mostrada dentro do diálogo. */
  erro?: string;
  /** A ação não pode ser feita: o botão fica desabilitado e aponta para a descrição, que diz o motivo. */
  acaoDesabilitada?: boolean;
  aoConfirmar: () => void;
  aoCancelar: () => void;
  /** Para onde o foco volta ao fechar; padrão: o elemento focado ao abrir, se ainda estiver no DOM. */
  devolverFocoPara?: RefObject<HTMLElement | null>;
};

/** Confirmação de ação destrutiva: foco inicial em Cancelar, Esc cancela, foco volta ao fechar. */
export function DialogoDeConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloDaAcao,
  pendente = false,
  erro,
  acaoDesabilitada = false,
  aoConfirmar,
  aoCancelar,
  devolverFocoPara,
}: Propriedades) {
  const idDaDescricao=useId();
  const cancelar=useRef<HTMLButtonElement>(null);
  // Depois de uma recusa o botão da ação perde o foco ao ficar desabilitado: ele vai ao Cancelar, nunca ao body.
  useEffect(()=>{ if(aberto&&erro!==undefined) cancelar.current?.focus(); },[aberto,erro]);
  return <Dialogo aberto={aberto} titulo={titulo} aoFechar={aoCancelar} bloqueado={pendente} focoInicial={cancelar} devolverFocoPara={devolverFocoPara} descricaoId={descricao!==undefined?idDaDescricao:undefined} rodape={<><Botao variante="secundario" ref={cancelar} disabled={pendente} onClick={aoCancelar}>Cancelar</Botao><Botao variante="destrutivo" disabled={pendente||acaoDesabilitada} aria-describedby={acaoDesabilitada&&descricao!==undefined?idDaDescricao:undefined} onClick={aoConfirmar}>{rotuloDaAcao}</Botao></>}>
  {descricao!==undefined&&<p id={idDaDescricao} className={estilos.descricao}>{descricao}</p>}{erro!==undefined&&<p role="alert" className={estilos.erro}>{erro}</p>}
  </Dialogo>;
}
