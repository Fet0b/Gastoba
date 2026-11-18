import { useEffect, useMemo, useState } from "react";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useConfirmarPropostasDaBolsa, useDesfazerCasamento, useRefazerCasamento, useRevisaoDaBolsa } from "../../api/consultas";
import type { CasamentoConfirmado, ItemSemPar, PropostaDeCasamento } from "../../api/tipos";
import { invalidar } from "../../api/useConsulta";
import { formatar } from "../../dinheiro/dinheiro";
import { chavesDasExatas, motivoDoBotaoDeLigar, rotuloDaProposta, textoDoBotaoDeLigar } from "../../investimentos/revisaoDaBolsa";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { Caixa } from "../Campo/Caixa";
import { Dialogo } from "../Dialogo/Dialogo";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Metadados } from "../Metadados/Metadados";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Titulo } from "../Titulo/Titulo";
import { LinhaDaProposta } from "./LinhaDaProposta";
import estilos from "./RevisaoDaBolsa.module.css";

const dataCompleta = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const DESATUALIZADA = "Os dados mudaram. A lista foi atualizada; confira e confirme de novo.";
const texto = (erro: unknown) => erro instanceof ErroDaApiCliente ? (erro.codigo === "revisao_desatualizada" ? DESATUALIZADA : erro.mensagem) : MENSAGEM_SEM_RESPOSTA;
const ligacoes = (n: number) => `${n} ${n === 1 ? "ligação feita" : "ligações feitas"} com as operações da corretora.`;

function Escolha({ proposta: p, ocupada, aoLigar }: { proposta: PropostaDeCasamento; ocupada: boolean; aoLigar: (ids: string[]) => void }) {
  const [marcadas, mudarMarcadas] = useState<string[]>([]);
  const rotulo = rotuloDaProposta(p);
  return <li className={estilos.linha} aria-label={`Escolher ${rotulo}`}>
    <Titulo nivel="cartao">{rotulo}</Titulo>
    <p className={estilos.apoio}>{p.motivo}</p>
    <div className={estilos.escolha} role="group" aria-label="Operações candidatas">
      {p.operacoes.map(o => <Caixa key={o.id} rotulo={`${o.rotulo} (${o.quantidade}) ${formatar(o.valor_bruto)}`} marcada={marcadas.includes(o.id)} disabled={ocupada}
        aoMudar={m => mudarMarcadas(atual => m ? [...atual, o.id] : atual.filter(i => i !== o.id))} />)}
    </div>
    <div className={estilos.rodape}>
      {marcadas.length === 0 && <p className={estilos.faltando}>Escolha ao menos uma operação.</p>}
      <Botao variante="secundario" disabled={ocupada || marcadas.length === 0} onClick={() => aoLigar(marcadas)}>Ligar a escolha</Botao>
    </div>
  </li>;
}

function Ligado({ casamento: c, ocupado, aoDesfazer, aoRefazer }: { casamento: CasamentoConfirmado; ocupado: boolean; aoDesfazer: () => void; aoRefazer: () => void }) {
  const brutos = c.vinculos.filter(v => v.papel === "bruto").length;
  return <li className={estilos.linha}>
    <div className={estilos.topo}>
      <Metadados>
        <strong>{c.operacao_ids.length === 1 ? "1 operação" : `${c.operacao_ids.length} operações`}</strong>
        <span>{c.vinculos.length === 1 ? "1 lançamento" : `${c.vinculos.length} lançamentos`}{brutos ? "" : ""}</span>
        {c.sem_aporte && <Badge tom="atencao">Sem aporte registrado</Badge>}
      </Metadados>
      <span />
      <MenuDeAcoes rotulo={`Mais ações da ligação de ${c.operacao_ids.length === 1 ? "1 operação" : `${c.operacao_ids.length} operações`}`} itens={[
        ...(c.sem_aporte ? [{ rotulo: "Refazer ligação", desabilitado: ocupado, aoEscolher: aoRefazer }] : []),
        { rotulo: "Desfazer ligação", desabilitado: ocupado, aoEscolher: aoDesfazer },
      ]} />
    </div>
  </li>;
}

function SemPar({ itens }: { itens: ItemSemPar[] }) {
  return <>
    <p className={estilos.apoio}>Não há nada a fazer aqui: são operações da corretora sem débito ou crédito correspondente nas contas conectadas (por exemplo, pagas por uma conta que não está conectada) e lançamentos sem operação. Nada é contado em dobro por causa deles.</p>
    <ul className={estilos.lista}>{itens.map((i, n) => <li key={i.operacao_id ?? i.transacao_id ?? n} className={estilos.linha} aria-label={i.descricao || i.motivo}>
      <div className={estilos.topo}>
        <strong className={estilos.nome} title={i.descricao}>{i.descricao || i.motivo}</strong>
        {i.valor !== null && <span className={estilos.valor}>{formatar(i.valor)}</span>}
      </div>
      <Metadados>{i.data && <span>{dataCompleta(i.data)}</span>}<span>{i.motivo}</span></Metadados>
    </li>)}</ul>
  </>;
}

type Props = { aoAvisar: (texto: string) => void; aoFechar: () => void };

/** A Revisão da bolsa: confere e liga os lançamentos da conta às operações da corretora. */
export function RevisaoDaBolsa({ aoAvisar, aoFechar }: Props) {
  const consulta = useRevisaoDaBolsa();
  const confirmar = useConfirmarPropostasDaBolsa();
  const desfazer = useDesfazerCasamento();
  const refazer = useRefazerCasamento();
  const [selecionadas, mudarSelecionadas] = useState<string[]>([]);
  const [alerta, mudarAlerta] = useState<string | null>(null);
  const [desfazendo, mudarDesfazendo] = useState<CasamentoConfirmado | null>(null);
  const dados = consulta.dados;
  const ocupada = confirmar.pendente || desfazer.pendente || refazer.pendente;
  const exatas = useMemo(() => (dados?.propostas ?? []).filter(p => p.confianca === "exata"), [dados]);
  const escolhas = (dados?.propostas ?? []).filter(p => p.confianca === "precisa_escolher");
  useEffect(() => {
    const vivas = new Set(chavesDasExatas(dados?.propostas ?? []));
    mudarSelecionadas(atual => atual.filter(c => vivas.has(c)));
  }, [dados]);

  const ligar = async (itens: { chave: string; versao: string; operacao_ids?: string[] }[]) => {
    mudarAlerta(null);
    const feitas = await confirmar.executar(itens);
    if (feitas) { mudarSelecionadas([]); aoAvisar(ligacoes(feitas.length)); };
  };
  useEffect(() => { if (confirmar.erro) mudarAlerta(texto(confirmar.erro)); }, [confirmar.erro]);
  const ligarSo = (p: PropostaDeCasamento) => void ligar([{ chave: p.chave, versao: p.versao }]);
  const todasMarcadas = exatas.length > 0 && selecionadas.length === exatas.length;
  const motivo = motivoDoBotaoDeLigar(selecionadas.length, confirmar.pendente);
  const grupos = useMemo(() => {
    const porPregao = new Map<string, PropostaDeCasamento[]>();
    for (const p of exatas) porPregao.set(p.data_do_pregao, [...(porPregao.get(p.data_do_pregao) ?? []), p]);
    return [...porPregao.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [exatas]);
  const vazio = !!dados && dados.propostas.length === 0 && dados.sem_par.length === 0 && dados.confirmados.length === 0;

  const rodape = <div className={estilos.rodape}>
    {alerta && <p role="alert" className={estilos.alerta}>{alerta}</p>}
    {!vazio && motivo && <p className={estilos.faltando}>{motivo}</p>}
    <Botao variante="secundario" onClick={aoFechar}>Concluir</Botao>
    {!vazio && <Botao variante="primario" disabled={!!motivo} onClick={() => void ligar(exatas.filter(p => selecionadas.includes(p.chave)).map(p => ({ chave: p.chave, versao: p.versao })))}>{textoDoBotaoDeLigar(selecionadas.length)}</Botao>}
  </div>;

  return <Dialogo aberto titulo="Revisão da bolsa" aoFechar={aoFechar} rodape={rodape}>
    {consulta.carregando && !dados ? <Esqueleto rotulo="Carregando a revisão da bolsa" /> : consulta.erro && !dados ? <EstadoDeErro mensagem="Não foi possível carregar a revisão da bolsa." aoTentarDeNovo={() => invalidar("revisao-da-bolsa")} /> : vazio ? <EstadoVazio icone="investimentos" titulo="Tudo conferido" descricao="Os lançamentos da conta e as operações da corretora estão ligados." /> : dados && <>
      <p className={estilos.introducao}>A corretora já informou estas operações. Ligar cada lançamento da conta à operação evita contar o mesmo dinheiro duas vezes. Nada muda no saldo, no custo nem nas caixinhas.</p>
      {exatas.length > 0 && <Caixa rotulo={`Selecionar as ${exatas.length} com valores iguais`} marcada={todasMarcadas} disabled={ocupada} aoMudar={m => mudarSelecionadas(m ? chavesDasExatas(exatas) : [])} />}
      {grupos.map(([pregao, propostas]) => <section key={pregao} className={estilos.grupo} aria-label={`Pregão de ${dataCompleta(pregao)}`}>
        <Titulo nivel="cartao">Pregão de {dataCompleta(pregao)}</Titulo>
        <ul className={estilos.lista}>{propostas.map(p => <LinhaDaProposta key={p.chave} proposta={p} ocupada={ocupada} selecionada={selecionadas.includes(p.chave)}
          aoSelecionar={m => mudarSelecionadas(atual => m ? [...atual, p.chave] : atual.filter(c => c !== p.chave))} aoLigarSo={() => ligarSo(p)} />)}</ul>
      </section>)}
      {escolhas.length > 0 && <Recolhivel resumo={`Precisa de escolha (${escolhas.length})`}><ul className={estilos.lista}>{escolhas.map(p => <Escolha key={p.chave} proposta={p} ocupada={ocupada} aoLigar={ids => void ligar([{ chave: p.chave, versao: p.versao, operacao_ids: ids }])} />)}</ul></Recolhivel>}
      {dados.sem_par.length > 0 && <Recolhivel resumo={`Sem par na corretora (${dados.sem_par.length})`}><SemPar itens={dados.sem_par} /></Recolhivel>}
      {dados.confirmados.length > 0 && <Recolhivel resumo={`Já ligados (${dados.confirmados.length})`}><ul className={estilos.lista}>{dados.confirmados.map(c => <Ligado key={c.id} casamento={c} ocupado={ocupada} aoDesfazer={() => mudarDesfazendo(c)}
        aoRefazer={async () => { mudarAlerta(null); const ok = await refazer.executar(c.id); if (ok) aoAvisar("Ligação refeita: o aporte foi registrado."); }} />)}</ul></Recolhivel>}
      {refazer.erro != null && <p role="alert" className={estilos.alerta}>{texto(refazer.erro)}</p>}
    </>}
    {desfazendo && <DialogoDeConfirmacao aberto titulo="Desfazer a ligação?" descricao="Os lançamentos voltam à caixa de entrada como pendentes. Nada é apagado; saldo, custo e caixinhas não mudam." rotuloDaAcao="Desfazer ligação"
      pendente={desfazer.pendente} erro={desfazer.erro ? texto(desfazer.erro) : undefined} aoCancelar={() => mudarDesfazendo(null)}
      aoConfirmar={async () => { if (await desfazer.executar(desfazendo.id)) { mudarDesfazendo(null); aoAvisar("Ligação desfeita: os lançamentos voltaram à caixa."); } }} />}
  </Dialogo>;
}
