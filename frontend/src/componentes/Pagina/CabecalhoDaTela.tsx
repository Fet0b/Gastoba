import type { ReactNode, Ref } from "react";
import { Dica } from "../Dica/Dica";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./CabecalhoDaTela.module.css";

export type DadosDoCabecalho = {
  titulo: string;
  subtitulo: string;
  dica?: { assunto: string; texto: string };
  acao?: ReactNode;
  tituloRef?: Ref<HTMLHeadingElement>;
  tituloId?: string;
};

type Propriedades = DadosDoCabecalho & { acoes?: ReactNode };

export function CabecalhoDaTela({ titulo, subtitulo, dica, acao, acoes, tituloRef, tituloId }: Propriedades) {
  return (
    <header className={estilos.cabecalho} data-cabecalho-da-tela="">
      <div className={estilos.identificacao}>
        <div className={estilos.linhaDoTitulo}>
          <Titulo nivel="pagina" ref={tituloRef} id={tituloId} tabIndex={tituloRef ? -1 : undefined}>{titulo}</Titulo>
          {dica && <Dica assunto={dica.assunto}>{dica.texto}</Dica>}
        </div>
        <p className={estilos.subtitulo}>{subtitulo}</p>
      </div>
      {(acao || acoes) && <div className={estilos.acoes}>{acao}{acoes}</div>}
    </header>
  );
}
