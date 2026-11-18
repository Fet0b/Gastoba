import type { EstadoDoOlho } from "../Olho/Olho";
import { BarraDeAbas } from "./BarraDeAbas";
import { BarraLateral } from "./BarraLateral";
import type { Navegacao as DadosDaNavegacao } from "./telas";
import { useLayoutCompleto, useLayoutLargo } from "./useLayoutLargo";

type Propriedades = {
  navegacao: DadosDaNavegacao;
  estadoDoOlho: EstadoDoOlho;
};

/**
 * A navegação do app: barra lateral completa a partir de 64rem, recolhida (só ícones) de 45rem a
 * 64rem e barra de abas abaixo disso. A troca é feita aqui, em JS, para que só uma das duas esteja
 * no DOM.
 */
export function Navegacao({ navegacao, estadoDoOlho }: Propriedades) {
  const largo = useLayoutLargo();
  const completo = useLayoutCompleto();
  return largo ? (
    <BarraLateral navegacao={navegacao} estadoDoOlho={estadoDoOlho} recolhida={!completo} />
  ) : (
    <BarraDeAbas navegacao={navegacao} />
  );
}
