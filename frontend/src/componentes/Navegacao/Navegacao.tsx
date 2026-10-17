import type { EstadoDoOlho } from "../Olho/Olho";
import { BarraDeAbas } from "./BarraDeAbas";
import { BarraLateral } from "./BarraLateral";
import type { Navegacao as DadosDaNavegacao } from "./telas";
import { useLayoutLargo } from "./useLayoutLargo";

type Propriedades = {
  navegacao: DadosDaNavegacao;
  estadoDoOlho: EstadoDoOlho;
};

/**
 * A navegação do app: barra lateral no computador, barra de abas no celular.
 * A troca é feita aqui, em JS, para que só uma das duas esteja no DOM.
 */
export function Navegacao({ navegacao, estadoDoOlho }: Propriedades) {
  const largo = useLayoutLargo();
  return largo ? (
    <BarraLateral navegacao={navegacao} estadoDoOlho={estadoDoOlho} />
  ) : (
    <BarraDeAbas navegacao={navegacao} />
  );
}
