import { TEXTURAS } from "../../aparencia/texturas";
import type { OpcaoDeAparencia, TexturaDoFundo } from "../../api/tipos";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import estilos from "./Aparencia.module.css";

type Propriedades = {
  opcoes: readonly OpcaoDeAparencia<TexturaDoFundo>[];
  valor: TexturaDoFundo;
  aoMudar: (valor: TexturaDoFundo) => void;
};

/** A textura do fundo: cada opção traz uma amostra e o nome (a amostra é só enfeite). */
export function EscolhaDaTextura({ opcoes, valor, aoMudar }: Propriedades) {
  return (
    <GrupoDeOpcoes
      legenda="Textura do fundo"
      valor={valor}
      aoMudar={(v) => aoMudar(v as TexturaDoFundo)}
      variante="cartao"
      opcoes={opcoes.map((o) => ({
        valor: o.codigo,
        titulo: o.nome,
        amostra: <span className={estilos.textura} style={{ background: TEXTURAS[o.codigo] }} />,
      }))}
    />
  );
}
