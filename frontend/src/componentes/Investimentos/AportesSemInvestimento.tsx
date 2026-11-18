import { useState } from "react";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useAportesSemInvestimento, useTratarAporte } from "../../api/consultas";
import { invalidar } from "../../api/useConsulta";
import type { AporteSemInvestimento, Investimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { rotuloDoMovimento, valorComSinal } from "../../investimentos/rotuloDoMovimento";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Badge } from "../Badge/Badge";
import { Cartao } from "../Cartao/Cartao";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { MenuDeAcoes } from "../MenuDeAcoes/MenuDeAcoes";
import { Metadados } from "../Metadados/Metadados";
import { Recolhivel } from "../Recolhivel/Recolhivel";
import { Associar } from "./MovimentosDeInvestimento";
import estilos from "./Investimentos.module.css";
import operacaoEstilos from "./OperacoesDaPosicao.module.css";

function Aporte({ aporte: a, investimentos }: { aporte: AporteSemInvestimento; investimentos: Investimento[] }) {
  const tratar = useTratarAporte();
  const [acao, mudarAcao] = useState<"associar" | "mesclar" | "excluir" | "desfazer" | null>(null);
  const [registrado, mudarRegistro] = useState(false);
  const pendente = a.tratamento_pendente_de_aprovacao || registrado;
  const erro = tratar.erro instanceof ErroDaApiCliente ? tratar.erro.mensagem : tratar.erro ? MENSAGEM_SEM_RESPOSTA : undefined;
  const natureza = a.natureza ?? "outra";
  const casavel = natureza === "liquidacao_de_bolsa" || natureza === "imposto_ou_taxa";
  const comum = natureza !== "conta_remunerada" && !casavel;
  const rotulo = rotuloDoMovimento({ natureza, descricao: a.descricao ?? "", tipo: "aporte" });
  const descricaoDoBanco = !!a.descricao && rotulo !== normalizarNomeDaInstituicao(a.descricao);
  return <li className={estilos.movimento}>
    <div className={operacaoEstilos.resumo}>
      <div>
        <strong title={rotulo}>{rotulo}</strong>
        {descricaoDoBanco && <p className={estilos.apoio} title={a.descricao}>{a.descricao}</p>}
        <Metadados><span>{a.data}</span></Metadados>
      </div>
      <strong className={operacaoEstilos.valor}>{valorComSinal("aporte", a.valor)}</strong>
    </div>
    {pendente && <><Badge tom="atencao">Tratamento registrado</Badge><p>Este tratamento aguarda aprovação do relatório.</p></>}
    {casavel && <p className={estilos.apoio}>Ligue na Revisão da bolsa.</p>}
    {comum && !pendente && <p className={estilos.apoio}>Só vale depois da aprovação do relatório.</p>}
    {!casavel && <MenuDeAcoes rotulo={`Mais ações do aporte de ${a.data}`} itens={pendente
      ? [{ rotulo: "Desfazer tratamento", aoEscolher: () => mudarAcao("desfazer") }]
      : [
        { rotulo: natureza === "conta_remunerada" ? "Ligar à conta investimentos" : "Associar", aoEscolher: () => mudarAcao("associar") },
        ...(comum && a.duplicado_sugerido_id ? [{ rotulo: "Mesclar com duplicado", aoEscolher: () => mudarAcao("mesclar") }] : []),
        ...(comum ? [{ rotulo: "Excluir", aoEscolher: () => mudarAcao("excluir") }] : []),
      ]} />}
    {acao === "associar" && <Associar movimento={{ id: a.id, valor: a.valor, descricao: `aporte de ${a.data}` }} investimentos={investimentos} aoCancelar={() => mudarAcao(null)} aoAssociar={() => mudarAcao(null)} aoFalhar={() => undefined} />}
    {acao && acao !== "associar" && <DialogoDeConfirmacao aberto titulo={acao === "desfazer" ? "Desfazer o tratamento?" : acao === "mesclar" ? "Mesclar este aporte?" : "Excluir este aporte?"}
      descricao={acao === "desfazer" ? "O tratamento será desfeito e o aporte continuará com os valores originais." : `${formatar(a.valor)} em ${a.data}: ${acao === "mesclar" ? "o duplicado sugerido será mantido" : "será registrada uma exclusão lógica"}. Nada é apagado; os totais só mudam depois da aprovação do relatório pelo dono. Se veio da caixa, a transação volta a pendente após essa aprovação.`}
      rotuloDaAcao={acao === "desfazer" ? "Confirmar desfazer" : acao === "mesclar" ? "Confirmar mescla" : "Confirmar exclusão"}
      pendente={tratar.pendente} erro={erro} aoCancelar={() => mudarAcao(null)} aoConfirmar={async () => {
        if (await tratar.executar({ id: a.id, acao, mantidoId: acao === "mesclar" ? a.duplicado_sugerido_id ?? undefined : undefined })) {
          mudarRegistro(acao !== "desfazer"); mudarAcao(null);
        }
      }} />}
  </li>;
}
function ConteudoDosAportes({ investimentos }: { investimentos: Investimento[] }) {
  const consulta = useAportesSemInvestimento();
  if (consulta.erro) return <EstadoDeErro mensagem="Não foi possível carregar os aportes sem investimento." aoTentarDeNovo={() => invalidar("aportes-sem-investimento")} />;
  if (consulta.carregando) return <Esqueleto rotulo="Carregando aportes sem investimento" />;
  if (!consulta.dados?.length) return <EstadoVazio icone="investimentos" titulo="Nenhum aporte sem investimento." descricao="Os aportes já estão associados às suas posições." />;
  return <Recolhivel resumo={`Aportes sem investimento (${consulta.dados.length})`} abertoDeInicio>
    <p>Associe um aporte à posição correta ou registre o tratamento de um duplicado. Os registros originais são preservados.</p>
    <ul className={estilos.movimentos}>{consulta.dados.map(a => <Aporte key={a.id} aporte={a} investimentos={investimentos} />)}</ul>
  </Recolhivel>;
}


export function AportesSemInvestimento({ investimentos }: { investimentos: Investimento[] }) {
  const [aberto, mudarAberto] = useState(false);
  return <Cartao aria-label="Aportes sem investimento">
    <p>Confira aportes ainda sem posição e registre o tratamento de duplicados sem apagar seus dados.</p>
    <Botao variante="secundario" onClick={() => mudarAberto(true)}>Revisar aportes</Botao>
    {aberto && <Dialogo aberto titulo="Revisar aportes sem investimento" aoFechar={() => mudarAberto(false)} rodape={<Botao variante="secundario" onClick={() => mudarAberto(false)}>Concluir</Botao>}><ConteudoDosAportes investimentos={investimentos} /></Dialogo>}
  </Cartao>;
}
