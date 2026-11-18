import type { AvisoDoMes as AvisoDoMesCalculado } from "../../inicio/avisoDoMes";
import { Botao } from "../Botao/Botao";
import { Icone } from "../Icone/Icone";
import estilos from "./Inicio.module.css";

type Propriedades = {
  aviso: AvisoDoMesCalculado | null;
  /** Leva ao Orçamento; sem ele, o cartão não tem a ação. */
  aoVerOrcamento?: () => void;
};

/**
 * O aviso único do mês (a pior meta) como um cartão: ícone, título curto, a frase e a ação. O
 * `role="status"` fica só no ícone com o texto (um por tela); o botão fica fora da região viva.
 */
export function AvisoDoMes({ aviso, aoVerOrcamento }: Propriedades) {
  if (aviso === null) return null;
  return (
    <div className={estilos.aviso} data-aviso-do-mes="" data-situacao={aviso.situacao}>
      <div className={estilos.avisoTexto} role="status" data-situacao={aviso.situacao}>
        <Icone nome="alerta" tamanho={20} />
        <div>
          <p className={estilos.avisoTitulo} data-titulo="">
            {aviso.situacao === "estourou" ? "Meta estourada" : "Meta perto do limite"}
          </p>
          <p className={estilos.avisoFrase}>{aviso.texto}</p>
        </div>
      </div>
      {aoVerOrcamento && (
        <Botao variante="terciario" seta className={estilos.avisoAcao} onClick={aoVerOrcamento}>
          Ver orçamento
        </Botao>
      )}
    </div>
  );
}
