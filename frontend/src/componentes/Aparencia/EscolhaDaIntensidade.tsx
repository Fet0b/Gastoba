import type { IntensidadeDaCor, OpcaoDeAparencia } from "../../api/tipos";
import { ControleSegmentado } from "../ControleSegmentado/ControleSegmentado";
import estilos from "./Aparencia.module.css";

type Propriedades = {
  opcoes: readonly OpcaoDeAparencia<IntensidadeDaCor>[];
  valor: IntensidadeDaCor;
  aoMudar: (valor: IntensidadeDaCor) => void;
};

/** Quanto a cor aparece nos fundos: suave, média ou viva. */
export function EscolhaDaIntensidade({ opcoes, valor, aoMudar }: Propriedades) {
  return (
    <div className={estilos.escolha}>
      <span className={estilos.legenda}>
        Intensidade
      </span>
      <ControleSegmentado
        nome="Intensidade da cor"
        opcoes={opcoes.map((o) => ({ valor: o.codigo, rotulo: o.nome }))}
        valor={valor}
        aoMudar={aoMudar}
      />
    </div>
  );
}
