import { useId } from "react";

import type { AlvoDaMeta } from "../../api/tipos";
import { corDaCategoria } from "../../categorias/cores";
import { Dica } from "../Dica/Dica";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { EditorDaMeta } from "./EditorDaMeta";
import { EXPLICACAO_DA_LIBERDADE_FINANCEIRA } from "./liberdadeFinanceira";
import estilos from "./Metas.module.css";

type Propriedades = {
  categoria: AlvoDaMeta;
  percentual: number | undefined;
  renda: string;
  somaDasOutras: number;
  aoSalvar: (percentual: number) => Promise<void>;
  /** Abre a confirmação de remoção; só existe quando a categoria já tem meta. */
  aoPedirRemocao: () => void;
  erro?: string;
  salvando: boolean;
};

/** A categoria no modo de edição: nome, o menu "Mais ações da meta X" (com meta) e o editor. */
export function LinhaDeEdicaoDaMeta({
  categoria,
  percentual,
  renda,
  somaDasOutras,
  aoSalvar,
  aoPedirRemocao,
  erro,
  salvando,
}: Propriedades) {
  const idDoNome = useId();
  return (
    <li className={estilos.linhaDeEdicao} aria-labelledby={idDoNome}>
      <div className={estilos.cabecalhoDeEdicao}>
        <span className={estilos.nomeEDica}>
          <span id={idDoNome} className={estilos.nomeDaMeta}>
            <span
              className={estilos.ponto}
              style={{ backgroundColor: corDaCategoria(categoria.codigo) }}
              aria-hidden="true"
            />
            <span>{categoria.nome}</span>
          </span>
          {categoria.codigo === "liberdade_financeira" && (
            <Dica assunto="a Liberdade financeira">{EXPLICACAO_DA_LIBERDADE_FINANCEIRA}</Dica>
          )}
        </span>
        {percentual !== undefined && (
          <MenuDeAcoes
            rotulo={`Mais ações da meta ${categoria.nome}`}
            itens={[
              {
                rotulo: "Remover meta",
                nomeAcessivel: `Remover a meta de ${categoria.nome}`,
                destrutivo: true,
                aoEscolher: aoPedirRemocao,
              },
            ]}
          />
        )}
      </div>
      <EditorDaMeta
        categoria={categoria}
        percentual={percentual}
        renda={renda}
        somaDasOutras={somaDasOutras}
        aoSalvar={aoSalvar}
        erro={erro}
        salvando={salvando}
      />
    </li>
  );
}
