import type { Conta } from "../../api/tipos";
import { identificacaoDaConta } from "../../contas/identificacao";
import { Metadados } from "../Metadados/Metadados";
import estilos from "./Contas.module.css";

type Propriedades = {
  conta: Conta;
  /** Para quando a tela já diz o tipo por outro meio (o selo do cartão de crédito). */
  semTipo?: boolean;
  /** Reserva a direita do rótulo para o menu "Mais ações" no canto do cartão. */
  reservarMenu?: boolean;
};

/**
 * Como uma conta se identifica na tela (Art. XI.5.6): o rótulo (apelido, senão nome no banco) em
 * uma linha com reticências e, abaixo, o tipo e o final do número. É o único componente que desenha
 * a identificação em bloco; em texto corrido use `textoDaConta`.
 */
export function IdentificacaoDaConta({ conta, semTipo = false, reservarMenu = false }: Propriedades) {
  const { rotulo, tipo, final } = identificacaoDaConta(conta);
  const metadados = [semTipo ? null : tipo, final].filter((parte): parte is string => parte !== null);
  return (
    <span className={estilos.identificacao}>
      <span
        className={reservarMenu ? `${estilos.nomeDaConta} ${estilos.reservaDoMenu}` : estilos.nomeDaConta}
        title={rotulo}
        data-rotulo=""
      >
        {rotulo}
      </span>
      {metadados.length > 0 && <Metadados>{metadados.map((parte) => parte)}</Metadados>}
    </span>
  );
}
