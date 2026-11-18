import type { CompraDaFatura } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { Badge } from "../Badge/Badge";
import estilos from "./Faturas.module.css";

/** De onde a compra veio: ainda na caixa de entrada, já virou gasto ou ganho, ou foi ignorada. */
function textoDoEstado(compra: CompraDaFatura): string {
  if (compra.estado === "pendente") return "Na caixa";
  if (compra.estado === "ignorada") return "Ignorada";
  return compra.sentido === "entrada" ? "Ganho" : "Gasto";
}

/** O estorno (entrada) abate o total da fatura: aparece com sinal de menos. */
function valorDaCompra(compra: CompraDaFatura): string {
  const centavos = paraCentavos(compra.valor);
  return formatar(deCentavos(compra.sentido === "entrada" ? -centavos : centavos));
}

export function ListaDeCompras({ compras }: { compras: CompraDaFatura[] }) {
  if (compras.length === 0) return <p className={estilos.vazio}>Nenhuma compra nesta fatura.</p>;
  return (
    <ul className={estilos.compras} aria-label="Compras da fatura">
      {compras.map((compra) => (
        <li key={compra.id} className={estilos.compra}>
          <span className={estilos.dataDaCompra}>{dataParaExibicao(compra.data)}</span>
          <span className={estilos.descricaoDaCompra}>{compra.descricao}</span>
          {compra.parcela_numero !== null && compra.parcela_total !== null && (
            <span className={estilos.parcela}>
              Parcela {compra.parcela_numero}/{compra.parcela_total}
            </span>
          )}
          <span className={estilos.estadoDaCompra}>
            <Badge>{textoDoEstado(compra)}</Badge>
          </span>
          <span className={estilos.valorDaCompra} data-sentido={compra.sentido}>
            {valorDaCompra(compra)}
          </span>
        </li>
      ))}
    </ul>
  );
}
