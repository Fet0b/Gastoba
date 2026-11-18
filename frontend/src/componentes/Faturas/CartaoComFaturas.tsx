import { useState } from "react";

import type { CartaoComFaturas as Cartao } from "../../api/tipos";
import { formatar } from "../../dinheiro/dinheiro";
import { Botao } from "../Botao/Botao";
import { CartaoDeFatura } from "./CartaoDeFatura";
import { DetalheDaFatura } from "./DetalheDaFatura";
import estilos from "./Faturas.module.css";

/** Um cartão: a fatura mais recente em destaque e, sob "Faturas anteriores", as demais recolhidas. */
export function CartaoComFaturas({ cartao, hoje }: { cartao: Cartao; hoje: string }) {
  const [recente, ...anteriores] = cartao.faturas;
  const [mostrarAnteriores, definirMostrarAnteriores] = useState(false);
  const [abertas, definirAbertas] = useState<ReadonlySet<string>>(new Set());

  function alternar(id: string) {
    definirAbertas((atuais) => {
      const proximas = new Set(atuais);
      if (!proximas.delete(id)) proximas.add(id);
      return proximas;
    });
  }

  return (
    <section className={estilos.cartao} aria-label={`Faturas do cartão ${cartao.conta_nome}`}>
      <div>
        <h3 className={estilos.nomeDoCartao}>{cartao.conta_nome}</h3>
        <p className={estilos.valorDevido}>Valor devido hoje: {formatar(cartao.valor_devido)}</p>
      </div>
      {recente === undefined ? (
        <p className={estilos.vazio}>Ainda não há faturas para este cartão.</p>
      ) : (
        <CartaoDeFatura fatura={recente} destaque>
          <DetalheDaFatura id={recente.id} hoje={hoje} />
        </CartaoDeFatura>
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
