import type { MarcaDoApp, OpcaoDeAparencia } from "../../api/tipos";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import { Marca } from "../Marca/Marca";
import estilos from "./Aparencia.module.css";

type Propriedades = {
  opcoes: readonly OpcaoDeAparencia<MarcaDoApp>[];
  valor: MarcaDoApp;
  /** O nome digitado: a marca "Inicial do nome" mostra a letra dele. */
  nomeDoApp: string;
  aoMudar: (valor: MarcaDoApp) => void;
};

/** A logo do app, de um conjunto fixo: amostra e nome de cada uma. */
export function EscolhaDaMarca({ opcoes, valor, nomeDoApp, aoMudar }: Propriedades) {
  return (
    <GrupoDeOpcoes
      legenda="Logo"
      valor={valor}
      aoMudar={(v) => aoMudar(v as MarcaDoApp)}
      variante="cartao"
      opcoes={opcoes.map((o) => ({
        valor: o.codigo,
        titulo: o.nome,
        amostra: <Marca marca={o.codigo} nome={nomeDoApp} decorativo className={estilos.marcaDeAmostra} />,
      }))}
    />
  );
}
