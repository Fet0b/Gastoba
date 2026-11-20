import { useState } from "react";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useAportesSemInvestimento, useTratarAporte } from "../../api/consultas";
import { invalidar } from "../../api/useConsulta";
import type { AporteSemInvestimento, Investimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { rotuloDoMovimento, valorComSinal } from "../../investimentos/rotuloDoMovimento";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Badge } from "../Badge/Badge";
import { Icone } from "../Icone/Icone";
import { Cartao } from "../Cartao/Cartao";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Metadados } from "../Metadados/Metadados";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Associar } from "./MovimentosDeInvestimento";
import estilos from "./AportesSemInvestimento.module.css";

const TITULOS = { desfazer: "Desfazer o tratamento?", mesclar: "Mesclar este aporte?", excluir: "Excluir este aporte?", confirmar: "Confirmar o tratamento?" } as const;
const ROTULOS_DA_ACAO = { desfazer: "Confirmar desfazer", mesclar: "Confirmar mescla", excluir: "Confirmar exclusão", confirmar: "Confirmar" } as const;
const NOMES_DO_TRATAMENTO = { excluir: "exclusão", mesclar: "mescla" } as const;

type Tratamento = "excluir" | "mesclar";

function Aporte({ aporte: a, investimentos, registrado, aoRegistrar }: { aporte: AporteSemInvestimento; investimentos: Investimento[]; registrado: Tratamento | null; aoRegistrar: (tratamento: Tratamento | null) => void }) {
  const tratar = useTratarAporte();
  const [acao, mudarAcao] = useState<"associar" | "mesclar" | "excluir" | "desfazer" | "confirmar" | null>(null);
  // A lista não diz qual tratamento foi registrado antes; o pai guarda o que a pessoa acabou de fazer.
  const pendente = a.tratamento_pendente_de_aprovacao || registrado !== null;
  const data = dataParaExibicao(a.data);
  const erro = tratar.erro instanceof ErroDaApiCliente ? tratar.erro.mensagem : tratar.erro ? MENSAGEM_SEM_RESPOSTA : undefined;
  const natureza = a.natureza ?? "outra";
  const casavel = natureza === "liquidacao_de_bolsa" || natureza === "imposto_ou_taxa";
  const comum = natureza !== "conta_remunerada" && !casavel;
  const rotulo = rotuloDoMovimento({ natureza, descricao: a.descricao ?? "", tipo: "aporte" });
  const descricaoDoBanco = !!a.descricao && rotulo !== normalizarNomeDaInstituicao(a.descricao);
  return <li className={estilos.item}>
    <div className={estilos.identificacao}>
      <strong title={rotulo}>{rotulo}</strong>
      {descricaoDoBanco && <p className={`${estilos.apoio} ${estilos.descricaoDoBanco}`} title={a.descricao}>{a.descricao}</p>}
      <Metadados><span>{data}</span></Metadados>
    </div>
    <strong className={estilos.valor}>{valorComSinal("aporte", a.valor)}</strong>
    {!casavel && <div className={estilos.menu}><MenuDeAcoes rotulo={`Mais ações do aporte de ${data}`} itens={pendente
      ? [{ rotulo: "Desfazer tratamento", aoEscolher: () => mudarAcao("desfazer") }]
      : [
        { rotulo: natureza === "conta_remunerada" ? "Ligar à conta investimentos" : "Associar", aoEscolher: () => mudarAcao("associar") },
        ...(comum && a.duplicado_sugerido_id ? [{ rotulo: "Mesclar com duplicado", aoEscolher: () => mudarAcao("mesclar") }] : []),
        ...(comum ? [{ rotulo: "Excluir", aoEscolher: () => mudarAcao("excluir") }] : []),
      ]} /></div>}
    {pendente && <div className={estilos.bloco} data-bloco-do-tratamento=""><Badge tom="atencao">Tratamento registrado</Badge><p className={estilos.apoio}>Este tratamento aguarda a sua confirmação. Até lá, o aporte continua nos totais.</p><Botao variante="secundario" onClick={() => mudarAcao("confirmar")}>Confirmar tratamento</Botao></div>}
    {casavel && <p className={estilos.apoio}>Ligue na Revisão da bolsa.</p>}
    {comum && !pendente && <p className={estilos.apoio}>Associe a uma posição ou, se for duplicado, registre o tratamento no menu.</p>}
    {acao === "associar" && <Associar movimento={{ id: a.id, valor: a.valor, descricao: `aporte de ${data}` }} investimentos={investimentos} aoCancelar={() => mudarAcao(null)} aoAssociar={() => mudarAcao(null)} aoFalhar={() => undefined} />}
    {acao && acao !== "associar" && <DialogoDeConfirmacao aberto titulo={TITULOS[acao]}
      descricao={acao === "desfazer" ? "O tratamento será desfeito e o aporte continuará com os valores originais."
        : acao === "confirmar" ? `${formatar(a.valor)} em ${data}: confirmar ${registrado ? `a ${NOMES_DO_TRATAMENTO[registrado]}` : "o tratamento registrado"} tira o aporte da Liberdade financeira e das listas. Nada é apagado e dá para desfazer. Se veio da caixa, a transação volta a pendente.`
        : `${formatar(a.valor)} em ${data}: ${acao === "mesclar" ? "o duplicado sugerido será mantido" : "será registrada uma exclusão lógica"}. Nada é apagado; os totais só mudam depois que você confirmar o tratamento. Se veio da caixa, a transação volta a pendente após a confirmação.`}
      rotuloDaAcao={acao === "confirmar" && registrado ? ROTULOS_DA_ACAO[registrado] : ROTULOS_DA_ACAO[acao]}
      pendente={tratar.pendente} erro={erro} aoCancelar={() => mudarAcao(null)} aoConfirmar={async () => {
        if (await tratar.executar({ id: a.id, acao, mantidoId: acao === "mesclar" ? a.duplicado_sugerido_id ?? undefined : undefined })) {
          aoRegistrar(acao === "mesclar" || acao === "excluir" ? acao : null); mudarAcao(null);
        }
      }} />}
  </li>;
}
function ConteudoDosAportes({ investimentos }: { investimentos: Investimento[] }) {
  const consulta = useAportesSemInvestimento();
  // Fica aqui, e não no item, para sobreviver à recarga da lista depois de tratar.
  const [registrados, mudarRegistrados] = useState<Record<string, Tratamento>>({});
  if (consulta.erro) return <EstadoDeErro mensagem="Não foi possível carregar os aportes sem investimento." aoTentarDeNovo={() => invalidar("aportes-sem-investimento")} />;
  if (consulta.carregando && !consulta.dados) return <Esqueleto rotulo="Carregando aportes sem investimento" />;
  if (!consulta.dados?.length) return <EstadoVazio semMoldura icone="investimentos" titulo="Nenhum aporte sem investimento" descricao="Os aportes já estão associados às suas posições." />;
  return <Recolhivel resumo={`Aportes sem investimento (${consulta.dados.length})`} abertoDeInicio>
    <p>Associe um aporte à posição correta ou registre o tratamento de um duplicado. Os registros originais são preservados.</p>
    <ul className={estilos.movimentos}>{consulta.dados.map(a => <Aporte key={a.id} aporte={a} investimentos={investimentos} registrado={registrados[a.id] ?? null} aoRegistrar={t => mudarRegistrados(r => { const { [a.id]: _, ...resto } = r; return t ? { ...resto, [a.id]: t } : resto; })} />)}</ul>
  </Recolhivel>;
}


type Aviso = { quantidade: number; total: string };

/** O aviso de atenção como um cartão só (painel Ameixa): o texto e, se houver, a ação dentro dele. */
export function CartaoDeAvisoDeAportes({ aviso, aoRevisar }: { aviso: Aviso; aoRevisar?: () => void }) {
  return <Cartao aria-label="Aportes sem investimento" className={estilos.aviso}>
    <span className={estilos.iconeDoAviso}><Icone nome="alerta" /></span>
    <div className={estilos.textoDoAviso}>
      <strong>{aviso.quantidade} {aviso.quantidade === 1 ? "aporte" : "aportes"} sem investimento</strong>
      <p>{formatar(aviso.total)} ainda não estão ligados a nenhum investimento</p>
    </div>
    {aoRevisar && <Botao variante="secundario" onClick={aoRevisar}>Revisar aportes</Botao>}
  </Cartao>;
}

export function AportesSemInvestimento({ investimentos, aviso, aoMudarAberto }: { investimentos: Investimento[]; aviso?: Aviso; aoMudarAberto?: (aberto: boolean) => void }) {
  const [aberto, definirAberto] = useState(false);
  const mudarAberto = (valor: boolean) => { definirAberto(valor); aoMudarAberto?.(valor); };
  const dialogo = aberto && <Dialogo aberto titulo="Revisar aportes sem investimento" aoFechar={() => mudarAberto(false)} rodape={<Botao variante="secundario" onClick={() => mudarAberto(false)}>Concluir</Botao>}><ConteudoDosAportes investimentos={investimentos} /></Dialogo>;
  if (aviso) return <>
    <CartaoDeAvisoDeAportes aviso={aviso} aoRevisar={() => mudarAberto(true)} />
    {dialogo}
  </>;
  return <Cartao aria-label="Aportes sem investimento">
    <p>Confira aportes ainda sem posição e registre o tratamento de duplicados sem apagar seus dados.</p>
    <Botao variante="secundario" onClick={() => mudarAberto(true)}>Revisar aportes</Botao>
    {dialogo}
  </Cartao>;
}
