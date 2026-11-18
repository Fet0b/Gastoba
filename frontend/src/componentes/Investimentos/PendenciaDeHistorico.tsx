import type { Investimento } from "../../api/tipos";
import { textoDaPendencia } from "../../investimentos/rentabilidade";
import { normalizarNomeDaInstituicao } from "../../texto/nomeDaInstituicao";
import { Banner } from "../Banner/Banner";

/** Diz por que a rentabilidade está ausente e o que a pessoa precisa informar. */
export function PendenciaDeHistorico({ investimento: i }: { investimento: Investimento }) {
  if (i.historico_completo !== false) return null;
  const nome = normalizarNomeDaInstituicao(i.nome);
  const pendencias = i.pendencias ?? [];
  return <div role="note">
    <Banner
      tom="atencao"
      titulo="Histórico incompleto"
      texto={pendencias.length > 0
        ? pendencias.map(p => textoDaPendencia(p, nome)).join(" ")
        : "Complete o histórico da posição para ver a rentabilidade."}
    />
  </div>;
}
