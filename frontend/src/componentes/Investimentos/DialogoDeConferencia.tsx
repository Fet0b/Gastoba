import { type FormEvent, useId, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useDefinirCaixinha, useDefinirReferenciaDaCaixinha, useReconciliacaoDaCaixinha } from "../../api/consultas";
import type { Conta, Investimento } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { hojeLocal } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { CampoDeData } from "../Campo/CampoDeData";
import { CampoDeMes } from "../Campo/CampoDeMes";
import { CampoDeValor } from "../Campo/CampoDeValor";
import { Caixa } from "../Campo/Caixa";
import { Seletor } from "../Campo/Seletor";
import { Dialogo } from "../Dialogo/Dialogo";
import { Esqueleto } from "../Esqueleto/Esqueleto";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import estilos from "./ConferenciaDaCaixinha.module.css";

type Propriedades = {
  contas: readonly Conta[];
  investimentos: readonly Investimento[];
  aoFechar: () => void;
};

export function DialogoDeConferencia({ contas, investimentos, aoFechar }: Propriedades) {
  const [escolhida, escolher] = useState("");
  const [aba, mudarAba] = useState<"hoje" | "mes">("hoje");
  const [confirmada, confirmarPosicao] = useState<{ contaId: string; id: string } | null>(null);
  const contaId = escolhida || (contas.length === 1 ? contas[0].id : "");
  const investimentoId = investimentos.find(i => i.tipo === "CAIXINHA" && i.conta_id === contaId)?.id
    ?? (confirmada?.contaId === contaId ? confirmada.id : "");
  const [saldo, mudarSaldo] = useState("0.00");
  const [data, mudarData] = useState(hojeLocal);
  const [mes, mudarMes] = useState(() => hojeLocal().slice(0, 7));
  const [inicial, mudarInicial] = useState("0.00");
  const [final, mudarFinal] = useState("0.00");
  const [fimPreenchido, marcarFim] = useState(false);
  const [completo, marcarCompleto] = useState(false);
  const definir = useDefinirCaixinha();
  const referencia = useDefinirReferenciaDaCaixinha();
  const consulta = useReconciliacaoDaCaixinha(aba === "mes" ? investimentoId : "", mes);
  const id = useId();
  const pendente = definir.pendente || referencia.pendente;
  const mesValido = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const faltas = aba === "hoje"
    ? [!contaId && "escolher a conta", !data && "data do saldo"]
    : [!investimentoId && "confirmar a posição", !mesValido && "mês válido", !fimPreenchido && "saldo no fim do mês", !completo && "confirmar a conferência"];
  const falta = faltas.filter(Boolean).join(" e ");
  const erro = aba === "hoje" ? definir.erro : referencia.erro;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (falta || pendente) return;
    if (aba === "hoje") {
      const resultado = await definir.executar({ conta_id: contaId, saldo_remunerado: saldo, data_do_saldo: data });
      if (resultado) confirmarPosicao({ contaId, id: resultado.id });
    } else {
      await referencia.executar({ investimentoId, mes, saldo_inicial: inicial, saldo_final: final, periodo_completo: completo });
    }
  }

  return (
    <Dialogo aberto titulo="Conferir com extrato" aoFechar={aoFechar} bloqueado={pendente}
      rodape={<>
        <Botao variante="secundario" disabled={pendente} onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" type="submit" form={id} disabled={Boolean(falta) || pendente} aria-describedby={`${id}-falta`}>
          {aba === "hoje" ? "Confirmar saldo" : "Salvar conferência"}
        </Botao>
      </>}
    >
      <form id={id} onSubmit={enviar} className={estilos.campos}>
        <p className={estilos.apoio}>Compare o saldo do app com o extrato do banco para achar lançamentos faltando.</p>
        <Seletor rotulo="Conta investimentos" valor={contaId} aoMudar={valor => { escolher(valor); mudarAba("hoje"); marcarCompleto(false); marcarFim(false); }}
          vazio="Escolha a conta" opcoes={contas.map(c => ({ valor: c.id, rotulo: c.nome }))} disabled={pendente} />
        <div className={estilos.abas} role="group" aria-label="Tipo de conferência">
          <Botao variante="terciario" aria-pressed={aba === "hoje"} onClick={() => mudarAba("hoje")} disabled={pendente}>Saldo de hoje</Botao>
          <Botao variante="terciario" aria-pressed={aba === "mes"} onClick={() => mudarAba("mes")} disabled={!investimentoId || pendente} aria-describedby={!investimentoId ? `${id}-posicao` : undefined}>Fechamento do mês</Botao>
        </div>
        {!investimentoId && <p id={`${id}-posicao`} className={estilos.apoio}>Confirme o saldo de hoje para criar a posição e liberar o fechamento do mês.</p>}
        {aba === "hoje" ? <>
          <CampoDeValor rotulo="Saldo no extrato" valor={saldo} aoMudar={mudarSaldo} />
          <CampoDeData rotulo="Data do saldo" valor={data} aoMudar={mudarData} disabled={pendente} />
        </> : <>
          <CampoDeMes rotulo="Mês do extrato" valor={mes} aoMudar={valor => { mudarMes(valor); marcarCompleto(false); marcarFim(false); }} disabled={pendente} />
          <div className={estilos.saldos}>
            <CampoDeValor rotulo="Saldo no início do mês" valor={inicial} aoMudar={mudarInicial} />
            <CampoDeValor rotulo="Saldo no fim do mês" valor={final} aoMudar={valor => { mudarFinal(valor); marcarFim(true); }} />
          </div>
          <Caixa rotulo="Conferi todos os lançamentos do extrato deste mês" marcada={completo} aoMudar={marcarCompleto} disabled={pendente} />
          {!fimPreenchido && <p className={estilos.atencao}>Diferença: preencha o fim do mês.</p>}
          {consulta.carregando ? <Esqueleto rotulo="Carregando conferência" linhas={2} /> : consulta.erro ?
            <EstadoDeErro mensagem={consulta.erro instanceof ErroDaApiCliente ? consulta.erro.mensagem : "Não foi possível carregar a conferência."} /> :
            consulta.dados && <div className={estilos.resultado} aria-live="polite">
              <p>{consulta.dados.conciliado ? "Conta investimentos conciliada no mês." : consulta.dados.completo ? "Há divergência com o extrato." : "Conferência incompleta: confira o período e as transações pendentes."}</p>
              <dl><div><dt>Saldo calculado pelo app</dt><dd>{formatar(consulta.dados.saldo_calculado)}</dd></div><div><dt>Saldo no extrato</dt><dd>{formatar(consulta.dados.saldo_observado)}</dd></div><div><dt>Diferença</dt><dd>{formatar(consulta.dados.diferenca)}</dd></div></dl>
            </div>}
        </>}
        {erro != null && <EstadoDeErro mensagem={erro instanceof ErroDaApiCliente ? erro.mensagem : "Não foi possível salvar a conferência."} />}
        <p id={`${id}-falta`} className={estilos.apoio}>{pendente ? "Salvando a conferência…" : falta ? `Falta: ${falta}.` : "Confira os valores antes de confirmar."}</p>
      </form>
    </Dialogo>
  );
}
