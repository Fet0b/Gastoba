import estilos from "./AnelDeProgresso.module.css";

/**
 * As linhas diagonais do guardado para comprar: traço na cor atual (`currentColor`) sobre o
 * veludo, para o trecho nunca depender só da cor. Vai dentro de um `<defs>` do SVG; o `id` é de
 * quem o usa (`useId`).
 */
export function PadraoDoRachurado({ id }: { id: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="1.6" height="1.6" patternTransform="rotate(45)">
      <rect className={estilos.fundoDoPadrao} width="1.6" height="1.6" />
      <rect className={estilos.linhaDoPadrao} width="0.8" height="1.6" />
    </pattern>
  );
}
