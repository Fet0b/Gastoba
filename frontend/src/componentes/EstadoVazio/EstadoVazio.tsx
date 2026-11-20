import type { Ref } from "react";
import { Botao } from "../Botao/Botao";
import { Icone, type NomeDoIcone } from "../Icone/Icone";

import estilos from "./EstadoVazio.module.css";

type Propriedades = {
  icone: NomeDoIcone;
  titulo: string;
  descricao?: string;
  /** Dentro de diálogo ou painel que já é a moldura: sem o tracejado próprio. */
  semMoldura?: boolean;
  acao?: { ref?: Ref<HTMLButtonElement>; rotulo: string; aoClicar: () => void; variante?: "primario" | "secundario" };
};

/** O que mostrar quando uma lista ainda não tem nada: ícone, uma frase e uma ação opcional. */
export function EstadoVazio({ icone, titulo, descricao, acao, semMoldura }: Propriedades) {
  return (
    <div className={estilos.vazio} data-sem-moldura={semMoldura || undefined}>
      <span className={estilos.icone}>
        <Icone nome={icone} tamanho={24} />
      </span>
      <p className={estilos.titulo}>{titulo}</p>
      {descricao && <p className={estilos.descricao}>{descricao}</p>}
      {acao && (
        <Botao ref={acao.ref} variante={acao.variante ?? "secundario"} className={estilos.acao} onClick={acao.aoClicar}>
          {acao.rotulo}
        </Botao>
      )}
    </div>
  );
}
