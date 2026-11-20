import { useState } from "react";
import { useAssociarCompra, useInvestimentos, useDesassociarCompra, useGastos, useMovimentosDeInvestimento, useReservasDasDestinacoes } from "../../api/consultas";
import { ErroDaApiCliente } from "../../api/cliente";
import type { Gasto } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { useCoresDasDestinacoes } from "../Investimentos/CoresDasDestinacoes";
import { Botao } from "../Botao/Botao";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import { CampoDeValor } from "../Compositor/CampoDeValor";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Dialogo } from "../Dialogo/Dialogo";
import estilos from "./CoberturaDaCompra.module.css";
/** "AAAA-MM-DD" deslocada em dias, sem passar por UTC. */
function deslocar(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia + dias);
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function CoberturaDaCompra({ gasto, aoFechar }: {
  gasto: Gasto;
  aoFechar: () => void;
}) {
  const corDaDestinacao = useCoresDasDestinacoes(useInvestimentos().dados);
  const reservas = useReservasDasDestinacoes(gasto.categoria);
  const gastos = useGastos({ inicio: gasto.data, fim: gasto.data });
  const atual = gastos.dados?.find(g => g.id === gasto.id) ?? gasto;
  const associar = useAssociarCompra();
  const desfazer = useDesassociarCompra();
  const [tag, definirTag] = useState<string | null>(null);
  const [valor, definirValor] = useState("0.00");
  const [resgateId, definirResgateId] = useState<string | null>(null);
  const movimentos = useMovimentosDeInvestimento(deslocar(gasto.data, -90), deslocar(gasto.data, 30));
  const usaResgate = tag !== null && (movimentos.dados ?? []).some(m => m.tipo === "resgate" && m.destinacoes.some(d => d.tag === tag));
  // Os resgates já tagueados com a caixinha escolhida e o que cada um ainda tem livre para compras.
  const resgates = tag === null || !usaResgate ? [] : (movimentos.dados ?? []).filter(m => m.tipo === "resgate").flatMap(m => {
    const parte = m.destinacoes.find(d => d.tag === tag);
    if (parte === undefined) return [];
    return [{ movimento: m, livre: paraCentavos(parte.valor) - paraCentavos(parte.coberto ?? "0.00") }];
  });
  const opcoes = new Map((reservas.dados ?? []).map(r => [r.tag, r]));
  for (const m of movimentos.dados ?? []) if (m.tipo === "resgate") for (const d of m.destinacoes) if (!opcoes.has(d.tag)) opcoes.set(d.tag, {tag: d.tag, reservado: "0.00", coberto: "0.00", disponivel: "0.00", cor: null});
  const restanteDaCompra = paraCentavos(atual.valor) - paraCentavos(atual.valor_coberto);
  const resgateEscolhido = resgates.find(r => r.movimento.id === resgateId);
  const erro = associar.erro ?? desfazer.erro ?? reservas.erro;
  async function confirmar() { if (tag !== null && await associar.executar({ gastoId: gasto.id, tag, valor, ...(usaResgate && resgateId !== null ? { movimentoId: resgateId } : {}) })) {
    definirTag(null);
    definirResgateId(null);
    definirValor("0.00");
  } }
  return <Dialogo
    titulo="Usar reserva de uma destinação"
    aberto
    aoFechar={aoFechar}
    rodape={<>
      <Botao variante="secundario" onClick={aoFechar}>Fechar cobertura</Botao>
      <Botao variante="primario" disabled={tag === null || paraCentavos(valor) <= 0n || associar.pendente || (usaResgate && resgateId === null)} onClick={() => void confirmar()}>Confirmar cobertura</Botao>
    </>}
  >
 <p>{gasto.descricao}</p><p>Valor original: {formatar(gasto.valor)}</p><p>Restante do gasto: {formatar(deCentavos(paraCentavos(atual.valor) - paraCentavos(atual.valor_coberto)))}</p>
 {opcoes.size === 0 ? <EstadoVazio icone="investimentos" titulo="Nenhuma reserva ou resgate disponível" descricao="Aporte ou resgate na caixinha desta categoria para poder cobrir a compra."/> : <GrupoDeOpcoes
  legenda="Escolha uma destinação"
  valor={tag ?? ""}
  variante="cartao"
  opcoes={[...opcoes.values()].map(r => ({ valor: r.tag, titulo: r.tag, descricao: `Reservado ${formatar(r.reservado)}. Já coberto ${formatar(r.coberto)}. Disponível ${formatar(r.disponivel)}.`, amostra: <span className={estilos.amostra} style={{ backgroundColor: corDaDestinacao(r.tag, r.cor) }} aria-hidden="true"/> }))}
  aoMudar={escolhida => { const r = opcoes.get(escolhida); if (!r) return; definirTag(r.tag); definirResgateId(null); if ((movimentos.dados ?? []).some(m => m.tipo === "resgate" && m.destinacoes.some(d => d.tag === r.tag))) { definirValor("0.00"); return; } const restante = paraCentavos(atual.valor) - paraCentavos(atual.valor_coberto); const disponivel = paraCentavos(r.disponivel); definirValor(deCentavos(restante < disponivel ? restante : disponivel)); }}
 />}
 {usaResgate && (resgates.length === 0
  ? <p>Nenhum resgate com a tag «{tag}» perto desta data. Classifique o saque como resgate dessa caixinha primeiro.</p>
  : <GrupoDeOpcoes
    legenda="Escolha o resgate que pagou a compra"
    valor={resgateId ?? ""}
    variante="cartao"
    opcoes={resgates.map(r => ({ valor: r.movimento.id, titulo: `Resgate de ${formatar(r.movimento.valor)}`, descricao: `${dataParaExibicao(r.movimento.data)}. Livre para compras ${formatar(deCentavos(r.livre))}.`, desabilitada: r.livre <= 0n }))}
    aoMudar={id => { const r = resgates.find(x => x.movimento.id === id); if (!r) return; definirResgateId(r.movimento.id); definirValor(deCentavos(restanteDaCompra < r.livre ? restanteDaCompra : r.livre)); }}
   />)}
 {usaResgate && resgateEscolhido !== undefined && paraCentavos(valor) > 0n && restanteDaCompra > paraCentavos(valor) && <p>O que passar do valor da caixinha conta normalmente na categoria.</p>}
 <CampoDeValor rotulo="Valor coberto" valor={valor} aoMudar={definirValor} erro={erro instanceof ErroDaApiCliente ? erro.mensagem : undefined}/>
 {erro != null && <p role="alert" className={estilos.erro}>{erro instanceof ErroDaApiCliente ? erro.mensagem : "Não foi possível consultar ou alterar a reserva."}</p>}
 <ul className={estilos.coberturas} aria-label="Coberturas desta compra">{atual.coberturas.map(c => <li key={c.id}>{formatar(c.valor)} {c.movimento_id ? "pagos por um resgate de" : "já reservados em"} «{c.tag}» <Botao variante="terciario" disabled={desfazer.pendente} onClick={() => void desfazer.executar({ gastoId: gasto.id, coberturaId: c.id })}>Desfazer cobertura de {c.tag}</Botao></li>)}</ul>
 </Dialogo>;
}
