import { useState } from "react";
import type { Investimento } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { agruparInvestimentos, agruparRendaFixa } from "../../investimentos/grupos";
import { ordenarInvestimentos, type OrdenacaoDosInvestimentos } from "../../investimentos/ordenacao";
import { Seletor } from "../Campo/Seletor";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { LinhaDaPosicao } from "./LinhaDaPosicao";
import estilos from "./Investimentos.module.css";

type Propriedades = { investimentos: readonly Investimento[]; aoAvisar: (texto: string) => void; aoFalhar: (erro: unknown) => void };
export function ListaDeInvestimentos({ investimentos, aoAvisar, aoFalhar }: Propriedades) {
  const [ordem, mudarOrdem] = useState<OrdenacaoDosInvestimentos>("saldo");
  const lista = ordenarInvestimentos(investimentos, ordem);
  function posicoes(itens: readonly Investimento[]) {
    return <>
      <div className={estilos.cabecalhoDaListaNova} data-cabecalho-da-lista="" aria-hidden="true"><span>Posição</span><span>Aplicado</span><span>Saldo</span><span>Rendimento</span><span /></div>
      <ul className={estilos.posicoes} aria-label="Seus investimentos">{itens.map(i => <LinhaDaPosicao key={i.id} investimento={i} aoAvisar={aoAvisar} aoFalhar={aoFalhar} />)}</ul>
    </>;
  }
  function resumo(nome: string, quantidade: number, total: string) {
    return <span className={estilos.resumoDoGrupo}><strong>{nome}</strong><span>{quantidade} {quantidade === 1 ? "investimento" : "investimentos"}</span><span className={estilos.totalDoGrupo}>{formatar(total)}</span></span>;
  }
  return <div className={estilos.categorias}>
    <Seletor rotulo="Ordenar" valor={ordem} aoMudar={valor => mudarOrdem(valor as OrdenacaoDosInvestimentos)} opcoes={[{valor:"saldo",rotulo:"Maior saldo"},{valor:"rendimento",rotulo:"Maior rendimento"},{valor:"vencimento",rotulo:"Vencimento mais próximo"}]} />
    {agruparInvestimentos(lista).map(grupo => <Recolhivel key={grupo.tipo} className={estilos.categoria} data-categoria={grupo.tipo} abertoDeInicio={paraCentavos(grupo.total) !== 0n} resumo={resumo(grupo.nome, grupo.investimentos.length, grupo.total)}>
      {grupo.tipo === "FIXED_INCOME" ? agruparRendaFixa(grupo.investimentos).map(sub => <Recolhivel key={sub.chave} data-subgrupo={sub.chave} className={estilos.subcategoria} abertoDeInicio={paraCentavos(sub.total) !== 0n} resumo={resumo(sub.nome, sub.investimentos.length, sub.total)}>{posicoes(sub.investimentos)}</Recolhivel>) : posicoes(grupo.investimentos)}
    </Recolhivel>)}
  </div>;
}
