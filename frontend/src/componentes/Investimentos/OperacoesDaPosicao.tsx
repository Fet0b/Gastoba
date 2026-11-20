import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { useState } from "react";
import { ErroDaApiCliente, MENSAGEM_SEM_RESPOSTA } from "../../api/cliente";
import { useExcluirOperacao, useOperacoes } from "../../api/consultas";
import { invalidar } from "../../api/useConsulta";
import type { Investimento, Operacao } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { Dialogo } from "../Dialogo/Dialogo";
import { DialogoDeConfirmacao } from "../DialogoDeConfirmacao/DialogoDeConfirmacao";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { EstadoVazio } from "../EstadoVazio/EstadoVazio";
import { Metadados } from "../Metadados/Metadados";
import { EditarAbertura } from "./EditarAbertura";
import { LancarOperacao, rotulosDasOperacoes } from "./LancarOperacao";
import estilos from "./Investimentos.module.css";
import operacaoEstilos from "./OperacoesDaPosicao.module.css";

type Props = { investimento: Investimento; aoFechar: () => void; aoAvisar: (texto: string) => void; lancar?: boolean };
export function OperacoesDaPosicao({ investimento, aoFechar, aoAvisar, lancar = false }: Props) {
  const consulta = useOperacoes(investimento.id);
  const excluir = useExcluirOperacao();
  const [editando, mudarEdicao] = useState<Operacao | "nova" | null>(lancar ? "nova" : null);
  const [excluindo, mudarExclusao] = useState<Operacao | null>(null);
  const operacoes = consulta.dados ?? [];
  const erro = excluir.erro instanceof ErroDaApiCliente ? excluir.erro.mensagem : excluir.erro ? MENSAGEM_SEM_RESPOSTA : undefined;
  const salvar = () => { aoAvisar(editando === "nova" ? "Operação lançada." : "Operação atualizada."); if (lancar) aoFechar(); else mudarEdicao(null); };
  const cancelarEdicao = () => { if (lancar) aoFechar(); else mudarEdicao(null); };
  return <>
    <Dialogo aberto titulo={`Operações de ${normalizarNomeDaInstituicao(investimento.rotulo ?? investimento.nome)}`} aoFechar={aoFechar} rodape={<Botao variante="secundario" onClick={aoFechar}>Concluir</Botao>}>
      <p>Confira o histórico e corrija a abertura ou as operações lançadas à mão. As operações da corretora são preservadas.</p>
      {consulta.carregando ? <Esqueleto rotulo="Carregando operações" /> : consulta.erro ? <EstadoDeErro mensagem="Não foi possível carregar as operações." aoTentarDeNovo={() => invalidar(`investimentos/${investimento.id}/operacoes`)} /> : <>
        {operacoes.length === 0 ? <EstadoVazio semMoldura icone="investimentos" titulo="Nenhuma operação ainda" descricao="Complete o histórico para conferir a posição." acao={{ rotulo: "Lançar operação", aoClicar: () => mudarEdicao("nova") }} /> : <>
          <Botao variante="secundario" onClick={() => mudarEdicao("nova")}>Lançar operação</Botao>
          <ul className={estilos.movimentos}>{operacoes.map(o => <li key={o.id} className={estilos.movimento}>
            <div className={operacaoEstilos.resumo}><Metadados><strong>{rotulosDasOperacoes[o.tipo]}</strong><span>{o.data}</span><span>{o.quantidade} cotas</span><Badge>{o.origem === "pluggy" ? "Corretora" : o.origem === "abertura" ? "Abertura" : "Manual"}</Badge>{o.quantidade_estimada && <Badge tom="atencao">Estimada, confirme</Badge>}</Metadados><span className={operacaoEstilos.valor}>{formatar(o.valor)}</span></div>
            {o.quantidade_confirmavel && <div className={estilos.acoes}><Botao variante="secundario" onClick={() => mudarEdicao(o)}>Confirmar quantidade</Botao></div>}
            {o.editavel && <div className={estilos.acoes}>
              <Botao variante="secundario" onClick={() => mudarEdicao(o)}>{o.tipo === "ABERTURA" ? "Editar abertura" : "Editar operação"}</Botao>
              <Botao variante="terciario" onClick={() => mudarExclusao(o)}>{o.tipo === "ABERTURA" ? "Excluir abertura" : "Excluir operação"}</Botao>
            </div>}
          </li>)}</ul>
        </>}
      </>}
    </Dialogo>
    {editando && !consulta.carregando && !consulta.erro && (editando !== "nova" && editando.tipo === "ABERTURA"
      ? <EditarAbertura investimento={investimento} operacoes={operacoes} operacao={editando} aoCancelar={cancelarEdicao} aoSalvar={salvar} />
      : <LancarOperacao investimento={investimento} operacoes={operacoes} operacao={editando === "nova" ? undefined : editando} aoCancelar={cancelarEdicao} aoSalvar={salvar} />)}
    {excluindo && <DialogoDeConfirmacao aberto titulo={excluindo.tipo === "ABERTURA" ? "Excluir a abertura?" : "Excluir a operação?"} descricao="A posição será recalculada e pode ficar com histórico incompleto. As caixinhas serão preservadas." rotuloDaAcao="Confirmar exclusão" pendente={excluir.pendente} erro={erro} aoCancelar={() => mudarExclusao(null)} aoConfirmar={() => { void excluir.executar(excluindo.id).then(feita => { if (feita) { mudarExclusao(null); aoAvisar("Operação excluída. As caixinhas foram preservadas."); } }); }} />}
  </>;
}
