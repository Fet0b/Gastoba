import type { CorDaDestinacao, IconeDaCaixinha } from "../../api/tipos";
import { ICONES_DA_CAIXINHA } from "../../investimentos/caixinhas";
import { HEX_DA_COR, NOMES_DAS_CORES } from "../../investimentos/cores";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import { Icone } from "../Icone/Icone";
import estilos from "./Caixinhas.module.css";

/** Valor do grupo de cores para "sem cor escolhida" (a cor automática). */
export const COR_AUTOMATICA = "automatica";

/** A cor em círculo (ou o círculo tracejado da automática); só enfeite, o nome vai no texto. */
export function AmostraDaCor({ cor }: { cor: CorDaDestinacao | null }) {
  return cor === null ? (
    <span className={estilos.amostraAutomatica} />
  ) : (
    <span className={estilos.amostraDaCor} style={{ backgroundColor: HEX_DA_COR[cor] }} />
  );
}

type Propriedades<T> = { valor: T; aoMudar: (valor: T) => void; desabilitado?: boolean };

/** Os seis ícones, cada um com o desenho e o nome (o cofre é o padrão). */
export function EscolhaDoIcone({ valor, aoMudar, desabilitado = false }: Propriedades<IconeDaCaixinha>) {
  return (
    <GrupoDeOpcoes
      legenda="Ícone"
      escolhida={ICONES_DA_CAIXINHA.find((i) => i.codigo === valor)?.rotulo}
      valor={valor}
      aoMudar={(codigo) => aoMudar(codigo as IconeDaCaixinha)}
      desabilitado={desabilitado}
      variante="compacta"
      opcoes={ICONES_DA_CAIXINHA.map((i) => ({
        valor: i.codigo,
        titulo: i.rotulo,
        amostra: <Icone nome={i.codigo} tamanho={20} />,
      }))}
    />
  );
}

/** As oito cores da paleta de destinações e a automática. */
export function EscolhaDaCorDaCaixinha({ valor, aoMudar, desabilitado = false }: Propriedades<CorDaDestinacao | null>) {
  return (
    <GrupoDeOpcoes
      legenda="Cor"
      escolhida={valor === null ? "Automática" : NOMES_DAS_CORES[valor]}
      valor={valor ?? COR_AUTOMATICA}
      aoMudar={(codigo) => aoMudar(codigo === COR_AUTOMATICA ? null : (codigo as CorDaDestinacao))}
      desabilitado={desabilitado}
      variante="compacta"
      opcoes={[
        { valor: COR_AUTOMATICA, titulo: "Automática", amostra: <AmostraDaCor cor={null} /> },
        ...(Object.keys(HEX_DA_COR) as CorDaDestinacao[]).map((codigo) => ({
          valor: codigo,
          titulo: NOMES_DAS_CORES[codigo],
          amostra: <AmostraDaCor cor={codigo} />,
        })),
      ]}
    />
  );
}
