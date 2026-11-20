import { useState } from "react";

import type { CartaoComFaturas as Cartao } from "../../api/tipos";
import { rotuloDoCartao } from "../../contas/identificacao";
import { diaDoMesDe } from "../../faturas/cicloDaFatura";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { Badge } from "../Badge/Badge";
import { Botao } from "../Botao/Botao";
import { Metadados } from "../Metadados/Metadados";
import { Titulo } from "../Titulo/Titulo";
import { CartaoDeFatura } from "./CartaoDeFatura";
import { DetalheDaFatura } from "./DetalheDaFatura";
import estilos from "./Faturas.module.css";

/** "05/11" a partir de "2026-11-05". */
function diaEMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/**
 * Um cartão de crédito: nome, selo e os dias de fechar e vencer, o valor devido hoje, a fatura mais
 * recente em destaque (com a barra do ciclo quando aberta) e as anteriores recolhidas. O vazio fala só das
 * faturas fechadas, para não contradizer o valor devido.
 */
export function CartaoComFaturas({
  cartao,
  hoje,
  finalDoNumero = null,
}: {
  cartao: Cartao;
  hoje: string;
  /** Os quatro últimos dígitos da conta do cartão, quando o banco os informa. */
  finalDoNumero?: string | null;
}) {
  const rotulo = rotuloDoCartao(cartao);
  const final = finalDoNumero ? `final ${finalDoNumero}` : null;
  const [recente, ...anteriores] = cartao.faturas;
  const [mostrarAnteriores, definirMostrarAnteriores] = useState(false);
  const [abertas, definirAbertas] = useState<ReadonlySet<string>>(new Set());
  const aberta = cartao.faturas.find((fatura) => fatura.situacao === "aberta");
  const semFechadas = cartao.faturas.every((fatura) => fatura.situacao === "aberta");
  const devido = paraCentavos(cartao.valor_devido);

  function alternar(id: string) {
    definirAbertas((atuais) => {
      const proximas = new Set(atuais);
      if (!proximas.delete(id)) proximas.add(id);
      return proximas;
    });
  }

  return (
    <section className={estilos.cartao} aria-label={`Faturas do cartão ${[rotulo, final].filter(Boolean).join(", ")}`}>
      <div className={estilos.cabecalhoDoCartao}>
        <div className={estilos.identificacao}>
          <div className={estilos.nomeESelo}>
            <Titulo nivel="cartao" como="h3" className={estilos.nomeDoCartao}>{rotulo}</Titulo>
            <Badge>Cartão de crédito</Badge>
          </div>
          {(recente !== undefined || final !== null) && (
            <Metadados>
              {final !== null && <span>{final}</span>}
              {recente !== undefined && <span>Fecha dia {diaDoMesDe(recente.fechamento)}</span>}
              {recente !== undefined && recente.vencimento !== null && <span>vence dia {diaDoMesDe(recente.vencimento)}</span>}
            </Metadados>
          )}
        </div>
        <p className={estilos.valorDevido} data-tom={devido > 0n ? "negativo" : "neutro"}>
          <span className={estilos.rotuloDoValor}>Valor devido hoje</span>
          <span className={estilos.valorDoCartao}>{formatar(cartao.valor_devido)}</span>
        </p>
      </div>
      {recente !== undefined && (
        <CartaoDeFatura
          fatura={recente}
          destaque
          hoje={hoje}
          aberta={abertas.has(recente.id)}
          aoAlternar={() => alternar(recente.id)}
        >
          <DetalheDaFatura id={recente.id} hoje={hoje} />
        </CartaoDeFatura>
      )}
      {semFechadas && (
        <p className={estilos.vazio}>
          {aberta !== undefined
            ? `Nenhuma fatura fechada ainda. A primeira fecha em ${diaEMes(aberta.fechamento)}.`
            : "Nenhuma fatura fechada ainda."}
        </p>
      )}
      {anteriores.length > 0 && (
        <div className={estilos.anteriores}>
          <Botao
            variante="secundario"
            aria-expanded={mostrarAnteriores}
            onClick={() => definirMostrarAnteriores(!mostrarAnteriores)}
          >
            Faturas anteriores
          </Botao>
          {mostrarAnteriores &&
            anteriores.map((fatura) => (
              <CartaoDeFatura
                key={fatura.id}
                fatura={fatura}
                aberta={abertas.has(fatura.id)}
                aoAlternar={() => alternar(fatura.id)}
              >
                <DetalheDaFatura id={fatura.id} hoje={hoje} />
              </CartaoDeFatura>
            ))}
        </div>
      )}
    </section>
  );
}
