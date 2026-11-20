import type { Categoria } from "../../api/tipos";
import { Seletor } from "../Campo/Seletor";

export function CategoriaDoAporte({ categorias, valor, aoMudar }: {
  categorias: readonly Categoria[] | undefined;
  valor: string | null;
  aoMudar: (codigo: string) => void;
}) {
  return (
    <Seletor
      rotulo="Categoria de despesa (opcional)"
      valor={valor ?? ""}
      aoMudar={aoMudar}
      vazio="Nenhuma: só Liberdade financeira"
      opcoes={(categorias ?? []).filter((c) => !c.legada).map((c) => ({ valor: c.codigo, rotulo: c.nome }))}
    />
  );
}
