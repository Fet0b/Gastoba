import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { Dialogo } from "../Dialogo/Dialogo";
import { useEffect, useId, useState } from "react";

import { ErroDaApiCliente } from "../../api/cliente";
import { useDefinirDestinacoesDoInvestimento, useDestinacoesCadastradas } from "../../api/consultas";
import { invalidar } from "../../api/useConsulta";
import type { Investimento } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import {
  destinacoesParaEnvio,
  type LinhaDeDestinacao,
  motivoDasDestinacoes,
} from "../../investimentos/destinacoes";
import { ehSemResposta, MENSAGEM_SERVIDOR_FORA } from "../../paginas/mensagens";
import { normalizarTag } from "../../tags/tags";
import { EditorDeDestinacoes, LINHA_INICIAL } from "./EditorDeDestinacoes";
import { Botao } from "../Botao/Botao";
import { EstadoDeErro } from "../EstadoDeErro/EstadoDeErro";
import estilos from "./Investimentos.module.css";

type Propriedades = {
  emDialogo?: boolean;
  investimento: Investimento;
  aoDefinir: () => void;
  aoCancelar: () => void;
  aoFalhar: (erro: unknown) => void;
};

/** O valor aplicado só quando é da instituição; o estimado pelos aportes não serve de base. */
function aplicadoDaInstituicao(investimento: Investimento): string | null {
  return investimento.origem_da_rentabilidade === "instituicao" ? investimento.valor_aplicado : null;
}

/**
 * A mesma regra do backend, só para mostrar quanto cabe a cada destinação: o valor aplicado (ou o
 * saldo, se a instituição não informa) menos o principal já registrado; `undefined` se nada sobra.
 */
export function valorADestinar(investimento: Investimento): string | undefined {
  if (investimento.alocacao_por_fracao) return investimento.destinacoes.find(d => d.tag === null && paraCentavos(d.valor_atual) > 0n)?.valor_atual;
  const base = paraCentavos(aplicadoDaInstituicao(investimento) ?? investimento.saldo);
  const principal = investimento.destinacoes.reduce(
    (soma, d) => soma + (d.tag === null ? 0n : paraCentavos(d.principal)),
    0n,
  );
  return base > principal ? deCentavos(base - principal) : undefined;
}

/**
 * Se a posição oferece "Definir destinações": há valor a destinar pela regra do backend. Sem o
 * valor aplicado, a base é o saldo, e depois do primeiro principal o que sobra é só rendimento
 * (já rateado entre as destinações), então só a posição ainda sem destinação oferece.
 */
export function temValorADestinar(investimento: Investimento): boolean {
  if (valorADestinar(investimento) === undefined) return false;
  if (investimento.alocacao_por_fracao) return true;
  return aplicadoDaInstituicao(investimento) !== null || !investimento.destinacoes.some((d) => d.tag !== null);
}

/**
 * Diz para o que é a parte da posição que ainda não tem destinação (a que já existia antes de
 * qualquer aporte registrado): divide em tags por porcentagem. Vira um aporte de "Saldo inicial",
 * sem conta; a API decide quanto há a destinar e a mensagem dela aparece aqui.
 */
export function DefinirDestinacoes({ emDialogo = false, investimento, aoDefinir, aoCancelar, aoFalhar }: Propriedades) {
  const id = useId();
  const idErro = `${id}-erro`;
  const definir = useDefinirDestinacoesDoInvestimento();
  const catalogo = useDestinacoesCadastradas();
  const [linhas, definirLinhas] = useState<LinhaDeDestinacao[]>([{ ...LINHA_INICIAL }]);
  const motivo = motivoDasDestinacoes(linhas) ?? (investimento.alocacao_por_fracao && linhas.some(l => !catalogo.dados?.some(d => d.nome === normalizarTag(l.tag))) ? "Escolha uma caixinha cadastrada." : null);
  const valor = valorADestinar(investimento);
  const erro =
    definir.erro === null || definir.erro === undefined
      ? null
      : ehSemResposta(definir.erro)
        ? MENSAGEM_SERVIDOR_FORA
        : (definir.erro as ErroDaApiCliente).mensagem;

  // Falha de rede: a tela dona avisa (o erro da API aparece aqui, junto ao editor).
  useEffect(() => {
    if (definir.erro !== null && definir.erro !== undefined && ehSemResposta(definir.erro)) {
      aoFalhar(definir.erro);
    }
  }, [definir.erro]);

  async function enviar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    if (motivo !== null || definir.pendente) return;
    const feito = await definir.executar({
      investimentoId: investimento.id,
      alocar: investimento.alocacao_por_fracao,
      dados: { destinacoes: destinacoesParaEnvio(linhas) },
    });
    if (feito) aoDefinir();
  }

  const acoes = (<div className={estilos.acoes}><Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao><Botao variante="primario"
          type="submit" form={`${id}-formulario`}
          disabled={motivo !== null || definir.pendente}
          aria-describedby={erro ? idErro : undefined}
        >
          {definir.pendente ? "Salvando…" : investimento.alocacao_por_fracao ? "Salvar caixinhas" : "Salvar destinações"}
        </Botao></div>);
  const formulario = (
    <form id={`${id}-formulario`}
      className={estilos.formulario}
      aria-label={`Definir destinações de ${investimento.nome}`}
      onSubmit={(evento) => void enviar(evento)}
    >
      {valor !== undefined && (
        <p className={estilos.apoio}>
          A dividir: {formatar(valor)}, {investimento.alocacao_por_fracao ? "o valor sem caixinha. As demais caixinhas permanecem como estão." : "o valor aplicado que ainda não tem destinação."}
        </p>
      )}
      <EditorDeDestinacoes
        legenda="Para o que é este investimento"
        investimentos={[investimento]}
        investimentoId={investimento.id}
        aoMudarInvestimento={() => {}}
        linhas={linhas}
        aoMudarLinhas={definirLinhas}
        valor={valor}
        escolherInvestimento={false}
        destinacoesCadastradas={catalogo.dados?.map((item) => item.nome) ?? []}
      />
      {Boolean(catalogo.erro) && <EstadoDeErro mensagem="Não foi possível carregar as caixinhas cadastradas." aoTentarDeNovo={() => invalidar("destinacoes-cadastradas")} />}
      {erro && (
        <p id={idErro} role="alert" className={estilos.erro}>
          {erro}
        </p>
      )}
      {motivo && <p className={estilos.apoio}>{motivo}</p>}
      {!emDialogo && acoes}
    </form>
  );
  return emDialogo ? <Dialogo aberto titulo={`Definir destinações de ${normalizarNomeDaInstituicao(investimento.nome)}`} aoFechar={aoCancelar} rodape={acoes}>{formulario}</Dialogo> : formulario;
}
