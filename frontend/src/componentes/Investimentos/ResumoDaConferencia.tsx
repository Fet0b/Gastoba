import { useState } from "react";

import { useContas, useReconciliacaoDaCaixinha } from "../../api/consultas";
import type { Investimento } from "../../api/tipos";
import { anterior, mesDoPeriodo, periodoAtual, rotulo } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { Cartao } from "../Cartao/Cartao";
import { Dica } from "../Dica/Dica";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import { Icone } from "../Icone/Icone";
import { Titulo } from "../Titulo/Titulo";
import { DialogoDeConferencia } from "./DialogoDeConferencia";
import estilos from "./ConferenciaDaCaixinha.module.css";

export function ResumoDaConferencia({ investimentos }: { investimentos: readonly Investimento[] }) {
  const contas = useContas();
  const [aberto, abrir] = useState(false);
  const remuneradas = (contas.dados ?? []).filter(c => c.tipo === "remunerada");
  const investimentoId = remuneradas.length === 1 ? investimentos.find(i => i.tipo === "CAIXINHA" && i.conta_id === remuneradas[0].id)?.id ?? "" : "";
  const atual = periodoAtual();
  const passado = anterior(atual);
  const mesAtual = useReconciliacaoDaCaixinha(investimentoId, mesDoPeriodo(atual));
  const mesPassado = useReconciliacaoDaCaixinha(investimentoId, mesDoPeriodo(passado));
  if (contas.erro) return <EstadoDeErro mensagem="Não foi possível carregar as contas para conferência." />;
  if (contas.dados === undefined) return <Esqueleto rotulo="Carregando contas para conferência" linhas={2} />;
  if (remuneradas.length === 0) return null;

  return <>
    <Cartao aria-label="Conferência com extrato" className={estilos.secao}>
      <div className={estilos.cabecalho}><Titulo nivel="secao">Conferência com extrato</Titulo><Dica assunto="a conferência com extrato">Compare o saldo informado pela instituição com os lançamentos do app.</Dica></div>
      <p className={estilos.apoio}>Compare o saldo do app com o extrato do banco para achar lançamentos faltando.</p>
      {investimentoId && <div className={estilos.situacoes}>
        {[0, 1].map(indice => {
          const competencia = indice === 0 ? passado : atual;
          const resultado = indice === 0 ? mesPassado : mesAtual;
          const nome = rotulo(competencia).split(" de ")[0];
          const texto = nome.charAt(0).toUpperCase() + nome.slice(1);
          const conferido = !resultado.carregando && !resultado.erro && resultado.dados?.conciliado === true;
          return <span key={mesDoPeriodo(competencia)} className={estilos.situacao} data-conferido={conferido}><Icone nome={conferido ? "ok" : "alerta"} tamanho={16} />{texto} {conferido ? "conferido" : "pendente"}</span>;
        })}
      </div>}
      <Botao variante="secundario" onClick={() => abrir(true)}>Conferir com extrato</Botao>
    </Cartao>
    {aberto && <DialogoDeConferencia contas={remuneradas} investimentos={investimentos} aoFechar={() => abrir(false)} />}
  </>;
}
