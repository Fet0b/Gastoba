// Módulo puro (sem React nem fetch): a taxa contratada escrita como a instituição a mostra.

import type { TaxaDoInvestimento } from "../api/tipos";

const virgula = (numero: string): string => numero.replace(".", ",");

/**
 * A taxa para a tela: "101,2% CDI", "100% IPCA + 5,5% a.a." ou "12,5% a.a.". O adicional ao ano
 * zero não chega da API (some), então `101,2% CDI + 0% a.a.` aparece só como "101,2% CDI". `null`
 * se a instituição não informa taxa.
 */
export function rotuloDaTaxa(taxa: TaxaDoInvestimento | null): string | null {
  if (taxa === null) return null;
  const principal =
    taxa.percentual === null
      ? null
      : `${virgula(taxa.percentual)}%${taxa.indexador === null ? "" : ` ${taxa.indexador}`}`;
  const adicional = taxa.adicional_anual === null ? null : `${virgula(taxa.adicional_anual)}% a.a.`;
  if (principal !== null && adicional !== null) return `${principal} + ${adicional}`;
  return principal ?? adicional;
}
