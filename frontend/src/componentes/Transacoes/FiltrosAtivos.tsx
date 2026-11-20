import type { FiltroAtivo } from "../../transacoes/filtros";
import { Botao } from "../Botao/Botao";
import { Icone } from "../Icone/Icone";
import estilos from "./FiltrosEmFolha.module.css";

type Propriedades = {
  ativos: readonly FiltroAtivo[];
  aoRemover: (filtro: FiltroAtivo) => void;
  /** Quando dado, mostra "Limpar filtros" ao lado da lista. */
  aoLimparTudo?: () => void;
};

/** Os filtros escolhidos como botões removíveis ("Remover filtro: Nubank"). Sem filtro, nada. */
export function FiltrosAtivos({ ativos, aoRemover, aoLimparTudo }: Propriedades) {
  if (ativos.length === 0) return null;
  return (
    <div className={estilos.ativosComLimpar}>
      <ul className={estilos.ativos} aria-label="Filtros ativos">
        {ativos.map((filtro) => (
          <li key={`${filtro.grupo}:${filtro.valor}`} className={estilos.filtroAtivo}>
            <Botao
              variante="secundario"
              aria-label={`Remover filtro: ${filtro.rotulo}`}
              onClick={() => aoRemover(filtro)}
            >
              <span className={estilos.rotuloDoFiltro} title={filtro.rotulo}>
                {filtro.rotulo}
              </span>
              <Icone nome="fechar" tamanho={14} />
            </Botao>
          </li>
        ))}
      </ul>
      {aoLimparTudo && (
        <Botao variante="terciario" onClick={aoLimparTudo}>
          Limpar filtros
        </Botao>
      )}
    </div>
  );
}
