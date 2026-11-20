import estilos from "./Contas.module.css";

/**
 * O texto de uma conta em uma linha (Art. XI.6.5): corta com reticências e guarda o texto inteiro na
 * dica (`title`). Use dentro de selos, colunas e células, onde o apelido de 40 caracteres não cabe.
 */
export function TextoDeConta({ texto }: { texto: string }) {
  return (
    <span className={estilos.textoDeConta} title={texto} data-conta-texto="">
      {texto}
    </span>
  );
}
