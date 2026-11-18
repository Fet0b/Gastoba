import { type RefObject, useId, useRef } from "react";

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
  aoConfirmar,
  aoCancelar,
  devolverFocoPara,
}: Propriedades) {
  const idDaDescricao=useId();
  const cancelar=useRef<HTMLButtonElement>(null);
  return <Dialogo aberto={aberto} titulo={titulo} aoFechar={aoCancelar} bloqueado={pendente} focoInicial={cancelar} devolverFocoPara={devolverFocoPara} descricaoId={descricao!==undefined?idDaDescricao:undefined} rodape={<><Botao variante="secundario" ref={cancelar} disabled={pendente} onClick={aoCancelar}>Cancelar</Botao><Botao variante="destrutivo" disabled={pendente} onClick={aoConfirmar}>{rotuloDaAcao}</Botao></>}>
  {descricao!==undefined&&<p id={idDaDescricao} className={estilos.descricao}>{descricao}</p>}{erro!==undefined&&<p role="alert" className={estilos.erro}>{erro}</p>}
  </Dialogo>;
}
