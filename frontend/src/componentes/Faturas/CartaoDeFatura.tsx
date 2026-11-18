import { useId, type ReactNode } from "react";

import type { Fatura } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { Cartao } from "../Cartao/Cartao";
import { AvisoDeEstimativa } from "./AvisoDeEstimativa";
import estilos from "./Faturas.module.css";
import { SeloDeSituacao } from "./SeloDeSituacao";

type Propriedades = {
  fatura: Fatura;
  /** A fatura em destaque (a mais recente) fica sempre aberta e não tem botão. */
  destaque?: boolean;
  /** Só nas recolhíveis: se o conteúdo está visível. */
  aberta?: boolean;
  aoAlternar?: () => void;
  /** O conteúdo (compras e pagamentos); só aparece com a fatura aberta. */
  children?: ReactNode;
};

/** Uma fatura: total, datas, o que foi pago e o que falta, com a situação em texto. */
export function CartaoDeFatura({ fatura, destaque = false, aberta = destaque, aoAlternar, children }: Propriedades) {
  const idDoConteudo = useId();
  const titulo = `Fatura com fechamento em ${dataParaExibicao(fatura.fechamento)}`;
  return (
    <Cartao como="article" variante={destaque ? "elevado" : "padrao"} aria-label={titulo}>
      <div className={estilos.cabecalhoDaFatura}>
        <h4 className={estilos.tituloDaFatura}>{titulo}</h4>
        <SeloDeSituacao situacao={fatura.situacao} />
      </div>
      <p className={destaque ? estilos.totalGrande : estilos.total} aria-label={`Total da fatura: ${formatar(fatura.total)}`}>
        {formatar(fatura.total)}
      </p>
      <dl className={estilos.dados}>
        <div>
          <dt>Vencimento</dt>
          <dd>{fatura.vencimento === null ? "Sem data" : dataParaExibicao(fatura.vencimento)}</dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>{formatar(fatura.pago)}</dd>
        </div>
        <div>
          <dt>Restante</dt>
          <dd>{formatar(fatura.restante)}</dd>
        </div>
        {paraCentavos(fatura.a_favor) > 0n && (
          <div>
            <dt>A favor</dt>
            <dd>{formatar(fatura.a_favor)}</dd>
          </div>
        )}
        {fatura.minimo !== null && (
          <div>
            <dt>Pagamento mínimo</dt>
            <dd>{formatar(fatura.minimo)}</dd>
          </div>
        )}
      </dl>
      {fatura.fonte === "estimada" && <AvisoDeEstimativa />}
      {!destaque && aoAlternar && (
        <Botao
          variante="terciario"
          aria-expanded={aberta}
          aria-controls={idDoConteudo}
          onClick={aoAlternar}
        >
          {aberta ? "Esconder compras" : `Ver compras (${fatura.quantidade_de_compras})`}
        </Botao>
      )}
      <div id={idDoConteudo} hidden={!aberta}>
        {aberta && children}
      </div>
    </Cartao>
  );
}
