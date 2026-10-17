import { Icone, type NomeDoIcone } from "../Icone/Icone";

import estilos from "./EstadoVazio.module.css";

type Propriedades = {
  icone: NomeDoIcone;
  titulo: string;
  texto?: string;
  acao?: { rotulo: string; aoClicar: () => void };
};

/** O que mostrar quando uma lista ainda não tem nada: ícone, título, texto e uma ação opcional. */
export function EstadoVazio({ icone, titulo, texto, acao }: Propriedades) {
  return (
    <div className={estilos.vazio}>
      <span className={estilos.icone}>
        <Icone nome={icone} tamanho={28} />
      </span>
      <p className={estilos.titulo}>{titulo}</p>
      {texto !== undefined && <p className={estilos.texto}>{texto}</p>}
      {acao && (
        <button type="button" className={estilos.acao} onClick={acao.aoClicar}>
          {acao.rotulo}
        </button>
      )}
    </div>
  );
}
