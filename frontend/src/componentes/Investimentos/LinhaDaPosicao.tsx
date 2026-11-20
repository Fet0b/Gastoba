import { useState } from "react";
import type { Investimento } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { rotuloDaRentabilidade } from "../../investimentos/destinacoes";
import { rotuloDoTipo } from "../../investimentos/rotulo";
import { aplicadoERendimento, rentabilidadeDaPosicao } from "../../investimentos/rentabilidade";
import { rotuloDaTaxa } from "../../investimentos/taxa";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { rotuloDeExibicao } from "../../texto/rotulo";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { MenuDeAcoes, type ItemDoMenu } from "../MenuDeAcoes/MenuDeAcoes";
import { Metadados } from "../Metadados/Metadados";
import { Titulo } from "../Titulo/Titulo";
import { useCorDaDestinacao } from "./CoresDasDestinacoes";
import { DefinirDestinacoes, temValorADestinar } from "./DefinirDestinacoes";
import { comSinal, DestinacoesDaPosicao } from "./DestinacoesDaPosicao";
import { FormularioDeRealocacao } from "./FormularioDeRealocacao";
import { OperacoesDaPosicao } from "./OperacoesDaPosicao";
import { PendenciasDeOperacoes } from "./PendenciasDeOperacoes";
import { PendenciaDeHistorico } from "./PendenciaDeHistorico";
import { RealocacoesDaPosicao } from "./RealocacoesDaPosicao";
import estilos from "./LinhaDaPosicao.module.css";

const ROTULO_DA_ACAO = { confirmar_quantidade: "Confirmar quantidade", completar: "Completar histórico", conferir_operacoes: "Conferir operações" } as const;

type Propriedades = { investimento: Investimento; aoAvisar: (texto: string) => void; aoFalhar: (erro: unknown) => void };
export function LinhaDaPosicao({ investimento: i, aoAvisar, aoFalhar }: Propriedades) {
  const corDaDestinacao = useCorDaDestinacao();
  const [acao, mudarAcao] = useState<"detalhe" | "realocar" | "definir" | "historico" | "operacoes" | "lancar" | null>(null);
  const fechar = () => mudarAcao(null);
  const nome = normalizarNomeDaInstituicao(i.nome);
  const taxa = rotuloDaTaxa(i.taxa);
  const rentabilidade = rentabilidadeDaPosicao(i);
  const valores = aplicadoERendimento(i);
  // A conta investimentos mostra só o saldo do banco: nada de aplicado, rendimento nem rentabilidade.
  const soSaldo = i.tipo === "CAIXINHA";
  const temDestinacoes = i.destinacoes.some(d => d.tag !== null);
  const itens: ItemDoMenu[] = [
    ...(i.tipo !== "CAIXINHA" ? [{ rotulo: "Ver operações e abertura", aoEscolher: () => mudarAcao("operacoes") }] : []),
    { rotulo: "Ver destinações e cores", aoEscolher: () => mudarAcao("detalhe") },
    ...(temDestinacoes ? [{ rotulo: "Realocar", aoEscolher: () => mudarAcao("realocar") }] : []),
    { rotulo: "Ver realocações", aoEscolher: () => mudarAcao("historico") },
    ...(temValorADestinar(i) ? [{ rotulo: i.alocacao_por_fracao ? "Alocar em caixinhas" : "Definir destinações", aoEscolher: () => mudarAcao("definir") }] : []),
  ];
  return <li className={estilos.linha} aria-label={i.nome}>
    <div className={estilos.identificacao}>
      <Titulo nivel="cartao" className={estilos.nome} title={nome}>{nome}</Titulo>
      {i.vencimento && <span className={estilos.apoio}>vence {i.vencimento.slice(5, 7)}/{i.vencimento.slice(0, 4)}</span>}
      <Metadados>
        {!soSaldo && <Badge>{rotuloDoTipo(i.subtipo ?? i.tipo)}</Badge>}
        {taxa && <span aria-label={`Taxa de ${i.nome}`}>Taxa {taxa}</span>}
        {i.destinacoes.filter(d => d.tag !== null).map(d => <span key={d.tag} className={estilos.destinacao}><span className={estilos.ponto} style={{ background: corDaDestinacao(d.tag!, d.cor) }} aria-hidden="true" />{rotuloDeExibicao(d.tag!)}</span>)}
      </Metadados>
    </div>
    {soSaldo ? <div className={estilos.aplicado} data-vazio="" aria-hidden="true" /> : <div className={estilos.aplicado}><span className={estilos.rotulo}>Aplicado</span><span>{valores.aplicado === null ? "—" : formatar(valores.aplicado)}</span></div>}
    <div className={estilos.saldo}><span className={estilos.rotulo}>Saldo</span><span>{formatar(i.saldo)}</span></div>
    {soSaldo ? <div className={estilos.rendimento} data-vazio="" aria-hidden="true" /> : <div className={estilos.rendimento} data-tom={valores.rendimento === null ? "neutro" : paraCentavos(valores.rendimento) < 0n ? "negativo" : "positivo"} aria-label={`Rentabilidade de ${i.nome}`}>
      <span className={estilos.rotulo}>Rendimento</span><span>{valores.rendimento === null ? "—" : comSinal(valores.rendimento)}</span>
      <span className={rentabilidade.tipo === "ausente" ? `${estilos.percentual} ${estilos.apoio}` : estilos.percentual} data-sem-rentabilidade={rentabilidade.tipo === "ausente" || undefined}>{rentabilidade.tipo === "ausente" ? "Sem rentabilidade" : rotuloDaRentabilidade(rentabilidade.tipo === "calculada" ? rentabilidade.periodo : rentabilidade.valor)}</span>
      {rentabilidade.tipo === "calculada" && rentabilidade.anualizada !== null && <span className={estilos.rotulo}>{rotuloDaRentabilidade(rentabilidade.anualizada)} ao ano</span>}
    </div>}
    <div className={estilos.menu}><MenuDeAcoes rotulo={`Mais ações de ${nome}`} itens={itens} /></div>
    <div className={estilos.pendencia}>{i.alocacao_por_fracao && i.destinacoes.some(d => d.tag === null && paraCentavos(d.valor_atual) > 0n) && <Badge tom="atencao">Sem caixinha: {formatar(i.destinacoes.find(d => d.tag === null)!.valor_atual)}</Badge>}<PendenciasDeOperacoes pendencias={i.pendencias_de_operacoes ?? []} /><PendenciaDeHistorico investimento={i} />{i.acao_do_historico && <Botao variante="secundario" onClick={() => mudarAcao(i.acao_do_historico === "completar" ? "lancar" : "operacoes")}>{ROTULO_DA_ACAO[i.acao_do_historico]}</Botao>}</div>
    {(acao === "operacoes" || acao === "lancar") && <OperacoesDaPosicao investimento={i} aoFechar={fechar} aoAvisar={aoAvisar} lancar={acao === "lancar"} />}
    {acao === "detalhe" && <Dialogo aberto titulo={`Destinações de ${nome}`} aoFechar={fechar} rodape={<Botao variante="secundario" onClick={fechar}>Concluir</Botao>}>
      <DestinacoesDaPosicao investimento={i} />
      {i.custos_registrados && paraCentavos(i.custos_registrados) > 0n && <p>Custos e impostos registrados: {formatar(i.custos_registrados)}</p>}
      {i.resultado_realizado != null && <p>Resultado realizado: {comSinal(i.resultado_realizado)}</p>}
    </Dialogo>}
    {acao === "historico" && <Dialogo aberto titulo={`Realocações de ${nome}`} aoFechar={fechar} rodape={<Botao variante="secundario" onClick={fechar}>Concluir</Botao>}><RealocacoesDaPosicao investimentoId={i.id} aoAvisar={aoAvisar} aoFalhar={aoFalhar} /></Dialogo>}
    {acao === "realocar" && <FormularioDeRealocacao emDialogo investimento={i} aoCancelar={fechar} aoFalhar={aoFalhar} aoRealocar={() => { fechar(); aoAvisar("Realocação feita."); }} />}
    {acao === "definir" && <DefinirDestinacoes emDialogo investimento={i} aoCancelar={fechar} aoFalhar={aoFalhar} aoDefinir={() => { fechar(); aoAvisar("Destinações definidas."); }} />}
  </li>;
}
