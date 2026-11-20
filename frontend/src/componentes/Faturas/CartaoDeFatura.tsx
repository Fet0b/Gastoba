import { useId, type ReactNode } from "react";

import type { Fatura } from "../../api/tipos";
import { formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { cicloDaFatura } from "../../faturas/cicloDaFatura";
import { dataParaExibicao } from "../../periodo/periodo";
import { Botao } from "../Botao/Botao";
import { Cartao } from "../Cartao/Cartao";
import { AvisoDeEstimativa } from "./AvisoDeEstimativa";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./Faturas.module.css";
import { SeloDeSituacao } from "./SeloDeSituacao";

type Propriedades = {
  fatura: Fatura;
  /** A fatura em destaque (a mais recente): total grande e, se aberta, a barra do ciclo. */
  destaque?: boolean;
  /** Se o conteúdo está visível. Sem `aoAlternar` (sem botão), a em destaque fica sempre aberta. */
  aberta?: boolean;
  /** O botão "Ver lançamentos" ou "Ver compras"; sem ele não há como recolher. */
  aoAlternar?: () => void;
  /** Hoje, para a barra do ciclo da fatura aberta em destaque. */
  hoje?: string;
  /** O conteúdo (compras e pagamentos); só aparece com a fatura aberta. */
  children?: ReactNode;
};

/** Uma fatura: total, datas, o que foi pago e o que falta, com a situação em texto. */
export function CartaoDeFatura({ fatura, destaque = false, aberta: abertaInformada, aoAlternar, hoje, children }: Propriedades) {
  const aberta = abertaInformada ?? (destaque && aoAlternar === undefined);
  const idDoConteudo = useId();
  const titulo = `Fatura com fechamento em ${dataParaExibicao(fatura.fechamento)}`;
  const ciclo = destaque && fatura.situacao === "aberta" && hoje !== undefined ? cicloDaFatura(fatura.inicio, fatura.fechamento, hoje) : null;
  const lancamentos = `${fatura.quantidade_de_compras} ${fatura.quantidade_de_compras === 1 ? "lançamento" : "lançamentos"} neste ciclo`;
  return (
    <Cartao como="article" variante={destaque ? "elevado" : "padrao"} aria-label={titulo}>
      <div className={estilos.cabecalhoDaFatura}>
        <Titulo nivel="cartao" como="h4" className={estilos.tituloDaFatura}>{titulo}</Titulo>
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
      {ciclo !== null && (
        <div className={estilos.ciclo}>
          <div
            className={estilos.trilho}
            role="img"
            aria-label={`Ciclo da fatura: dia ${ciclo.dia} de ${ciclo.dias}`}
            data-percentual={ciclo.percentual}
          >
            <span className={estilos.preenchimento} style={{ width: `${ciclo.percentual}%` }} />
          </div>
          <p className={estilos.legendaDoCiclo}>
            <span>{lancamentos}</span>
            <span>dia {ciclo.dia} de {ciclo.dias}</span>
          </p>
        </div>
      )}
      {fatura.fonte === "estimada" && <AvisoDeEstimativa />}
      {aoAlternar && (
        <Botao
          variante="terciario"
          aria-expanded={aberta}
          aria-controls={idDoConteudo}
          onClick={aoAlternar}
        >
          {destaque
            ? aberta ? "Esconder lançamentos" : "Ver lançamentos"
            : aberta ? "Esconder compras" : `Ver compras (${fatura.quantidade_de_compras})`}
        </Botao>
      )}
      <div id={idDoConteudo} hidden={!aberta}>
        {aberta && children}
      </div>
    </Cartao>
  );
}
