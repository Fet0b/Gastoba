import { type CSSProperties, type RefObject, useState } from "react";

import type { Categoria, Conta, Ganho } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { rotuloDoDia } from "../../periodo/periodo";
import {
  agruparPorDia,
  fatiaDaPagina,
  type TransacaoDaLinha,
} from "../../transacoes/linhaDoTempo";
import { subtotalDoDia } from "../../transacoes/subtotalDoDia";
import { Botao } from "../Botao/Botao";
import { useExcluirGanho } from "./AcaoDeExcluirGanho";
import { LinhaDeTransacao } from "./LinhaDeTransacao";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./LinhaDoTempo.module.css";
import { textoDaConta } from "../../contas/identificacao";

type Propriedades = {
  /** Já unidas, filtradas e ordenadas (mais recentes primeiro). */
  transacoes: readonly TransacaoDaLinha[];
  podeDesfazerClassificacao?: boolean;
  aoDesfazerClassificacao?: () => void;
  contas: Conta[] | undefined;
  categorias: Categoria[] | undefined;
  /** Exclui o ganho; devolve `true` se deu certo. */
  aoExcluirGanho: (ganho: Ganho) => Promise<boolean>;
  /** Para onde o foco vai depois de excluir um ganho (a linha some e levaria o foco junto). */
  focoAposExcluir?: RefObject<HTMLElement | null>;
  /** Quando este texto muda (mês, filtros, busca), a paginação volta às 100 primeiras. */
  reiniciarQuando?: string;
  /** Clicar na categoria ou numa tag da linha liga o filtro dela (se já está ligado, desliga). */
  aoAlternarCategoria?: (codigo: string) => void;
  aoAlternarTag?: (tag: string) => void;
  categoriasAtivas?: readonly string[];
  tagsAtivas?: readonly string[];
};

type PropriedadesDaLinha = Omit<Parameters<typeof LinhaDeTransacao>[0], "itensDoMenu" | "dialogos"> & {
  aoExcluirGanho: Propriedades["aoExcluirGanho"];
  focoAposExcluir?: Propriedades["focoAposExcluir"];
};

/** Uma linha com a exclusão de ganho (item do menu e diálogo), que só o ganho avulso tem. */
function LinhaComExclusao({ aoExcluirGanho, focoAposExcluir, ...resto }: PropriedadesDaLinha) {
  const ganho = resto.transacao.tipo === "ganho" && !resto.transacao.transacao_importada_id ? resto.transacao : null;
  const { item, dialogo } = useExcluirGanho(ganho, aoExcluirGanho, focoAposExcluir);
  return <LinhaDeTransacao {...resto} itensDoMenu={item ? [item] : []} dialogos={dialogo} />;
}

/** Cabeçalho do dia: o nome do dia e, à direita, o que entrou menos o que saiu, com sinal e tom. */
function SubtotalDoDia({ data, transacoes }: { data: string; transacoes: readonly TransacaoDaLinha[] }) {
  const subtotal = subtotalDoDia(transacoes);
  const centavos = paraCentavos(subtotal);
  const tom = centavos > 0n ? "positivo" : centavos < 0n ? "negativo" : "neutro";
  return (
    <div className={estilos.cabecalhoDoDia} data-cabecalho-do-dia="">
      <Titulo nivel="cartao" como="h3" className={estilos.rotuloDoDia}>{rotuloDoDia(data)}</Titulo>
      <span className={estilos.subtotal} data-subtotal="" data-tom={tom}>
        <span>Total do dia</span>
        <span data-subtotal-valor="">{centavos > 0n ? `+${formatar(subtotal)}` : formatar(subtotal)}</span>
      </span>
      <span className={estilos.acoesReservada} data-acoes-reservada="" aria-hidden="true" />
    </div>
  );
}

/**
 * A linha do tempo única: gastos e ganhos agrupados por dia ("Hoje", "Ontem", "Sexta, 3 de
 * outubro"), de 100 em 100 com "Mostrar mais". Quem usa muda `reiniciarQuando` quando os filtros
 * mudam, para a paginação voltar ao começo sem remontar a lista.
 */
export function LinhaDoTempo({
  transacoes,
  podeDesfazerClassificacao = false,
  aoDesfazerClassificacao,
  contas,
  categorias,
  aoExcluirGanho,
  focoAposExcluir,
  aoAlternarCategoria,
  aoAlternarTag,
  categoriasAtivas,
  tagsAtivas,
  reiniciarQuando = "",
}: Propriedades) {
  const [paginas, definirPaginas] = useState(1);
  // Sem remontar a lista (os dias que continuam não animam de novo): zera durante a renderização.
  const [chaveAnterior, definirChaveAnterior] = useState(reiniciarQuando);
  if (chaveAnterior !== reiniciarQuando) {
    definirChaveAnterior(reiniciarQuando);
    definirPaginas(1);
  }
  const nomesDasContas = new Map(contas?.map((conta) => [conta.id, textoDaConta(conta)]));
  const nomesDasCategorias = new Map(categorias?.map((categoria) => [categoria.codigo, categoria.nome]));
  const { itens, restantes } = fatiaDaPagina(transacoes, paginas);

  return (
    <div className={estilos.linhaDoTempo}>
      <ol className={estilos.dias}>
        {agruparPorDia(itens).map((dia, posicao) => (
          <li
            key={dia.data}
            className={estilos.dia}
            style={{ "--atraso": `${Math.min(posicao, 8) * 40}ms` } as CSSProperties}
          >
            <SubtotalDoDia data={dia.data} transacoes={dia.transacoes} />
            <ul className={estilos.linhas}>
              {dia.transacoes.map((transacao) => (
                <LinhaComExclusao
                  key={`${transacao.tipo}-${transacao.id}`}
                  transacao={transacao}
                  podeDesfazerClassificacao={podeDesfazerClassificacao}
                  aoDesfazerClassificacao={() => { focoAposExcluir?.current?.focus(); aoDesfazerClassificacao?.(); }}
                  comReservas
                  nomeDaConta={nomesDasContas.get(transacao.conta_id)}
                  nomeDaCategoria={
                    transacao.tipo !== "ganho" ? nomesDasCategorias.get(transacao.categoria) : undefined
                  }
                  aoAlternarCategoria={aoAlternarCategoria}
                  aoAlternarTag={aoAlternarTag}
                  categoriasAtivas={categoriasAtivas}
                  tagsAtivas={tagsAtivas}
                  categoriaConhecida={
                    transacao.tipo !== "ganho" && nomesDasCategorias.has(transacao.categoria)
                  }
                  aoExcluirGanho={aoExcluirGanho}
                  focoAposExcluir={focoAposExcluir}
                />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {restantes > 0 && (
        <Botao variante="secundario" className={estilos.maisLinhas} onClick={() => definirPaginas(paginas + 1)}>
          Mostrar mais ({restantes} {restantes === 1 ? "restante" : "restantes"})
        </Botao>
      )}
    </div>
  );
}
