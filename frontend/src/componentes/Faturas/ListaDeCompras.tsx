import type { CompraDaFatura } from "../../api/tipos";
import { deCentavos, formatar, paraCentavos } from "../../dinheiro/dinheiro";
import { dataParaExibicao } from "../../periodo/periodo";
import { Badge } from "../Badge/Badge";
import { Tabela } from "../Tabela/Tabela";
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
    <Tabela
      legenda="Compras da fatura"
      colunas={[
        { chave: "data", titulo: "Data" },
        { chave: "compra", titulo: "Compra" },
        { chave: "valor", titulo: "Valor", numerica: true },
      ]}
      linhas={compras.map((compra) => ({
        data: dataParaExibicao(compra.data),
        compra: (
          <div className={estilos.compra}>
            <span className={estilos.descricaoDaCompra}>{compra.descricao}</span>
            <span className={estilos.apoioDaCompra}>
              {compra.parcela_numero !== null && compra.parcela_total !== null && (
                <span>Parcela {compra.parcela_numero}/{compra.parcela_total}</span>
              )}
              <Badge>{textoDoEstado(compra)}</Badge>
            </span>
          </div>
        ),
        valor: valorDaCompra(compra),
      }))}
    />
  );
}
