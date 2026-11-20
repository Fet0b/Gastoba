import { CORES_PRONTAS, nomeDaMatiz, semanticaProxima } from "../../aparencia/matiz";
import { Banner } from "../Banner/Banner";
import { CampoDeFaixa } from "../Campo/CampoDeFaixa";
import { GrupoDeOpcoes } from "../Campo/GrupoDeOpcoes";
import estilos from "./Aparencia.module.css";

type Propriedades = {
  matiz: number;
  aoMudar: (matiz: number) => void;
  desabilitado?: boolean;
};

/**
 * A cor dominante: oito cores prontas e a barra do espectro (qualquer matiz de 0 a 359, por
 * ponteiro, toque e teclado). Avisa, em texto, se a cor se parece com uma cor de significado fixo.
 */
export function EscolhaDaCor({ matiz, aoMudar, desabilitado = false }: Propriedades) {
  const semelhante = semanticaProxima(matiz);
  return (
    <div className={estilos.escolha}>
      <GrupoDeOpcoes
        legenda="Cor dominante"
        valor={String(matiz)}
        aoMudar={(valor) => aoMudar(Number(valor))}
        opcoes={CORES_PRONTAS.map(({ matiz: m, nome }) => ({ valor: String(m), titulo: nome }))}
        variante="cartao"
        desabilitado={desabilitado}
      />
      <CampoDeFaixa
        className={estilos.espectro}
        rotulo="Ajuste fino da cor"
        valor={matiz}
        minimo={0}
        maximo={359}
        aoMudar={aoMudar}
        desabilitado={desabilitado}
        aria-valuetext={`${nomeDaMatiz(matiz)}, ${matiz} graus`}
      />
      <p className={estilos.apoio}>
        Cor escolhida: {nomeDaMatiz(matiz)} ({matiz} graus).
      </p>
      {semelhante && (
        <Banner
          tom="atencao"
          titulo="Esta cor se parece com uma cor de significado fixo"
          texto={`O app usa uma cor parecida para ${semelhante}. Nada quebra: ela sempre vem com texto ou ícone.`}
        />
      )}
    </div>
  );
}
