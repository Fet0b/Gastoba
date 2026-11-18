import estilos from "./CategoriaDoAporte.module.css";
import { useId } from "react";
import type { Categoria } from "../../api/tipos";
export function CategoriaDoAporte({ categorias, valor, aoMudar }: {
  categorias: readonly Categoria[] | undefined;
  valor: string | null;
  aoMudar: (codigo: string) => void;
}) {
  const id = useId();
  return <div className={estilos.campo}><label htmlFor={id}>Categoria de despesa (opcional)</label><select id={id} value={valor ?? ""} onChange={e => aoMudar(e.target.value)}><option value="">Nenhuma: só Liberdade financeira</option>{categorias?.filter(c => !c.legada).map(c => <option key={c.codigo} value={c.codigo}>{c.nome}</option>)}</select></div>;
}
