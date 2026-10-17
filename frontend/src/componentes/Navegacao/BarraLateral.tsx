import { useRef } from "react";

import { Icone } from "../Icone/Icone";
import { type EstadoDoOlho, Olho } from "../Olho/Olho";
import { useSeguirCursor } from "../Olho/useSeguirCursor";
import estilos from "./Navegacao.module.css";
import { type Navegacao, TELAS } from "./telas";

type Propriedades = {
  navegacao: Navegacao;
  estadoDoOlho: EstadoDoOlho;
};

/** Barra lateral do computador: a marca, as oito telas e o nome de quem está conectado. */
export function BarraLateral({ navegacao, estadoDoOlho }: Propriedades) {
  const olho = useRef<SVGSVGElement>(null);
  useSeguirCursor(olho);

  return (
    <aside className={estilos.lateral}>
      <div className={estilos.marca}>
        <Olho ref={olho} decorativo estado={estadoDoOlho} className={estilos.olho} />
        <h1 className={estilos.nomeDaMarca}>Gastoba</h1>
      </div>

      <nav className={estilos.telasDaLateral} aria-label="Telas">
        {TELAS.map(({ tela, nome, icone }) => (
          <button
            key={tela}
            type="button"
            className={estilos.itemDaLateral}
            aria-current={navegacao.tela === tela ? "page" : undefined}
            onClick={() => navegacao.aoIrPara(tela)}
          >
            <Icone nome={icone} tamanho={20} />
            {nome}
          </button>
        ))}
      </nav>

      <p className={estilos.pessoa}>
        <span className={estilos.apenasLeitor}>Conectado como </span>
        {navegacao.nomeDaPessoa}
      </p>
    </aside>
  );
}
