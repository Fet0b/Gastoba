import type { ReactNode, Ref } from "react";
import { Dica } from "../Dica/Dica";
import { Titulo } from "../Titulo/Titulo";
import estilos from "./CabecalhoDaTela.module.css";

export type DadosDoCabecalho = {
  titulo: string;
  subtitulo: string;
  dica?: { assunto: string; texto: string };
  /** A ação da página (por exemplo, um link de navegação): abaixo do subtítulo quando o espaço é curto. */
  acao?: ReactNode;
  /** No celular, quando é o único controle, o sininho acompanha a linha do título. */
  sininhoNaLinhaDoTitulo?: boolean;
  tituloRef?: Ref<HTMLHeadingElement>;
  tituloId?: string;
};

type Propriedades = DadosDoCabecalho & {
  /** Os controles da direita (seletor de mês, "Novo gasto", notificações): ficam numa linha só. */
  acoes?: ReactNode;
};

export function CabecalhoDaTela({ titulo, subtitulo, dica, acao, acoes, sininhoNaLinhaDoTitulo, tituloRef, tituloId }: Propriedades) {
  return (
    <div className={estilos.moldura}>
      <header className={estilos.cabecalho} data-cabecalho-da-tela="" data-sininho-unico={sininhoNaLinhaDoTitulo ? "" : undefined}>
        <div className={estilos.identificacao}>
          <div className={estilos.linhaDoTitulo}>
            <Titulo nivel="pagina" ref={tituloRef} id={tituloId} tabIndex={tituloRef ? -1 : undefined}>{titulo}</Titulo>
            {dica && <Dica assunto={dica.assunto}>{dica.texto}</Dica>}
          </div>
          <p className={estilos.subtitulo}>{subtitulo}</p>
        </div>
        {acao && <div className={estilos.acao} data-acao-terciaria="">{acao}</div>}
        {acoes && <div className={estilos.acoes}>{acoes}</div>}
      </header>
    </div>
  );
}
