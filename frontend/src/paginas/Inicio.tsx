import { useEffect, useState } from "react";

import { ErroDaApiCliente } from "../api/cliente";
import { useCategorias, useContas, useGanhos, useGastos, useProgressoDasMetas } from "../api/consultas";
import type { MensagemDoAviso } from "../componentes/Aviso/Aviso";
import { Cartao } from "../componentes/Cartao/Cartao";
import { GraficoDeRitmo } from "../componentes/Grafico/GraficoDeRitmo/GraficoDeRitmo";
import { AvisoDoMes } from "../componentes/Inicio/AvisoDoMes";
import { ResumoDoMes } from "../componentes/Inicio/ResumoDoMes";
import { UltimosGastos } from "../componentes/Inicio/UltimosGastos";
import { MetasDoMes } from "../componentes/Metas/MetasDoMes";
import type { Navegacao } from "../componentes/Navegacao/telas";
import { useEstadoDoOlho } from "../componentes/Olho/useEstadoDoOlho";
import { Pagina } from "../componentes/Pagina/Pagina";
import { somar } from "../dinheiro/dinheiro";
import { diasDoMes, gastoAcumuladoPorDia, ritmoIdealPorDia } from "../graficos/ritmo";
import { avisoDoMes } from "../inicio/avisoDoMes";
import { hojeLocal, limites, mesDoPeriodo, type Periodo, periodoAtual } from "../periodo/periodo";
import estilos from "./Inicio.module.css";
import { dinheiroTotalDasContas } from "./dinheiroTotal";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "./mensagens";

/** O mês escolhido em relação a hoje. */
function momentoDoPeriodo(periodo: Periodo, atual: Periodo): "passado" | "atual" | "futuro" {
  const escolhido = periodo.ano * 12 + periodo.mes;
  const hoje = atual.ano * 12 + atual.mes;
  return escolhido < hoje ? "passado" : escolhido > hoje ? "futuro" : "atual";
}

/**
 * Até que dia a curva do gasto acumulado vai: o mês todo se já passou, nenhum dia se ainda não
 * começou e, no mês corrente, até hoje ou até o último gasto com data futura (nada fica escondido).
 */
function ultimoDiaDaCurva(
  momento: "passado" | "atual" | "futuro",
  periodo: Periodo,
  gastos: readonly { data: string }[],
): number {
  if (momento === "futuro") return 0;
  if (momento === "passado") return diasDoMes(periodo);
  const prefixo = `${mesDoPeriodo(periodo)}-`;
  let dia = Number(hojeLocal().slice(prefixo.length));
  for (const gasto of gastos) {
    if (gasto.data.startsWith(prefixo)) dia = Math.max(dia, Number(gasto.data.slice(prefixo.length)));
  }
  return dia;
}

/**
 * Tela inicial: quanto ainda dá para gastar no mês e o dinheiro total, o ritmo do gasto contra o
 * ideal, o aviso da pior meta, as metas do mês e os últimos gastos.
 */
export function Inicio({ navegacao }: { navegacao: Navegacao }) {
  const [periodo, definirPeriodo] = useState(periodoAtual);
  const [mensagem, definirMensagem] = useState<MensagemDoAviso | null>(null);
  const [estadoDoOlho, sinalizarOlho] = useEstadoDoOlho();

  const contas = useContas();
  const gastos = useGastos(limites(periodo));
  const ganhos = useGanhos(limites(periodo));
  const metas = useProgressoDasMetas(mesDoPeriodo(periodo));
  const categorias = useCategorias();

  // Uma consulta que falha pisca o olho e avisa; os dados em cache continuam na tela.
  function avisarFalha(erro: unknown): void {
    sinalizarOlho("erro");
    definirMensagem({
      tipo: "erro",
      texto: ehSemResposta(erro) ? MENSAGEM_SERVIDOR_FORA : (erro as ErroDaApiCliente).mensagem,
    });
  }

  useEffect(() => {
    if (contas.erro) avisarFalha(contas.erro);
  }, [contas.erro]);
  useEffect(() => {
    if (gastos.erro) avisarFalha(gastos.erro);
  }, [gastos.erro]);
  useEffect(() => {
    if (ganhos.erro) avisarFalha(ganhos.erro);
  }, [ganhos.erro]);
  useEffect(() => {
    if (metas.erro) avisarFalha(metas.erro);
  }, [metas.erro]);
  useEffect(() => {
    if (categorias.erro) avisarFalha(categorias.erro);
  }, [categorias.erro]);

  const irParaTransacoes = () => navegacao.aoIrPara("transacoes");
  const momento = momentoDoPeriodo(periodo, periodoAtual());
  const renda = ganhos.dados && somar(ganhos.dados.map((ganho) => ganho.valor));
  const gasto = gastos.dados && somar(gastos.dados.map((item) => item.valor));
  const nomesDasCategorias = Object.fromEntries(
    (categorias.dados ?? []).map((categoria) => [categoria.codigo, categoria.nome]),
  );
  const aviso = avisoDoMes(metas.dados, nomesDasCategorias);

  let ritmo;
  if (gastos.dados === undefined || renda === undefined) {
    ritmo = (
      <p className={estilos.estado}>
        {gastos.carregando || ganhos.carregando
          ? "Carregando o ritmo do mês…"
          : "Não foi possível carregar o ritmo do mês."}
      </p>
    );
  } else {
    ritmo = (
      <GraficoDeRitmo
        periodo={periodo}
        acumulado={gastoAcumuladoPorDia(
          gastos.dados,
          periodo,
          ultimoDiaDaCurva(momento, periodo, gastos.dados),
        )}
        ideal={ritmoIdealPorDia(renda, periodo)}
        mesFuturo={momento === "futuro"}
        aoRegistrar={irParaTransacoes}
      />
    );
  }

  return (
    <Pagina
      navegacao={navegacao}
      estadoDoOlho={estadoDoOlho}
      mensagem={mensagem}
      aoDispensarMensagem={() => definirMensagem(null)}
      controles={{ periodo, aoMudarPeriodo: definirPeriodo }}
    >
      <div className={estilos.conteudo}>
        <Cartao variante="destaque" aria-label="Resumo do mês">
          <ResumoDoMes
            renda={renda}
            gasto={gasto}
            dinheiroTotal={dinheiroTotalDasContas(contas.dados)}
            momento={momento}
            aoRegistrarGanho={irParaTransacoes}
          />
        </Cartao>

        <Cartao variante="destaque" aria-label="Metas do mês" className={estilos.metas}>
          <h2 className={estilos.titulo}>Metas do mês</h2>
          <MetasDoMes
            resumo={metas.dados}
            carregando={metas.carregando}
            categorias={categorias.dados}
            aoAbrirOrcamento={() => navegacao.aoIrPara("orcamento")}
          />
        </Cartao>

        <Cartao aria-label="Ritmo do mês">
          <h2 className={estilos.titulo}>Ritmo do mês</h2>
          {ritmo}
        </Cartao>

        <Cartao>
          <UltimosGastos
            gastos={gastos.dados}
            carregando={gastos.carregando}
            contas={contas.dados}
            categorias={categorias.dados}
            aoVerTodas={irParaTransacoes}
          />
        </Cartao>

        <div className={estilos.aviso}>
          <AvisoDoMes aviso={aviso} />
        </div>
      </div>
    </Pagina>
  );
}
