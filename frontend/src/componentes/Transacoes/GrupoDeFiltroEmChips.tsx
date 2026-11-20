import { Chip } from "../Chip/Chip";
import estilos from "./FiltrosEmFolha.module.css";

export type OpcaoDeFiltro = { valor: string; rotulo: string; cor?: string };

type Propriedades = {
  /** Vai no nome do grupo: "Filtrar por conta". */
  legenda: "conta" | "categoria" | "tag";
  /** O título visível do grupo ("Contas"). */
  titulo: string;
  opcoes: readonly OpcaoDeFiltro[] | undefined;
  selecionados: readonly string[];
  aoAlternar: (valor: string) => void;
};

/** Um grupo de chips alternáveis (várias escolhas); o selecionado fica preenchido e com ✓. */
export function GrupoDeFiltroEmChips({ legenda, titulo, opcoes, selecionados, aoAlternar }: Propriedades) {
  if (!opcoes?.length) return null;
  return (
    <div className={estilos.grupo} role="group" aria-label={`Filtrar por ${legenda}`}>
      <span className={estilos.tituloDoGrupo} aria-hidden="true">
        {titulo}
      </span>
      <ul className={estilos.chips}>
        {opcoes.map((opcao) => (
          <li key={opcao.valor}>
            <Chip
              selecionado={selecionados.includes(opcao.valor)}
              cor={opcao.cor}
              aoAlternar={() => aoAlternar(opcao.valor)}
            >
              {opcao.rotulo}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}
