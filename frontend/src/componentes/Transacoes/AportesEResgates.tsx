import { ListaDeTransferencias } from "./ListaDeTransferencias";
import { useEffect, useState } from "react";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { invalidar } from "../../api/useConsulta";
import { useInvestimentos, useMovimentosDeInvestimento } from "../../api/consultas";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { opcoesDoFiltroDeInvestimento } from "../../investimentos/opcoesDoFiltro";
import { limites, type Periodo } from "../../periodo/periodo";
import { Chip } from "../Chip/Chip";
import { Seletor } from "../Campo/Seletor";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { GradeDeIndicadores } from "../GradeDeIndicadores/GradeDeIndicadores";
import { Indicador } from "../Indicador/Indicador";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Titulo } from "../Titulo/Titulo";
import { MovimentosDeInvestimento } from "../Investimentos/MovimentosDeInvestimento";
import { ResumoDaRevisaoDaBolsa } from "../Investimentos/ResumoDaRevisaoDaBolsa";
import type { Navegacao } from "../Navegacao/telas";
import estilos from "./AportesEResgates.module.css";

export type PropriedadesDosAportes = {
  periodo: Periodo;
  contaSelecionada: string | null;
  navegacao: Navegacao;
  aoAvisar: (texto: string) => void;
  aoFalhar: (erro: unknown) => void;
  aoLimparConta: () => void;
};
const TIPOS = [
  ["todos", "Todos"], ["aporte", "Aportes"], ["resgate", "Resgates"], ["rendimento", "Rendimentos"], ["custo", "Custos"], ["imposto", "Impostos"], ["saldo_inicial", "Saldo inicial"],
] as const;
type Tipo = typeof TIPOS[number][0];

export function AportesEResgates({ periodo, contaSelecionada, navegacao, aoAvisar, aoFalhar, aoLimparConta }: PropriedadesDosAportes) {
  const { inicio, fim } = limites(periodo);
  const movimentos = useMovimentosDeInvestimento(inicio, fim);
  const investimentos = useInvestimentos();
  const [tipo, definirTipo] = useState<Tipo>("todos");
  const [investimento, definirInvestimento] = useState("todos");
  useEffect(() => { if (movimentos.erro) aoFalhar(movimentos.erro); }, [movimentos.erro]);
  useEffect(() => { if (investimentos.erro) aoFalhar(investimentos.erro); }, [investimentos.erro]);
  const opcoes = opcoesDoFiltroDeInvestimento(investimentos.dados ?? []);
  const erro = movimentos.erro || investimentos.erro;
  const mensagem = erro instanceof ErroDaApiCliente ? erro.mensagem : MENSAGEM_SEM_RESPOSTA;
  const filtrados = (movimentos.dados ?? []).filter((m) =>
    (contaSelecionada === null || m.conta_id === contaSelecionada) &&
    (tipo === "todos" || (tipo === "saldo_inicial" ? m.origem === "saldo_inicial" : m.tipo === tipo && m.origem !== "saldo_inicial")) &&
    (investimento === "todos" || (investimento === "sem" ? m.investimento_id === null : m.investimento_id === investimento)),
  );
  const total = (doTipo: "aporte" | "resgate") => formatar(deCentavos(filtrados.filter((m) => m.tipo === doTipo && m.origem !== "saldo_inicial").reduce((soma, m) => soma + paraCentavos(m.valor), 0n)));
  const filtrosAtivos = tipo !== "todos" || investimento !== "todos" || contaSelecionada !== null;
  function limpar() { definirTipo("todos"); definirInvestimento("todos"); aoLimparConta(); }
  // O saldo inicial não é dinheiro novo: fica à parte, recolhido, no fim da lista.
  const iniciais = filtrados.filter((m) => m.origem === "saldo_inicial");
  const demais = filtrados.filter((m) => m.origem !== "saldo_inicial");
  const lista = (itens: typeof filtrados, rotuloDaLista?: string) => <MovimentosDeInvestimento rotuloDaLista={rotuloDaLista} movimentos={itens} investimentos={investimentos.dados ?? []} aoAvisar={aoAvisar} aoFalhar={aoFalhar} podeDesfazerClassificacao={navegacao.importacaoBancaria === true} />;
  return <section className={estilos.secao} aria-label="Movimentos de investimento">
    <Titulo nivel="secao">Aportes e resgates</Titulo>
    <ResumoDaRevisaoDaBolsa habilitada={navegacao.importacaoBancaria === true} aoAvisar={aoAvisar} />
    <div className={estilos.filtros} role="group" aria-label="Filtrar por tipo de movimento">
      {TIPOS.map(([valor, nome]) => <Chip key={valor} selecionado={tipo === valor} aoAlternar={() => definirTipo(valor)}>{nome}</Chip>)}
    </div>
    <Seletor
      rotulo="Filtrar por investimento"
      valor={investimento}
      aoMudar={definirInvestimento}
      opcoes={[{ valor: "todos", rotulo: "Todos os investimentos" }, { valor: "sem", rotulo: "Sem investimento" }]}
      grupos={opcoes.grupos.map((g) => ({ nome: g.nome, opcoes: g.opcoes.map((o) => ({ valor: o.valor, rotulo: o.rotulo })) }))}
    />
    {contaSelecionada !== null && <p className={estilos.apoio}>Saldo inicial não tem conta e fica oculto enquanto uma conta está selecionada.</p>}
    <GradeDeIndicadores colunas={2}>
      <Indicador rotulo="Aportes" valor={<span aria-label="Total de aportes">{total("aporte")}</span>} />
      <Indicador rotulo="Resgates" valor={<span aria-label="Total de resgates">{total("resgate")}</span>} />
    </GradeDeIndicadores>
    <p className={estilos.apoio}>Saldo inicial não entra nos totais de aportes.</p>
    {Boolean(erro) && <EstadoDeErro mensagem={mensagem} aoTentarDeNovo={() => { invalidar("movimentos-de-investimento"); invalidar("investimentos"); }} />}
    {movimentos.dados === undefined ? (!erro && <Esqueleto rotulo="Carregando movimentos" />) : filtrados.length === 0 ? (
      <EstadoVazio
        icone="investimentos"
        titulo={filtrosAtivos ? "Nenhum movimento com esses filtros." : "Nenhum movimento neste mês."}
        descricao={filtrosAtivos ? undefined : "Experimente trocar de mês."}
        acao={filtrosAtivos ? { rotulo: "Limpar filtros", aoClicar: limpar } : undefined}
      />
    ) : <>
      {demais.length > 0 && lista(demais)}
      {iniciais.length > 0 && <Recolhivel resumo={`Saldos iniciais (${iniciais.length})`}>{lista(iniciais, "Saldos iniciais")}</Recolhivel>}
    </>}
    {navegacao.importacaoBancaria === true && <ListaDeTransferencias inicio={inicio} fim={fim} contaSelecionada={contaSelecionada} aoAvisar={aoAvisar} />}
  </section>;
}
