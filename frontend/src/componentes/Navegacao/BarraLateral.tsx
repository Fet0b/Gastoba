import { useRef } from "react";

import { iniciaisDe } from "../../pessoa/iniciais";
import { Badge } from "../Badge/Badge";
import { Icone } from "../Icone/Icone";
import { type EstadoDoOlho, Olho } from "../Olho/Olho";
import { useSeguirCursor } from "../Olho/useSeguirCursor";
import estilos from "./Navegacao.module.css";
import { type Navegacao, TELAS } from "./telas";

type Propriedades = {
  navegacao: Navegacao;
  estadoDoOlho: EstadoDoOlho;
  /** Só ícones (de 45rem a 64rem): o nome some da vista, mas segue como nome acessível e dica. */
  recolhida?: boolean;
};

/**
 * Barra lateral do computador: a marca, as telas e, no rodapé, a pessoa conectada com o atalho do
 * Perfil. Recolhida, mostra só os ícones, com o nome em `aria-label` e numa dica ao passar o mouse
 * ou focar.
 */
export function BarraLateral({ navegacao, estadoDoOlho, recolhida = false }: Propriedades) {
  const olho = useRef<SVGSVGElement>(null);
  useSeguirCursor(olho);

  return (
    <aside className={estilos.lateral} data-recolhida={recolhida ? "" : undefined}>
      <div className={estilos.marca}>
        <Olho ref={olho} decorativo estado={estadoDoOlho} className={estilos.olho} />
        <h1 className={estilos.nomeDaMarca}>Gastoba</h1>
      </div>

      <nav className={estilos.telasDaLateral} aria-label="Telas">
        {TELAS.filter(({ tela }) => tela !== "perfil").map(({ tela, nome, icone, emBreve }) => (
          <button
            key={tela}
            type="button"
            className={estilos.itemDaLateral}
            aria-label={emBreve || recolhida ? nome : undefined}
            data-rotulo={recolhida ? nome : undefined}
            aria-describedby={emBreve ? `em-breve-${tela}` : undefined}
            aria-current={navegacao.tela === tela ? "page" : undefined}
            onClick={() => navegacao.aoIrPara(tela)}
          >
            <Icone nome={icone} tamanho={20} />
            <span className={estilos.rotuloDoItem}>{nome}</span>
            {emBreve && !recolhida && (
              <span id={`em-breve-${tela}`} className={estilos.emBreve}>
                <Badge>em breve</Badge>
              </span>
            )}
          </button>
        ))}

        <button
          type="button"
          className={estilos.rodape}
          data-rodape=""
          aria-label="Perfil"
          data-rotulo={recolhida ? "Perfil" : undefined}
          aria-current={navegacao.tela === "perfil" ? "page" : undefined}
          onClick={() => navegacao.aoIrPara("perfil")}
        >
          <span className={estilos.avatar} data-avatar="" aria-hidden="true">
            {iniciaisDe(navegacao.nomeDaPessoa)}
          </span>
          <span className={estilos.nomeDoRodape} aria-hidden="true">
            {navegacao.nomeDaPessoa}
          </span>
          <span className={estilos.irParaPerfil} aria-hidden="true">
            Perfil ›
          </span>
        </button>
      </nav>

      <p className={estilos.apenasLeitor}>
        Conectado como {navegacao.nomeDaPessoa}
      </p>
    </aside>
  );
}
