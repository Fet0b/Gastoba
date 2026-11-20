import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { paraCaminho } from "../../navegacao/rota";
import type { Navegacao, Tela } from "./telas";

type Propriedades = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  tela: Tela;
  navegacao: Navegacao;
  /** Roda depois de a navegação ser pedida (a folha "Mais" se fecha). */
  aoNavegar?: () => void;
};

/**
 * O item do menu: um link de verdade (`<a href>`), para abrir em outra aba e para o leitor de tela
 * dizer "link". O clique simples navega sem recarregar; com Ctrl, Cmd, Shift ou o botão do meio o
 * navegador cuida.
 */
export function LinkDaTela({ tela, navegacao, aoNavegar, children, ...resto }: Propriedades) {
  function aoClicar(evento: MouseEvent<HTMLAnchorElement>): void {
    if (evento.defaultPrevented || evento.button !== 0) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    navegacao.aoIrPara(tela);
    aoNavegar?.();
  }
  return (
    <a {...resto} href={paraCaminho(tela)} onClick={aoClicar}>
      {children}
    </a>
  );
}
