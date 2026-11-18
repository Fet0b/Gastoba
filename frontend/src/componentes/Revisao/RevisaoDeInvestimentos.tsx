import { Titulo } from "../Titulo/Titulo";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Seletor } from "../Campo/Seletor";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { useEffect, useRef, useState } from "react";
import { useCategorias, useInvestimentos, usePendenciasDeRevisao, useRevisarAporte, useRevisarGastoLegado, useRevisarRecorrenciaLegada } from "../../api/consultas";
import { ErroDaApiCliente } from "../../api/cliente";
import type { Gasto, Recorrencia, MovimentoDeInvestimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { destinacoesParaEnvio, motivoDasDestinacoes, type LinhaDeDestinacao } from "../../investimentos/destinacoes";
import { EditorDeDestinacoes, LINHA_INICIAL } from "../Investimentos/EditorDeDestinacoes";
import { Botao } from "../Botao/Botao";
import estilos from "./RevisaoDeInvestimentos.module.css";
type Registro = Gasto | Recorrencia | MovimentoDeInvestimento;
function ItemDeRevisao({ registro, tipo, categorias, investimentos }: {
  categorias: ReturnType<typeof useCategorias>;
  investimentos: ReturnType<typeof useInvestimentos>;
  registro: Registro;
  tipo: "aportes" | "gastos" | "recorrencias";
}) {
  const aporte = useRevisarAporte(), gasto = useRevisarGastoLegado(), recorrencia = useRevisarRecorrenciaLegada();
  const [categoria, definirCategoria] = useState("");
  const [confirmando, definirConfirmando] = useState(false);
  const [investimentoId, definirInvestimento] = useState("");
  const [linhas, definirLinhas] = useState<LinhaDeDestinacao[]>([{ ...LINHA_INICIAL }]);
  const cancelar = useRef<HTMLButtonElement>(null);
  const revisar = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirmando)
    cancelar.current?.focus(); }, [confirmando]);
  const mutacao = tipo === "aportes" ? aporte : tipo === "gastos" ? gasto : recorrencia;
  const categoriaValida = tipo === "aportes" || categoria !== "";
  const podeAssociar = tipo === "aportes" && (registro as MovimentoDeInvestimento).investimento_id === null;
  const motivo = podeAssociar && investimentoId !== "" ? motivoDasDestinacoes(linhas) : null;
  async function confirmar() {
    if (tipo === "aportes")
      await aporte.executar({ id: registro.id, dados: { categoria: categoria || null, ...(investimentoId ? { investimento_id: investimentoId, destinacoes: destinacoesParaEnvio(linhas) } : {}) } });
    else if (tipo === "gastos")
      await gasto.executar({ id: registro.id, categoria });
    else
      await recorrencia.executar({ id: registro.id, categoria });
  }
  return <li className={estilos.item}><Titulo nivel="cartao" como="h4">{registro.descricao}</Titulo><p>{formatar(registro.valor)}</p>{confirmando ? <div role="group" aria-label={`Confirmar revisão de ${registro.descricao}`}><p>Categoria: {categoria ? categorias.dados?.find(c => c.codigo === categoria)?.nome : "manter só em Liberdade financeira"}.{investimentoId && " Associar ao investimento e às destinações escolhidas."} Valor, data, conta e saldo permanecem iguais.</p><Botao variante="primario" disabled={mutacao.pendente} onClick={() => void confirmar()}>Confirmar revisão</Botao><Botao variante="secundario" ref={cancelar} disabled={mutacao.pendente} onClick={() => { definirConfirmando(false); queueMicrotask(() => revisar.current?.focus()); }}>Cancelar revisão</Botao></div> : <>
 {tipo !== "aportes" && <Seletor rotulo={`Categoria para ${registro.descricao}`} valor={categoria} aoMudar={definirCategoria} vazio="Escolha uma categoria" opcoes={(categorias.dados??[]).filter(c=>!c.legada).map(c=>({valor:c.codigo,rotulo:c.nome}))} />}
 {podeAssociar && <EditorDeDestinacoes investimentos={investimentos.dados} investimentoId={investimentoId} aoMudarInvestimento={definirInvestimento} linhas={linhas} aoMudarLinhas={definirLinhas} valor={registro.valor}/>}
 {(!categoriaValida||motivo!==null)&&<p id={`revisao-${registro.id}-motivo`}>{motivo??"Escolha uma categoria para revisar."}</p>}
 <Botao variante="secundario" ref={revisar} aria-label={`Revisar ${registro.descricao}`} disabled={!categoriaValida || motivo !== null} aria-describedby={!categoriaValida||motivo!==null?`revisao-${registro.id}-motivo`:undefined} onClick={() => definirConfirmando(true)}>Revisar</Botao></>}
 {mutacao.erro != null && <p role="alert">{mutacao.erro instanceof ErroDaApiCliente ? mutacao.erro.mensagem : "Não foi possível revisar este item."}</p>}
 </li>;
}
export function RevisaoDeInvestimentos() {
  const consulta = usePendenciasDeRevisao();
  const p = consulta.dados;
  if (!p)
    return consulta.erro ? <EstadoDeErro mensagem="Não foi possível consultar a revisão de investimentos." /> : <Esqueleto rotulo="Carregando revisão de investimentos" linhas={1} />;
  if (p.aportes.length + p.gastos.length + p.recorrencias.length === 0) return null;
  return <PainelDaRevisao p={p} />;
}

function PainelDaRevisao({p}: {p: NonNullable<ReturnType<typeof usePendenciasDeRevisao>["dados"]>}) {
  const categorias = useCategorias();
  const investimentos = useInvestimentos();
  const grupos = ([['aportes', 'Aportes'], ['gastos', 'Gastos antigos'], ['recorrencias', 'Recorrências antigas']] as const).filter(([tipo]) => p[tipo].length > 0);
  if (grupos.length === 0)
    return null;
  return <section className={estilos.painel} aria-label="Revisão de investimentos"><Titulo nivel="secao">Revisão de investimentos</Titulo><p>Revise cada item. Nada muda em valor, data, conta ou saldo.</p>{grupos.map(([tipo, nome]) => <Recolhivel key={tipo} resumo={`${nome} (${p[tipo].length})`}><ul>{p[tipo].map(registro => <ItemDeRevisao key={registro.id} registro={registro} tipo={tipo} categorias={categorias} investimentos={investimentos}/>)}</ul></Recolhivel>)}</section>;
}
